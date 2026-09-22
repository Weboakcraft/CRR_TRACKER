/* ====== OAKCRAFT — CALL TRACKER + GOOGLE SHEETS SYNC + WHATSAPP ====== */
(function(O){
'use strict';
const C=()=>O.CONFIG;
let FU = null;   // memoised follow-up model
let AUTO = null; // auto-sync interval handle
const istTime = () => new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});

/* Shown wherever the app has to admit that nothing is being shared. */
const OFFLINE_HELP = `
  <p style="font-size:13px;line-height:1.75;color:var(--tx-2)">
    Right now every remark, call and follow-up is saved <b>only in this browser</b>
    (<code>localStorage</code>). Sharing a link does not share the data — your colleague's
    browser has its own separate copy, so neither of you can see the other's entries.</p>
  <p style="font-size:13px;line-height:1.75;color:var(--tx-2);margin-top:10px">
    To make the team share one log, give the app a backend:</p>
  <ol style="font-size:13px;line-height:1.85;color:var(--tx-2);margin:8px 0 0 18px">
    <li>Create a Google Sheet for the team.</li>
    <li>Extensions &rarr; Apps Script, paste in <code>backend/Code.gs</code> from this repo.</li>
    <li>Deploy &rarr; New deployment &rarr; <b>Web app</b>, execute as <b>Me</b>,
        access <b>Anyone</b>.</li>
    <li>Copy the <code>/exec</code> URL into <code>apiUrl</code> in <code>js/config.js</code>,
        then commit and push.</li>
  </ol>
  <p style="font-size:12.5px;color:var(--tx-3);margin-top:12px">
    Full walkthrough in <code>SETUP.md</code>, step 2. Until then, use
    <b>Backup JSON</b> on the Call Tracker to move a log between machines by hand —
    nothing is lost either way.</p>`;
O.offlineHelp = () => OFFLINE_HELP;

/* ---------------- Activity store — APPEND ONLY ----------------------------
   Nothing in here ever deletes an activity. A mistake is corrected by
   appending a record that points back at the old one, so the whole history
   — including the corrections — stays readable and auditable forever.
   The list is held in memory and written through, so a render that asks
   for it twenty times parses localStorage once.                          */
const KEY = 'activities';
let CACHE = null;      // parsed activity list
let STAMP = 0;         // bumped on every write — views memoise against it
let MAXSEQ = null;

function readAll(){
  if(CACHE) return CACHE;
  const raw = O.store.get(KEY, []);
  CACHE = Array.isArray(raw) ? raw : [];
  return CACHE;
}
/* A failed write means the browser refused to keep the record. That must
   never pass quietly — the operator is told and handed the file. */
function writeAll(list){
  CACHE = list; STAMP++;
  if(O.store.set(KEY, list)) return true;
  O.toast('Browser storage is full — your log could NOT be saved. Downloading a backup now.','err',9000);
  try{ O.download('oakcraft-activity-EMERGENCY-BACKUP.json', JSON.stringify(list,null,1), 'application/json'); }catch(e){}
  return false;
}
function newId(){ return 'A'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/* A void is a record of its own ('voids' points at the entry it cancels),
   so it travels through Google Sheets like any other row. The flag written
   on the original is only a local convenience — never trust it alone, or a
   void made on one device stays invisible on every other one. */
let VOIDED = null, VOIDED_AT = -1;
function voidedIds(){
  if(VOIDED && VOIDED_AT===STAMP) return VOIDED;
  VOIDED = new Set();
  readAll().forEach(a=>{ if(a.voids) VOIDED.add(a.voids); if(a.voided) VOIDED.add(a.id); });
  VOIDED_AT = STAMP;
  return VOIDED;
}
function nextSeq(list){
  if(MAXSEQ==null) MAXSEQ = list.reduce((m,x)=>Math.max(m, O.num(x.seq)), 0);
  return ++MAXSEQ;
}

const T = O.Tracker = {
  /* every record ever written, oldest first */
  all(){ return readAll(); },
  /* what the log shows by default — voided entries stay on record but are
     folded out of the working views unless explicitly asked for */
  live(){ const v=voidedIds(); return readAll().filter(a=>!v.has(a.id) && a.type!=='void'); },
  isVoided(a){ return voidedIds().has(a && a.id); },
  stamp(){ return STAMP; },
  forCustomer(name){ return readAll().filter(a=>a.customer_name===name)
    .sort((a,b)=> b.ts.localeCompare(a.ts)); },

  add(a){
    const list = readAll().slice();
    a.id = a.id || newId();
    a.seq = nextSeq(list);
    a.ts = a.ts || new Date().toISOString();
    a.created_at = a.created_at || a.ts;
    a.day = a.day || O.dateKey(new Date(a.ts));
    a.agent = a.agent || O.store.get('agent', C().defaultAgent);
    a.synced = false;
    list.push(a); writeAll(list);
    this.push(a);
    return a;
  },

  /* Corrections are appends, not deletions. The original record keeps its
     place in the timeline and is marked, and a void entry is appended
     alongside it so the correction itself is on record too. */
  void(id, reason){
    const list = readAll().slice();
    const i = list.findIndex(x=>x.id===id);
    if(i<0) return null;
    list[i] = Object.assign({}, list[i], {
      voided:true, voided_at:new Date().toISOString(),
      voided_by:O.store.get('agent', C().defaultAgent), void_reason:reason||'' });
    writeAll(list);
    return this.add({ customer_name:list[i].customer_name, sr_no:list[i].sr_no,
      type:'void', voids:id, disposition:'Entry Voided', note:reason||'' });
  },
  /* kept so no caller can hard-delete by habit — it voids instead */
  remove(id, reason){ return this.void(id, reason || 'Removed from the log'); },

  /* ---- Follow-ups -------------------------------------------------------
     A follow-up is born when an activity carries a `followup` date, and it
     is closed by a LATER activity pointing back at it with `closes`.
     Rescheduling closes one and opens the next, so the whole promise chain
     survives. Derived in a single pass and memoised against the write
     stamp, so switching tabs costs nothing.                              */
  followups(){
    if(FU && FU.stamp===STAMP) return FU;
    const acts = readAll();
    const today = O.today();

    const closedBy = new Map();
    acts.forEach(a=>{ if(a.closes) closedBy.set(a.closes, a); });

    const ix = O.customerIndex ? O.customerIndex() : null;
    const all = [];
    acts.forEach(a=>{
      if(!a.followup || voidedIds().has(a.id)) return;
      const close = closedBy.get(a.id) || null;
      const cust = ix ? (a.sr_no!=null && ix.bySr.get(a.sr_no)) || ix.byName.get(a.customer_name) : null;
      const diff = O.dayDiff(today, a.followup);
      all.push({
        id: a.id, source: a,
        customer_name: a.customer_name, sr_no: a.sr_no,
        due: a.followup, due_in: diff, due_label: O.dueLabel(diff),
        promised_on: a.ts, promised_day: a.day || a.ts.slice(0,10),
        agent: a.agent, disposition: a.disposition, note: a.note,
        value: O.num(a.value), type: a.type,
        phone: a.phone, phones: cust ? (cust.phones||[]) : (a.phone?[a.phone]:[]),
        has_phone: !!(cust ? (cust.phones||[]).length : a.phone),
        state: a.state || (cust?cust.state:'') || '',
        segment: a.segment || (cust?cust.seg_label:'') || '',
        seg_label: a.segment || (cust?cust.seg_label:'') || '',
        seg_code: cust?cust.seg_code:'',
        total_value: O.num(a.total_value || (cust?cust.total_value:0)),
        upside: cust?O.num(cust.upside):0,
        recommended_action: cust?cust.recommended_action:'',
        done: !!close, closed_at: close?close.ts:null,
        outcome: close?(close.disposition||close.type||''):'',
        outcome_note: close?(close.note||''):'',
        rescheduled_to: close?(close.followup||''):''
      });
    });

    /* newest promise per customer wins; older open ones are superseded but
       still listed under their own tab — a promise is never erased */
    const newest = new Map();
    all.forEach(f=>{ if(f.done) return;
      const cur = newest.get(f.customer_name);
      if(!cur || f.promised_on > cur.promised_on) newest.set(f.customer_name, f); });
    all.forEach(f=>{ f.superseded = !f.done && newest.get(f.customer_name) !== f; });

    const bucket = f => f.done ? 'done' : f.superseded ? 'superseded'
      : f.due_in < 0 ? 'overdue' : f.due_in === 0 ? 'today' : f.due_in === 1 ? 'tomorrow'
      : f.due_in <= 7 ? 'week' : 'later';
    all.forEach(f=>{ f.bucket = bucket(f); });

    const by = k => all.filter(f=>f.bucket===k);
    FU = { stamp:STAMP, all,
      overdue:by('overdue'), today:by('today'), tomorrow:by('tomorrow'),
      week:by('week'), later:by('later'), done:by('done'), superseded:by('superseded') };
    FU.open = FU.overdue.concat(FU.today, FU.tomorrow, FU.week, FU.later);
    FU.dueNow = FU.overdue.concat(FU.today);
    return FU;
  },
  dueNowCount(){ return this.followups().dueNow.length; },

  /* Closing a follow-up appends the outcome — the promise itself is never
     edited. Passing a next date opens the next link in the chain. */
  closeFollowup(fuId, out){
    const f = this.followups().all.find(x=>x.id===fuId);
    if(!f) return null;
    return this.add({
      customer_name: f.customer_name, sr_no: f.sr_no,
      type: out.type || 'followup', closes: fuId,
      disposition: out.disposition || 'Connected — Follow-up',
      phone: out.phone || f.phone || '',
      value: O.num(out.value), followup: out.next || '',
      note: out.note || '', state: f.state, segment: f.segment,
      total_value: f.total_value });
  },

  /* ---- Backup / restore — history outlives this browser ---- */
  backup(){
    const list = readAll();
    O.download('oakcraft-activity-history-'+O.today()+'.json',
      JSON.stringify({app:'oakcraft-crr-tracker', exported_at:new Date().toISOString(),
        count:list.length, activities:list}, null, 1), 'application/json');
    O.toast(`Backed up all ${list.length} activities`);
  },
  /* merge only — an existing id is never overwritten and never dropped */
  restore(json){
    let rows;
    try{ const d=JSON.parse(json); rows = Array.isArray(d)?d:d.activities; }
    catch(e){ O.toast('That file is not a valid backup','err'); return 0; }
    if(!Array.isArray(rows)){ O.toast('No activities found in that file','err'); return 0; }
    const list = readAll().slice(), have = new Set(list.map(a=>a.id));
    let added = 0;
    rows.forEach(r=>{ if(r && r.id && !have.has(r.id)){ list.push(r); have.add(r.id); added++; } });
    if(added){ MAXSEQ = null; list.sort((a,b)=>String(a.ts||'').localeCompare(String(b.ts||''))); writeAll(list); }
    O.toast(added?`Restored ${added} activities (${rows.length-added} already on record)`
                 :'Nothing new — every activity in that file is already here');
    return added;
  },

  stats(){
    const a=this.live(), today=O.today();
    const pos=C().positiveDispositions;
    const fu=this.followups();
    return {
      total:a.length,
      allRecords:readAll().length,
      voided:voidedIds().size,
      today:a.filter(x=>(x.day||x.ts.slice(0,10))===today).length,
      connected:a.filter(x=>/^Connected/.test(x.disposition||'')).length,
      positive:a.filter(x=>pos.includes(x.disposition)).length,
      wa:a.filter(x=>x.type==='whatsapp').length,
      followups:fu.open.length,
      dueNow:fu.dueNow.length,
      overdue:fu.overdue.length,
      dueToday:fu.today.length,
      doneFollowups:fu.done.length,
      pipeline:a.reduce((s,x)=>s+O.num(x.value),0),
      unsynced:a.filter(x=>!x.synced).length
    };
  },

  /* ---- Google Sheets backend (Apps Script Web App) ---- */
  online(){ return !!C().apiUrl; },
  push(act){
    if(!this.online()) return Promise.resolve({offline:true});
    return fetch(C().apiUrl, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action:'log', key:C().apiKey, payload:act})
    }).then(r=>r.json()).then(res=>{
      if(res && res.ok){
        const list=readAll().slice(); const i=list.findIndex(x=>x.id===act.id);
        if(i>-1){ list[i]=Object.assign({},list[i],{synced:true}); writeAll(list); }
        O.setSync('on','Synced to Google Sheets');
      }
      return res;
    }).catch(e=>{ O.setSync('off','Sheets unreachable — saved locally'); return {error:String(e)}; });
  },
  syncAll(quiet){
    if(!this.online()){
      if(!quiet) O.modal('Sharing is not switched on yet', OFFLINE_HELP,
        [{label:'Close',cls:'ghost',act:()=>O.closeModal()}]);
      return; }
    const pend=readAll().filter(a=>!a.synced);
    if(!pend.length){ if(!quiet){ O.toast('Everything already synced'); this.pull().then(a=>{ if(a) O.render(); }); } return; }
    if(!quiet) O.toast(`Syncing ${pend.length} activities…`,'info');
    fetch(C().apiUrl,{method:'POST',mode:'cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'bulk',key:C().apiKey,payload:pend})})
      .then(r=>r.json()).then(res=>{
        if(res&&res.ok){ const ids=new Set(pend.map(p=>p.id));
          const list=readAll().map(a=> ids.has(a.id)?Object.assign({},a,{synced:true}):a );
          writeAll(list);
          if(!quiet) O.toast(`${pend.length} activities pushed to Google Sheets`);
          O.setSync('on','Synced · '+istTime());
          this.pull().then(()=>O.render());
        } else if(!quiet) O.toast('Sync failed: '+(res.error||'unknown'),'err',4000);
      }).catch(e=>{ if(!quiet) O.toast('Sync failed — check the Web App URL & deployment access','err',4200);
        O.setSync('off','Sheets unreachable'); });
  },
  pull(){
    if(!this.online()) return Promise.resolve();
    return fetch(C().apiUrl+'?action=list&key='+encodeURIComponent(C().apiKey))
      .then(r=>r.json()).then(res=>{
        if(!res||!res.ok||!Array.isArray(res.rows)) return;
        const local=readAll().slice(), ids=new Set(local.map(a=>a.id));
        let added=0;
        res.rows.forEach(r=>{ if(r.id && !ids.has(r.id)){ r.synced=true; local.push(r); added++; } });
        if(added){ MAXSEQ=null; writeAll(local); }
        O.setSync('on', added?`+${added} from the team · ${istTime()}`:`In sync · ${istTime()}`);
        return added;
      }).catch(()=>{ O.setSync('off','Sheets unreachable — showing local copy'); return 0; });
  },

  /* ---- Live sharing -----------------------------------------------------
     Two people on the same URL only see each other's work if this browser
     keeps asking the sheet what changed. Without it a colleague's remark
     sits in Google Sheets until someone reloads the page.                */
  autoSync(){
    if(AUTO) return;                       // already running
    const every = Math.max(15, O.num(C().syncIntervalSec) || 45) * 1000;
    const tick = (quiet)=>{
      if(!this.online() || document.hidden) return;
      const pending = readAll().filter(a=>!a.synced);
      if(pending.length) this.syncAll(true);          // retry what never landed
      this.pull().then(added=>{ if(added) O.render(); });
    };
    AUTO = setInterval(tick, every);
    /* coming back to the tab is the moment you most want fresh data */
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) tick(); });
    window.addEventListener('online', ()=>tick());
    tick();
  },

  /* ---- Log-call modal ---- */
  openLog(rec){
    const c = O.findCustomer(rec) || rec;
    const past = this.forCustomer(c.customer_name);
    const body = `
      <div class="fld"><label>Customer</label>
        <input value="${O.esc(c.customer_name)}" readonly style="font-weight:600"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
        <div class="fld"><label>Activity Type</label>
          <select id="lg-type">
            <option value="call">&#128222; Phone Call</option>
            <option value="whatsapp">&#128172; WhatsApp</option>
            <option value="visit">&#128100; Field Visit</option>
            <option value="email">&#9993; Email</option>
            <option value="quote">&#128196; Quotation</option>
          </select></div>
        <div class="fld"><label>Phone Used</label>
          <select id="lg-phone">${(c.phones||[]).map(p=>`<option>${O.esc(p)}</option>`).join('')||'<option value="">No phone on file</option>'}</select></div>
      </div>
      <div class="fld"><label>Disposition / Outcome</label>
        <select id="lg-disp">${C().dispositions.map(d=>`<option>${O.esc(d)}</option>`).join('')}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
        <div class="fld"><label>Expected Order Value (₹)</label>
          <input id="lg-val" type="number" min="0" step="1000" placeholder="0"></div>
        <div class="fld"><label>Next Follow-up Date</label>
          <input id="lg-fu" type="date"></div>
      </div>
      <div class="fld"><label>Notes</label>
        <textarea id="lg-note" placeholder="What was discussed, objections, who you spoke to…"></textarea></div>
      ${past.length?`<div class="dr-sec-t" style="margin-top:6px">Previous Activity (${past.length})</div>
        <div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:9px">
        ${past.slice(0,20).map(a=>`<div style="padding:8px 11px;border-bottom:1px solid var(--line);font-size:12px">
          <div style="display:flex;gap:8px;align-items:center">
            <span class="tag ${C().positiveDispositions.includes(a.disposition)?'ok':'mut'}">${O.esc(a.disposition||a.type)}</span>
            <span style="color:var(--tx-3);font-size:11px;margin-left:auto">${new Date(a.ts).toLocaleString('en-IN')}</span></div>
          ${a.note?`<div style="color:var(--tx-2);margin-top:4px">${O.esc(a.note)}</div>`:''}</div>`).join('')}</div>`:''}`;

    O.modal('Log Activity', body, [
      {label:'Cancel', cls:'ghost', act:()=>O.closeModal()},
      {label:'&#128172; Log + WhatsApp', cls:'wa', act:()=>{ save(true); }},
      {label:'Save Activity', cls:'primary', act:()=>{ save(false); }}
    ]);

    function save(alsoWA){
      const a = T.add({
        customer_name: c.customer_name, sr_no: c.sr_no,
        type: O.$('#lg-type').value, phone: O.$('#lg-phone').value,
        disposition: O.$('#lg-disp').value, value: +O.$('#lg-val').value||0,
        followup: O.$('#lg-fu').value||'', note: O.$('#lg-note').value.trim(),
        state: c.state||'', segment: c.seg_label||'', total_value: O.num(c.total_value)
      });
      O.closeModal();
      O.toast(T.online() ? 'Activity saved & shared with the team'
                         : 'Saved on THIS DEVICE only — the team cannot see it', T.online()?'':'warn', 4200);
      if(alsoWA && c.phones && c.phones.length) O.quickWA(c);
      O.render();
    }
  }
};

/* ---------------- WhatsApp composer ---------------- */
O.quickWA = function(rec){
  const c = O.findCustomer(rec) || rec;
  if(!c.phones || !c.phones.length){
    O.toast('No phone on file — trace it from the GST portal / IndiaMART first','warn',3800); return; }
  const tpls = C().waTemplates;
  const auto = /DEALER/i.test(c.recommended_action||'') ? 'dealer'
    : /VISIT/i.test(c.recommended_action||'') ? 'visit'
    : /TENDER/i.test(c.recommended_action||'') ? 'tender'
    : /CATALOGUE/i.test(c.recommended_action||'') ? 'catalogue'
    : O.num(c.days_since)>180 ? 'winback' : 'intro';
  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
      <div class="fld"><label>Send To</label>
        <select id="wa-p">${c.phones.map(p=>`<option>${O.esc(p)}</option>`).join('')}</select></div>
      <div class="fld"><label>Your Name</label>
        <input id="wa-agent" value="${O.esc(O.store.get('agent',C().defaultAgent))}"></div>
    </div>
    <div class="fld"><label>Template</label>
      <select id="wa-t">${tpls.map(t=>`<option value="${t.id}"${t.id===auto?' selected':''}>${O.esc(t.name)}</option>`).join('')}</select></div>
    <div class="fld"><label>Message (edit freely — placeholders already filled with real data)</label>
      <textarea id="wa-m" style="min-height:140px"></textarea></div>
    ${c.pitch_angle?`<div class="dr-note"><b style="color:var(--acc)">Pitch angle from your data:</b><br>${O.esc(c.pitch_angle)}</div>`:''}`;

  O.modal('WhatsApp — '+c.customer_name, body, [
    {label:'Copy Text', cls:'ghost', act:()=>{
      navigator.clipboard?.writeText(O.$('#wa-m').value).then(()=>O.toast('Message copied')); }},
    {label:'&#128172; Open WhatsApp', cls:'wa', act:()=>{
      const phone=O.$('#wa-p').value, msg=O.$('#wa-m').value;
      O.store.set('agent', O.$('#wa-agent').value);
      T.add({customer_name:c.customer_name, sr_no:c.sr_no, type:'whatsapp', phone:phone,
        disposition:'WhatsApp Sent', note:msg.slice(0,300), state:c.state||'',
        segment:c.seg_label||'', total_value:O.num(c.total_value)});
      O.wa.open(phone, msg); O.closeModal(); O.toast('WhatsApp opened & activity logged'); O.render();
    }}
  ]);
  const ta = O.$('#wa-m');
  const fill = ()=>{ const t=tpls.find(x=>x.id===O.$('#wa-t').value);
    O.store.set('agent', O.$('#wa-agent').value); ta.value = O.wa.render(t.body, c); };
  O.$('#wa-t').addEventListener('change', fill);
  O.$('#wa-agent').addEventListener('input', O.debounce(fill,400));
  fill();
};

/* ---------------- Bulk WhatsApp campaign ---------------- */
O.bulkWA = function(rows, title){
  const withPhone = rows.filter(r=>r.phones && r.phones.length);
  const tpls=C().waTemplates;
  const body = `
    <div class="dr-note" style="margin-bottom:14px">
      <b>${O.fmt.n(withPhone.length)}</b> of ${O.fmt.n(rows.length)} selected accounts have a real phone number on file.
      Combined value <b>${O.fmt.short(rows.reduce((s,r)=>s+O.num(r.total_value),0))}</b>.
      WhatsApp opens one chat at a time — your browser will block a mass auto-open, so this
      walks you through them in sequence and logs each one.</div>
    <div class="fld"><label>Template</label>
      <select id="bw-t">${tpls.map(t=>`<option value="${t.id}">${O.esc(t.name)}</option>`).join('')}</select></div>
    <div class="fld"><label>Your Name</label>
      <input id="bw-agent" value="${O.esc(O.store.get('agent',C().defaultAgent))}"></div>
    <div class="fld"><label>Preview (first account: ${O.esc(withPhone[0]?.customer_name||'—')})</label>
      <textarea id="bw-prev" readonly style="min-height:110px;background:var(--bg-4)"></textarea></div>
    <div class="fld"><label>Export list instead</label>
      <button class="btn sm" id="bw-csv">&#8681; Download campaign CSV (name, phone, message)</button></div>`;
  O.modal('Bulk WhatsApp — '+(title||'Campaign'), body, [
    {label:'Close', cls:'ghost', act:()=>O.closeModal()},
    {label:'&#9654; Start Sequence', cls:'wa', act:()=>{ O.closeModal(); runSeq(); }}
  ]);
  const upd=()=>{ const t=tpls.find(x=>x.id===O.$('#bw-t').value);
    O.store.set('agent',O.$('#bw-agent').value);
    O.$('#bw-prev').value = withPhone[0]? O.wa.render(t.body, withPhone[0]) : ''; };
  O.$('#bw-t').addEventListener('change',upd);
  O.$('#bw-agent').addEventListener('input',O.debounce(upd,400));
  O.$('#bw-csv').addEventListener('click',()=>{
    const t=tpls.find(x=>x.id===O.$('#bw-t').value);
    O.csv.download('oakcraft-wa-campaign.csv', O.csv.build(withPhone,[
      {key:'customer_name',label:'Customer'},
      {key:'phone',label:'Phone',get:r=>r.phones[0]},
      {key:'wa',label:'WhatsApp Link',get:r=>O.wa.link(r.phones[0], O.wa.render(t.body,r))},
      {key:'msg',label:'Message',get:r=>O.wa.render(t.body,r)},
      {key:'total_value',label:'Total Value'},{key:'state',label:'State'}]));
    O.toast(`Campaign CSV with ${withPhone.length} real contacts downloaded`); });
  upd();

  function runSeq(){
    let i=0; const t=tpls.find(x=>x.id===(O.store.get('lastTpl')||tpls[0].id));
    const tpl = tpls.find(x=>x.id===O.$('#bw-t')?.value) || t;
    step();
    function step(){
      if(i>=withPhone.length){ O.toast(`Campaign finished — ${i} messages sent`); O.render(); return; }
      const c=withPhone[i], msg=O.wa.render(tpl.body,c);
      O.modal(`Send ${i+1} of ${withPhone.length}`,
        `<div class="fld"><label>Customer</label><input readonly value="${O.esc(c.customer_name)}"></div>
         <div class="fld"><label>Phone</label><input readonly value="${O.esc(c.phones[0])}"></div>
         <div class="fld"><label>Message</label><textarea id="sq-m" style="min-height:120px">${O.esc(msg)}</textarea></div>`,
        [{label:'Skip',cls:'ghost',act:()=>{i++;O.closeModal();setTimeout(step,120);}},
         {label:'&#128172; Send & Next',cls:'wa',act:()=>{
           T.add({customer_name:c.customer_name,sr_no:c.sr_no,type:'whatsapp',phone:c.phones[0],
             disposition:'WhatsApp Sent',note:O.$('#sq-m').value.slice(0,300),state:c.state||'',
             segment:c.seg_label||'',total_value:O.num(c.total_value)});
           O.wa.open(c.phones[0], O.$('#sq-m').value);
           i++; O.closeModal(); setTimeout(step,300); }}]);
    }
  }
};
})(window.OAK);
