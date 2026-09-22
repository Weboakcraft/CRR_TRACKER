/* ====== OAKCRAFT — CALL TRACKER + GOOGLE SHEETS SYNC + WHATSAPP ====== */
(function(O){
'use strict';
const C=()=>O.CONFIG;

/* ---------------- Activity store (local-first, Sheets-synced) ------------- */
const T = O.Tracker = {
  all(){ return O.store.get('activities', []); },
  forCustomer(name){ return this.all().filter(a=>a.customer_name===name)
    .sort((a,b)=> b.ts.localeCompare(a.ts)); },
  add(a){
    const list=this.all();
    a.id = a.id || ('A'+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
    a.ts = a.ts || new Date().toISOString();
    a.agent = a.agent || O.store.get('agent', C().defaultAgent);
    a.synced = false;
    list.push(a); O.store.set('activities', list);
    this.push(a);
    return a;
  },
  remove(id){ O.store.set('activities', this.all().filter(a=>a.id!==id)); },
  stats(){
    const a=this.all(), today=new Date().toISOString().slice(0,10);
    const pos=C().positiveDispositions;
    return {
      total:a.length,
      today:a.filter(x=>x.ts.slice(0,10)===today).length,
      connected:a.filter(x=>/^Connected/.test(x.disposition||'')).length,
      positive:a.filter(x=>pos.includes(x.disposition)).length,
      wa:a.filter(x=>x.type==='whatsapp').length,
      followups:a.filter(x=>x.followup && x.followup>=today).length,
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
        const list=this.all(); const i=list.findIndex(x=>x.id===act.id);
        if(i>-1){ list[i].synced=true; O.store.set('activities',list); }
        O.setSync('on','Synced to Google Sheets');
      }
      return res;
    }).catch(e=>{ O.setSync('off','Sheets unreachable — saved locally'); return {error:String(e)}; });
  },
  syncAll(){
    if(!this.online()){ O.toast('Set CONFIG.apiUrl in js/config.js to enable Google Sheets sync','warn',4200); return; }
    const pend=this.all().filter(a=>!a.synced);
    if(!pend.length){ O.toast('Everything already synced'); return; }
    O.toast(`Syncing ${pend.length} activities…`,'info');
    fetch(C().apiUrl,{method:'POST',mode:'cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'bulk',key:C().apiKey,payload:pend})})
      .then(r=>r.json()).then(res=>{
        if(res&&res.ok){ const list=this.all();
          list.forEach(a=>{ if(pend.some(p=>p.id===a.id)) a.synced=true; });
          O.store.set('activities',list);
          O.toast(`${pend.length} activities pushed to Google Sheets`); O.setSync('on','Synced');
          O.render();
        } else O.toast('Sync failed: '+(res.error||'unknown'),'err',4000);
      }).catch(e=>{ O.toast('Sync failed — check the Web App URL & deployment access','err',4200);
        O.setSync('off','Sheets unreachable'); });
  },
  pull(){
    if(!this.online()) return Promise.resolve();
    return fetch(C().apiUrl+'?action=list&key='+encodeURIComponent(C().apiKey))
      .then(r=>r.json()).then(res=>{
        if(!res||!res.ok||!Array.isArray(res.rows)) return;
        const local=this.all(), ids=new Set(local.map(a=>a.id));
        let added=0;
        res.rows.forEach(r=>{ if(r.id && !ids.has(r.id)){ r.synced=true; local.push(r); added++; } });
        if(added){ O.store.set('activities',local); O.toast(`Pulled ${added} activities from Google Sheets`); }
        O.setSync('on','Connected to Google Sheets');
      }).catch(()=>O.setSync('off','Offline — local storage only'));
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
      O.toast('Activity saved'+(T.online()?' & pushed to Google Sheets':' locally'));
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
