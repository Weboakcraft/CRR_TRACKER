/* ====== OAKCRAFT — DAILY CALLING REPORT ======
   Built only from the activity log: every party whose status was updated
   on the chosen day (calls, WhatsApp, visits, quotes, follow-up closures),
   rolled up to ONE row per party, plus the follow-up book as it stood at
   the end of that day. Renders on screen, as a formatted PDF, and shares
   the PDF to the management numbers over WhatsApp.                    */
(function(O){
'use strict';
const C = () => O.CONFIG;
const R = O.Report = {};
const Ch = () => O.Charts;

function cfg(){
  return Object.assign({
    shareTo: [],
    notConnectedDispositions: ['No Answer','Wrong Number','Switched Off','Busy / Call Later'],
    connectedDispositions: ['Visit Scheduled','Quotation Sent'],
    hotDispositions: ['Connected — Order Expected','Connected — Interested','Visit Scheduled','Quotation Sent'],
    lostDispositions: ['Connected — Not Interested','Connected — Already Sourcing'],
    messageDispositions: ['WhatsApp Sent','Catalogue Sent'],
    autoSend: false
  }, C().report || {});
}

const pad2 = n => String(n).padStart(2,'0');
/* local calendar day of an activity — never the UTC slice of the stamp */
const dayOf = a => a.day || (a.ts ? O.dateKey(new Date(a.ts)) : '');
const timeOf = ts => { const d=new Date(ts); return isNaN(d) ? '' : pad2(d.getHours())+':'+pad2(d.getMinutes()); };
const hourOf = ts => { const d=new Date(ts); return isNaN(d) ? null : d.getHours(); };
const pct = (a,b) => b ? Math.round(a/b*100) : 0;
const shortOutcome = d => String(d||'').replace(/^Connected — /,'');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dm = k => { const [,m,d]=String(k||'').split('-').map(Number); return m ? d+' '+MON[m-1] : ''; };
const longDate = k => { const [y,m,d]=String(k).split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}); };

/* Each activity lands in exactly one bucket. */
function classify(a, rc){
  const d = a.disposition || '';
  if(rc.notConnectedDispositions.includes(d)) return 'nc';
  if(/^Connected/.test(d) || rc.connectedDispositions.includes(d)) return 'conn';
  if(rc.messageDispositions.includes(d) || a.type==='whatsapp' || a.type==='email') return 'msg';
  if(a.type==='visit') return 'conn';
  return 'other';
}
const STATUS = {conn:'Connected', nc:'Not Connected', msg:'Messaged', other:'Updated'};

/* ------------------------------------------------------------------
   MODEL
   ------------------------------------------------------------------ */
R.build = function(date, agent){
  const T = O.Tracker, rc = cfg();
  date = date || O.today(); agent = agent || 'all';

  const dayActs = T.live().filter(a=>a.type!=='void' && dayOf(a)===date);
  const agents = O.uniq(dayActs,'agent');
  const acts = (agent==='all' ? dayActs : dayActs.filter(a=>a.agent===agent))
    .slice().sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));

  /* ---- one row per party ---- */
  const map = new Map();
  acts.forEach(a=>{
    const k = a.customer_name || '(unnamed)';
    let p = map.get(k);
    if(!p){
      const cust = O.findCustomer(a) || {};
      p = { customer_name:a.customer_name, sr_no:a.sr_no, acts:[],
        phones: (cust.phones && cust.phones.length) ? cust.phones : (a.phone?[a.phone]:[]),
        state: a.state || cust.state || '', segment: a.segment || cust.seg_label || '',
        total_value: O.num(cust.total_value || a.total_value), upside: O.num(cust.upside),
        _cls:new Set(), agents:new Set() };
      p.has_phone = p.phones.length>0;
      map.set(k, p);
    }
    p.acts.push(a); p._cls.add(classify(a, rc)); if(a.agent) p.agents.add(a.agent);
  });

  const parties = Array.from(map.values()).map(p=>{
    const last = p.acts[p.acts.length-1];
    const cls = p._cls.has('conn') ? 'conn' : p._cls.has('nc') ? 'nc' : p._cls.has('msg') ? 'msg' : 'other';
    const withFu = p.acts.filter(a=>a.followup);
    const withVal = p.acts.filter(a=>O.num(a.value)>0);
    const notes = p.acts.filter(a=>a.note && a.type!=='whatsapp').map(a=>
      (p.acts.length>1 ? timeOf(a.ts)+' ' : '') + a.note.trim());
    /* the day's final word on the party decides hot / lost */
    const lastConn = p.acts.slice().reverse().find(a=>classify(a,rc)==='conn') || last;
    const outcome = cls==='conn' ? lastConn.disposition : last.disposition || last.type;
    const temp = rc.hotDispositions.includes(outcome) ? 'hot'
      : rc.lostDispositions.includes(outcome) ? 'lost' : cls==='nc' ? 'nc' : 'neutral';
    return Object.assign(p, {
      phone: last.phone || p.phones[0] || '',
      first_time: timeOf(p.acts[0].ts), time: timeOf(last.ts), ts: last.ts,
      touches: p.acts.length,
      calls: p.acts.filter(a=>a.type==='call').length,
      nc_attempts: p.acts.filter(a=>classify(a,rc)==='nc').length,
      cls, status: STATUS[cls], disposition: outcome, temp,
      note: notes.join(' | '),
      followup: withFu.length ? withFu[withFu.length-1].followup : '',
      value: withVal.length ? O.num(withVal[withVal.length-1].value) : 0,
      closed_fu: p.acts.filter(a=>a.closes).length,
      agent: Array.from(p.agents).join(', '),
      nc_reason: cls==='nc' ? (p.acts.slice().reverse().find(a=>classify(a,rc)==='nc')||{}).disposition : ''
    });
  }).sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));

  const by = c => parties.filter(p=>p.cls===c);
  const conn = by('conn'), nc = by('nc'), msg = by('msg');
  const hot = parties.filter(p=>p.temp==='hot'), lost = parties.filter(p=>p.temp==='lost');
  const touched = new Set(parties.map(p=>p.customer_name));

  /* ---- follow-up book as it stood at the end of `date` ----
     A follow-up counts as actioned if it was closed by that day OR the
     party was contacted that day — calling someone is doing the follow-up
     even if the caller used "Log Activity" instead of "Close".         */
  const F = T.followups();
  const closeDay = f => f.closed_at ? O.dateKey(new Date(f.closed_at)) : null;
  const mine = F.all.filter(f=>agent==='all' || f.agent===agent);
  /* a promise superseded by a call made that day was actioned, not dropped */
  const scoped = mine.filter(f=>!f.superseded);
  const openAt = f => !f.done || closeDay(f) > date;
  const rel = f => { const n=O.dayDiff(date, f.due);
    return Object.assign({}, f, {due_in:n, due_label:O.dueLabel(n), actioned: touched.has(f.customer_name)}); };
  const dueToday = mine.filter(f=>f.due===date && (!f.superseded || touched.has(f.customer_name))).map(rel);
  const dueActioned = dueToday.filter(f=>!openAt(f) || f.actioned);
  const dueOpen = dueToday.filter(f=>openAt(f) && !f.actioned);
  const overdue = scoped.filter(f=>f.due<date && openAt(f)).map(rel).filter(f=>!f.actioned)
    .sort((a,b)=>a.due.localeCompare(b.due));
  const closedToday = mine.filter(f=>f.done && closeDay(f)===date);
  const pending = dueOpen.concat(overdue);
  const newFu = parties.filter(p=>p.followup);
  const noNext = conn.filter(p=>p.temp!=='lost' && !p.followup);
  const noNotes = conn.filter(p=>!p.note);

  /* ---- mixes ---- */
  const count = (list, key) => { const m=new Map();
    list.forEach(x=>{ const k=key(x)||'—'; m.set(k,(m.get(k)||0)+1); });
    return Array.from(m, ([k,v])=>({key:k, value:v})).sort((a,b)=>b.value-a.value); };
  const rank = {hot:0, neutral:1, lost:2, nc:3};
  const tempOf = new Map(parties.map(p=>[shortOutcome(p.disposition), p.temp]));
  const outcomeMix = count(parties, p=>shortOutcome(p.disposition))
    .map(x=>Object.assign(x,{temp:tempOf.get(x.key)||'neutral'}))
    .sort((a,b)=>b.value-a.value || rank[a.temp]-rank[b.temp]);
  const ncMix = count(nc, p=>p.nc_reason);

  const hours = new Map();
  acts.forEach(a=>{
    const c = classify(a, rc); if(c!=='conn' && c!=='nc') return;
    const h = hourOf(a.ts); if(h==null) return;
    const x = hours.get(h) || {h, dials:0, conn:0}; x.dials++; if(c==='conn') x.conn++; hours.set(h,x); });
  const hourly = Array.from(hours.values()).sort((a,b)=>a.h-b.h)
    .map(x=>Object.assign(x,{label:pad2(x.h)+':00–'+pad2((x.h+1)%24)+':00', rate:pct(x.conn,x.dials)}));
  const ranked = hourly.filter(x=>x.dials>=3).sort((a,b)=>b.rate-a.rate || b.dials-a.dials);
  const bestHour = ranked.length>=2 ? ranked[0] : null;

  const agentRows = O.uniq(parties.flatMap(p=>Array.from(p.agents).map(a=>({a}))),'a').map(name=>{
    const ps = parties.filter(p=>p.agents.has(name));
    const c = ps.filter(p=>p.cls==='conn').length, n = ps.filter(p=>p.cls==='nc').length;
    return { agent:name, parties:ps.length, conn:c, nc:n, rate:pct(c,c+n),
      hot:ps.filter(p=>p.temp==='hot').length, fu:ps.filter(p=>p.followup).length,
      value:ps.reduce((s,p)=>s+p.value,0) };
  }).sort((a,b)=>b.parties-a.parties);

  const k = {
    parties: parties.length, touches: acts.length,
    calls: acts.filter(a=>a.type==='call').length,
    conn: conn.length, nc: nc.length, msg: msg.length,
    rate: pct(conn.length, conn.length+nc.length),
    hot: hot.length, lost: lost.length,
    pipeline: parties.reduce((s,p)=>s+p.value,0),
    hotValue: hot.reduce((s,p)=>s+p.value,0),
    dueToday: dueToday.length, dueActioned: dueActioned.length, dueOpen: dueOpen.length,
    overdue: overdue.length, pending: pending.length,
    closedToday: closedToday.length, newFu: newFu.length,
    noNext: noNext.length, noNotes: noNotes.length,
    first: parties.length ? acts[0] && timeOf(acts[0].ts) : '',
    last: parties.length ? timeOf(acts[acts.length-1].ts) : ''
  };

  const m = { date, agent, agents, dateLabel:longDate(date), isToday: date===O.today(),
    generated: new Date(), scope: agent==='all' ? (agents.length>1?`All team (${agents.length} agents)`:'All team') : agent,
    parties, conn, nc, msg, hot, lost, newFu, noNext, noNotes,
    dueToday, dueOpen, overdue, pending, closedToday,
    outcomeMix, ncMix, hourly, bestHour, agentRows, k };
  m.insights = insights(m);
  return m;
};

/* ------------------------------------------------------------------
   ANALYST READ-OUT — plain sentences a manager can act on
   ------------------------------------------------------------------ */
function insights(m){
  const k = m.k, out = [];
  const say = (tone, text) => out.push({tone, text});
  const names = list => list.slice(0,3).map(p=>p.customer_name).join(', ') + (list.length>3?` +${list.length-3} more`:'');

  if(!k.parties){
    say('warn', `No party was called or updated on ${m.dateLabel}${m.agent!=='all'?' by '+m.agent:''}.`);
    if(k.pending) say('bad', `${k.pending} follow-up${k.pending===1?' is':'s are'} still pending (${k.dueOpen} due that day, ${k.overdue} overdue).`);
    return out;
  }
  say('info', `${k.parties} parties worked${m.agent==='all'&&m.agents.length>1?` by ${m.agents.length} agents`:''} between ${k.first} and ${k.last} — ${k.touches} status update${k.touches===1?'':'s'} logged.`);

  const dialled = k.conn + k.nc;
  if(dialled){
    const tone = k.rate>=60 ? 'ok' : k.rate>=40 ? 'warn' : 'bad';
    say(tone, `Connect rate ${k.rate}%: ${k.conn} of ${dialled} dialled parties picked up.`+
      (k.rate<40 ? ' Well below a healthy 40–60% — check number quality and call timing.' : ''));
  }
  if(m.bestHour) say('info', `Best calling window: ${m.bestHour.label} (${m.bestHour.conn} of ${m.bestHour.dials} connected, ${m.bestHour.rate}%). Schedule retries around it.`);

  if(k.hot) say('ok', `${k.hot} hot lead${k.hot===1?'':'s'} (${names(m.hot)})`+
    (k.hotValue ? ` carrying ${O.fmt.short(k.hotValue)} of expected orders.` : '.'));
  else if(k.conn) say('warn', 'No hot lead came out of today\'s connected calls.');

  if(k.nc){
    const parts = m.ncMix.map(x=>`${x.value} ${x.key}`).join(', ');
    say('warn', `${k.nc} not connected — ${parts}. They are on the retry list.`);
    const wrong = m.ncMix.find(x=>/Wrong Number/i.test(x.key));
    if(wrong) say('bad', `${wrong.value} wrong number${wrong.value===1?'':'s'} — correct them in the master data before the next calling round.`);
  }

  if(k.dueToday) say(k.dueOpen ? 'warn' : 'ok',
    `Follow-up discipline: ${k.dueToday-k.dueOpen} of ${k.dueToday} follow-ups due that day were actioned (${pct(k.dueToday-k.dueOpen,k.dueToday)}%).`);
  if(k.overdue) say('bad', `${k.overdue} overdue follow-up${k.overdue===1?' is':'s are'} still untouched — oldest due ${O.fmt.date(m.overdue[0].due)}.`);
  if(k.noNext) say('warn', `${k.noNext} connected part${k.noNext===1?'y has':'ies have'} no next follow-up date (${names(m.noNext)}). Set one so they don't go cold.`);
  if(k.noNotes) say('warn', `${k.noNotes} connected call${k.noNotes===1?' has':'s have'} no discussion notes recorded.`);
  if(k.lost) say('info', `${k.lost} declined (Not Interested / Already Sourcing): ${names(m.lost)}.`);
  if(k.newFu) say('info', `${k.newFu} new follow-up${k.newFu===1?'':'s'} booked from these calls.`);
  return out;
}

/* ------------------------------------------------------------------
   WHATSAPP SUMMARY TEXT
   ------------------------------------------------------------------ */
R.summaryText = function(m){
  const k = m.k;
  return [
    `*${C().orgName} — Daily Calling Report*`,
    `${m.dateLabel} · ${m.scope}`,
    ``,
    `Parties called: *${k.parties}*`,
    `Connected: ${k.conn} · Not connected: ${k.nc}${(k.conn+k.nc)?` (${k.rate}% connect rate)`:''}`,
    `Hot leads: ${k.hot}${k.pipeline?` · Expected value: ${O.fmt.short(k.pipeline)}`:''}`,
    `Follow-ups pending: ${k.pending}${k.overdue?` (${k.overdue} overdue)`:''} · New booked: ${k.newFu}`,
    ``,
    `Full party-wise report attached (PDF).`
  ].join('\n');
};

R.fileName = m => `${C().orgName}-Daily-Calling-Report-${m.date}${m.agent!=='all'?'-'+m.agent.replace(/[^\w]+/g,'-'):''}.pdf`;

/* ------------------------------------------------------------------
   PDF
   ------------------------------------------------------------------ */
const PC = { ink:'#111827', ink2:'#4b5563', ink3:'#9ca3af', line:'#e5e7eb', zebra:'#f9fafb',
  band:'#0b0e14', acc:'#d9930f', ok:'#0f9d6e', warn:'#c77a06', bad:'#d82b3c', info:'#1668c9',
  tile:'#f3f4f6', head:'#1f2937' };

R.pdf = function(m){
  const doc = O.PDF.create();
  const M = 34, W = doc.W - M*2, TOP = 44, BOTTOM = doc.H - 40;
  let y = 0;
  const ensure = h => { if(y + h > BOTTOM){ doc.addPage(); y = TOP; return true; } return false; };

  /* ---- header band ---- */
  doc.rect(0,0,doc.W,86,{fill:PC.band});
  doc.rect(0,86,doc.W,3,{fill:PC.acc});
  doc.text(String(C().orgName).toUpperCase()+'  ·  CUSTOMER REVIVAL TRACKER', M, 20, {size:8, bold:true, color:PC.acc});
  doc.text('Daily Calling Report', M, 34, {size:21, bold:true, color:'#ffffff'});
  doc.text(m.dateLabel+'   |   '+m.scope, M, 62, {size:10, color:'#cbd5e1'});
  doc.text('Generated', doc.W-M, 24, {size:7.5, color:'#94a3b8', align:'right'});
  doc.text(m.generated.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    doc.W-M, 35, {size:9, bold:true, color:'#ffffff', align:'right'});
  if(m.k.parties) doc.text(`Calling window ${m.k.first} - ${m.k.last}`, doc.W-M, 62, {size:9, color:'#cbd5e1', align:'right'});
  y = 104;

  /* ---- KPI tiles ---- */
  const k = m.k;
  const tiles = [
    ['Parties Called', k.parties, `${k.touches} updates logged`, PC.ink],
    ['Connected', k.conn, `${k.rate}% connect rate`, PC.ok],
    ['Not Connected', k.nc, 'on the retry list', PC.bad],
    ['Hot Leads', k.hot, k.hotValue?O.fmt.short(k.hotValue)+' expected':'order / visit / quote', PC.acc],
    ['Follow-ups Pending', k.pending, `${k.dueOpen} due · ${k.overdue} overdue`, k.pending?PC.bad:PC.ok],
    ['Follow-ups Actioned', `${k.dueToday-k.dueOpen}/${k.dueToday}`, `${k.closedToday} closed in log`, PC.info],
    ['New Follow-ups Set', k.newFu, k.noNext?`${k.noNext} connected w/o next step`:'every connect has a next step', PC.info],
    ['Expected Pipeline', O.fmt.short(k.pipeline), `${k.lost} declined`, PC.ok]
  ];
  const cols4 = 4, gap = 8, tw = (W - gap*(cols4-1))/cols4, th = 54;
  tiles.forEach((t,i)=>{
    const cx = M + (i%cols4)*(tw+gap), cy = y + Math.floor(i/cols4)*(th+gap);
    doc.rect(cx,cy,tw,th,{fill:PC.tile});
    doc.rect(cx,cy,3,th,{fill:t[3]});
    doc.text(t[0].toUpperCase(), cx+10, cy+8, {size:6.8, bold:true, color:PC.ink2});
    doc.text(String(t[1]), cx+10, cy+19, {size:17, bold:true, color:t[3]});
    doc.text(t[2], cx+10, cy+41, {size:7, color:PC.ink2});
  });
  y += 2*th + gap + 16;

  const section = (title, sub) => {
    ensure(40);
    doc.text(title, M, y, {size:12, bold:true, color:PC.ink});
    if(sub) doc.text(sub, doc.W-M, y+2.5, {size:7.5, color:PC.ink3, align:'right'});
    y += 17; doc.line(M, y, doc.W-M, y, {color:PC.acc, lw:1}); y += 7;
  };

  /* ---- insights ---- */
  section('Key Insights', 'what the numbers say');
  const toneC = {ok:PC.ok, warn:PC.warn, bad:PC.bad, info:PC.info};
  m.insights.forEach(it=>{
    const lines = doc.wrap(it.text, W-16, 9);
    ensure(lines.length*12+4);
    doc.rect(M, y+2.5, 5, 5, {fill:toneC[it.tone]||PC.info});
    lines.forEach((ln,i)=>doc.text(ln, M+14, y+i*12, {size:9, color:PC.ink}));
    y += lines.length*12 + 4;
  });
  y += 8;

  /* ---- generic table with wrap, zebra and repeated header ---- */
  function table(cols, rows, o){
    o = o || {};
    const fs = o.size || 8, lh = fs*1.28, padX = 4, padY = 4;
    const total = cols.reduce((s,c)=>s+(c.w||0),0);
    const flex = cols.filter(c=>!c.w).length;
    cols.forEach(c=>{ c._w = c.w || (W-total)/Math.max(1,flex); });
    const header = () => {
      doc.rect(M, y, W, lh+padY*2, {fill:PC.head});
      let x = M;
      cols.forEach(c=>{ const ax = c.align==='right' ? x+c._w-padX : x+padX;
        doc.text(c.label, ax, y+padY, {size:fs-0.5, bold:true, color:'#ffffff', align:c.align==='right'?'right':'left'});
        x += c._w; });
      y += lh + padY*2;
    };
    if(!rows.length){
      ensure(24);
      doc.text(o.empty || 'Nothing to show.', M, y+2, {size:9, color:PC.ink3});
      y += 22; return;
    }
    ensure(lh*3+padY*4); header();
    rows.forEach((r,ri)=>{
      const cells = cols.map(c=>{
        const v = c.get(r, ri); const txt = v==null||v==='' ? '-' : String(v);
        const sub = c.sub ? c.sub(r) : '';
        const main = doc.wrap(txt, c._w-padX*2, fs, !!c.bold);
        const subs = sub ? doc.wrap(sub, c._w-padX*2, fs-1.2) : [];
        return {main, subs};
      });
      const lines = Math.max(...cells.map(c=>c.main.length + c.subs.length*0.9));
      const h = lines*lh + padY*2;
      if(ensure(h)) header();
      if(ri%2) doc.rect(M, y, W, h, {fill:PC.zebra});
      let x = M;
      cols.forEach((c,ci)=>{
        const cell = cells[ci];
        const color = c.color ? c.color(r) : PC.ink;
        const right = c.align==='right', ax = right ? x+c._w-padX : x+padX;
        cell.main.forEach((ln,li)=>doc.text(ln, ax, y+padY+li*lh,
          {size:fs, bold:!!c.bold, color, align:right?'right':'left'}));
        cell.subs.forEach((ln,li)=>doc.text(ln, ax, y+padY+cell.main.length*lh+li*lh*0.9,
          {size:fs-1.2, color:PC.ink3, align:right?'right':'left'}));
        x += c._w;
      });
      y += h;
      doc.line(M, y, doc.W-M, y, {color:PC.line, lw:0.5});
    });
    y += 14;
  }

  /* ---- outcome + follow-up summary side by side ---- */
  if(k.parties || k.pending){
    section('Outcome Summary', 'one row per party, by final outcome of the day');
    ensure(Math.max(m.outcomeMix.length, 7)*15 + 20);
    const half = (W-18)/2, startY = y;
    const rowH = 15;
    const maxV = Math.max(1, ...m.outcomeMix.map(x=>x.value));
    let ly = startY;
    doc.text('OUTCOME', M, ly, {size:7, bold:true, color:PC.ink2});
    doc.text('PARTIES', M+half, ly, {size:7, bold:true, color:PC.ink2, align:'right'});
    ly += 12;
    m.outcomeMix.forEach(x=>{
      doc.text(x.key, M, ly, {size:8.5, color:PC.ink});
      const bx = M+118, bw = half-118-44;
      doc.rect(bx, ly+1.5, bw, 6, {fill:PC.tile});
      doc.rect(bx, ly+1.5, Math.max(1,bw*x.value/maxV), 6,
        {fill:{hot:PC.ok, lost:PC.bad, nc:PC.warn}[x.temp] || PC.info});
      doc.text(`${x.value}  (${pct(x.value,k.parties)}%)`, M+half, ly, {size:8.5, bold:true, color:PC.ink, align:'right'});
      ly += rowH;
    });
    if(!m.outcomeMix.length){ doc.text('No calls logged.', M, ly, {size:8.5, color:PC.ink3}); ly += rowH; }

    const rx = M+half+18; let ry = startY;
    doc.text('FOLLOW-UP BOOK', rx, ry, {size:7, bold:true, color:PC.ink2});
    doc.text('COUNT', rx+half, ry, {size:7, bold:true, color:PC.ink2, align:'right'});
    ry += 12;
    [['Due on this day', k.dueToday, PC.ink],
     ['Actioned (called or closed)', k.dueToday-k.dueOpen, PC.ok],
     ['Due today - still pending', k.dueOpen, k.dueOpen?PC.bad:PC.ink],
     ['Overdue - still pending', k.overdue, k.overdue?PC.bad:PC.ink],
     ['Closed in the log today', k.closedToday, PC.ink],
     ['New follow-ups booked', k.newFu, PC.info],
     ['Connected, no next step', k.noNext, k.noNext?PC.warn:PC.ink]].forEach(([l,v,c])=>{
      doc.text(l, rx, ry, {size:8.5, color:PC.ink});
      doc.text(String(v), rx+half, ry, {size:8.5, bold:true, color:c, align:'right'});
      doc.line(rx, ry+11.5, rx+half, ry+11.5, {color:PC.line, lw:0.4});
      ry += rowH;
    });
    y = Math.max(ly, ry) + 12;
  }

  /* ---- party-wise detail ---- */
  const statusColor = p => p.cls==='conn' ? PC.ok : p.cls==='nc' ? PC.bad : PC.info;
  const outColor = p => p.temp==='hot' ? PC.ok : p.temp==='lost' ? PC.bad : PC.ink;
  section('Party-wise Call Details', `${k.parties} ${k.parties===1?'party':'parties'} · in calling order`);
  table([
    {label:'#', w:18, get:(r,i)=>i+1, color:()=>PC.ink3},
    {label:'Party', w:100, bold:true, get:r=>r.customer_name, sub:r=>[r.phone, r.state].filter(Boolean).join(' · ')},
    {label:'Time', w:32, get:r=>r.touches>1 ? `${r.first_time}-${r.time}` : r.time,
      sub:r=>r.touches>1 ? `${r.touches} tries` : ''},
    {label:'Status', w:62, get:r=>r.status, color:statusColor, bold:true},
    {label:'Outcome', w:70, get:r=>shortOutcome(r.disposition), color:outColor},
    {label:'What was discussed', get:r=>r.note || (r.cls==='nc' ? 'Could not reach' : 'No notes recorded')},
    {label:'Next F/U', w:42, get:r=>r.followup ? dm(r.followup) : '-'},
    {label:'Exp. Value', w:58, align:'right', get:r=>r.value ? O.fmt.rs(r.value) : '-'}
  ], m.parties, {empty:'No party was called or updated on this day.'});

  /* ---- retry list ---- */
  section('Not Connected - Retry List', `${k.nc} ${k.nc===1?'party':'parties'}`);
  table([
    {label:'#', w:18, get:(r,i)=>i+1, color:()=>PC.ink3},
    {label:'Party', get:r=>r.customer_name, bold:true},
    {label:'Phone', w:92, get:r=>r.phone || (r.phones||[]).join(', ')},
    {label:'Reason', w:96, get:r=>r.nc_reason, color:()=>PC.bad},
    {label:'Attempts', w:50, align:'right', get:r=>r.nc_attempts},
    {label:'Last try', w:46, get:r=>r.time},
    {label:'Agent', w:80, get:r=>r.agent}
  ], m.nc, {empty:'Every dialled party was reached.'});

  /* ---- pending follow-ups ---- */
  section('Pending Follow-ups', `${k.dueOpen} due · ${k.overdue} overdue · not contacted on this day`);
  table([
    {label:'#', w:18, get:(r,i)=>i+1, color:()=>PC.ink3},
    {label:'Party', w:118, bold:true, get:r=>r.customer_name, sub:r=>(r.phones||[])[0]||r.phone||''},
    {label:'Due', w:40, get:r=>dm(r.due)},
    {label:'Status', w:62, get:r=>r.due_in<0 ? `${-r.due_in}d overdue` : 'Due today',
      color:r=>r.due_in<0?PC.bad:PC.warn, bold:true},
    {label:'Last outcome', w:78, get:r=>shortOutcome(r.disposition)},
    {label:'Promise / note', get:r=>r.note},
    {label:'Agent', w:60, get:r=>r.agent}
  ], m.pending, {empty:'No follow-up is pending. Nice.'});

  /* ---- agents ---- */
  if(m.agentRows.length>1){
    section('Agent Performance');
    table([
      {label:'Agent', bold:true, get:r=>r.agent},
      {label:'Parties', w:52, align:'right', get:r=>r.parties},
      {label:'Connected', w:60, align:'right', get:r=>r.conn, color:()=>PC.ok},
      {label:'Not conn.', w:56, align:'right', get:r=>r.nc, color:()=>PC.bad},
      {label:'Connect %', w:58, align:'right', get:r=>r.rate+'%'},
      {label:'Hot', w:40, align:'right', get:r=>r.hot},
      {label:'F/U set', w:48, align:'right', get:r=>r.fu},
      {label:'Exp. Value', w:70, align:'right', get:r=>r.value?O.fmt.rs(r.value):'-'}
    ], m.agentRows);
  }

  /* ---- footer on every page ---- */
  const n = doc.pageCount;
  for(let i=0;i<n;i++){
    doc.setPage(i);
    doc.line(M, doc.H-28, doc.W-M, doc.H-28, {color:PC.line, lw:0.6});
    doc.text(`${C().orgName} CRR Tracker  ·  Daily Calling Report  ·  ${m.dateLabel}  ·  ${m.scope}`,
      M, doc.H-22, {size:7, color:PC.ink3});
    doc.text(`Page ${i+1} of ${n}`, doc.W-M, doc.H-22, {size:7, color:PC.ink3, align:'right'});
  }
  return doc.output({title:`Daily Calling Report - ${m.dateLabel}`, author:C().orgName});
};

R.download = function(m){
  const blob = R.pdf(m);
  const a = O.el('a',{href:URL.createObjectURL(blob), download:R.fileName(m)});
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  O.toast('PDF report downloaded');
};

/* ------------------------------------------------------------------
   SHARE ON WHATSAPP
   1. Automatic: if the Apps Script backend has WhatsApp Cloud API keys,
      the PDF is sent to every number in CONFIG.report.shareTo in one go.
   2. Phone / tablet: the system share sheet opens with the PDF already
      attached — pick WhatsApp, tick the two contacts, send.
   3. Desktop: the PDF is downloaded and a WhatsApp chat opens for each
      number with the summary typed in, ready for the file to be dropped.
   ------------------------------------------------------------------ */
const toWa = n => O.wa.normalize(n);

R.share = function(m){
  const rc = cfg(), to = rc.shareTo || [];
  const blob = R.pdf(m), name = R.fileName(m), text = R.summaryText(m);
  let file = null;
  try{ file = new File([blob], name, {type:'application/pdf'}); }catch(e){}
  const canFiles = !!(file && navigator.canShare && navigator.canShare({files:[file]}));

  if(rc.autoSend && O.Tracker.online()){
    O.toast('Sending the report on WhatsApp…','info');
    return autoSend(blob, name, text, m).then(res=>{
      if(res && res.ok){ stamp(m, 'auto'); O.toast(`Report sent on WhatsApp to ${res.sent||to.length} number${(res.sent||to.length)===1?'':'s'}`); return; }
      /* the button tap is no longer "fresh", so the share sheet needs a new one */
      fallbackModal(m, blob, name, text, file, canFiles,
        `Automatic sending did not go through: <b>${O.esc((res&&res.error)||'no reply')}</b>. Share it from this device instead.`);
    });
  }
  if(canFiles) return nativeShare(m, file, text);
  return fallbackModal(m, blob, name, text, file, false);
};

function nativeShare(m, file, text){
  const to = cfg().shareTo || [];
  O.toast(`Pick WhatsApp, then select ${to.join(' & ')}`, 'info', 5000);
  return navigator.share({files:[file], title:file.name, text})
    .then(()=>{ stamp(m,'share'); O.toast('Report shared'); })
    .catch(e=>{ if(e && e.name==='AbortError') return;
      fallbackModal(m, file, file.name, text, file, false); });
}

function fallbackModal(m, blob, name, text, file, canFiles, why){
  const to = cfg().shareTo || [];
  let downloaded = false;
  const dl = () => { if(downloaded) return; downloaded = true;
    const a = O.el('a',{href:URL.createObjectURL(blob), download:name});
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
  O.modal('Share Report on WhatsApp', `
    ${why?`<div class="dr-note" style="border-left-color:var(--warn);margin-bottom:12px">${why}</div>`:''}
    <div class="dr-note" style="margin-bottom:12px">
      <b>${O.esc(name)}</b> has been downloaded to this computer.
      ${canFiles?'':'This browser cannot hand a file straight to WhatsApp, so '}open each chat below —
      the summary is already typed in — then <b>attach or drag the PDF</b> into the chat and send.</div>
    <div style="display:grid;gap:8px">
      ${to.map(n=>`<button class="btn wa" data-wa="${O.esc(n)}" style="justify-content:center;height:40px">
        &#128172; Open WhatsApp — ${O.esc(n)}</button>`).join('')}
      ${canFiles?`<button class="btn" id="rs-native" style="justify-content:center;height:40px">&#128228; Use the device share sheet</button>`:''}
    </div>
    <div class="fld" style="margin-top:14px"><label>Message sent with the report</label>
      <textarea readonly style="min-height:150px;background:var(--bg-4)">${O.esc(text)}</textarea></div>`,
    [{label:'Close',cls:'ghost',act:()=>O.closeModal()},
     {label:'&#8681; Download PDF again',cls:'',act:()=>{ downloaded=false; dl(); }}]);
  dl();
  O.$$('[data-wa]').forEach(b=>b.addEventListener('click',()=>{
    window.open(O.wa.link(b.dataset.wa, text), '_blank', 'noopener');
    b.innerHTML = '&#10004; Opened — '+O.esc(b.dataset.wa); stamp(m,'manual'); }));
  const nat = O.$('#rs-native');
  if(nat) nat.addEventListener('click',()=>{ O.closeModal(); nativeShare(m, file, text); });
}

function autoSend(blob, name, text, m){
  return new Promise(res=>{
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => res('');
    r.readAsDataURL(blob);
  }).then(b64=>{
    if(!b64) return {ok:false, error:'Could not read the PDF'};
    return fetch(C().apiUrl, {method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action:'sendReport', key:C().apiKey,
        payload:{filename:name, caption:text, date:m.date, base64:b64}})})
      .then(r=>r.json()).catch(e=>({ok:false, error:String(e.message||e)}));
  });
}

function stamp(m, how){
  const log = O.store.get('reportShares', []);
  log.push({date:m.date, agent:m.agent, at:new Date().toISOString(), how});
  O.store.set('reportShares', log.slice(-60));
  if(O.route.page==='reports') O.render();
}
/* sidebar badge: parties updated today, memoised against the write stamp */
let TC = null;
R.todayCount = function(){
  const key = O.Tracker.stamp()+'|'+O.today();
  if(TC && TC.key===key) return TC.n;
  const t = O.today(), s = new Set();
  O.Tracker.live().forEach(a=>{ if(a.type!=='void' && dayOf(a)===t) s.add(a.customer_name); });
  TC = {key, n:s.size};
  return s.size;
};
R.lastShare = date => (O.store.get('reportShares', [])||[]).filter(s=>s.date===date).pop() || null;

/* ------------------------------------------------------------------
   VIEW
   ------------------------------------------------------------------ */
const V = O.Views;
V.reports = function(host){
  const today = O.today();
  const date = O.reportDate || today;
  const agent = O.reportAgent || 'all';
  const m = R.build(date, agent);
  const k = m.k;
  const rc = cfg();
  const last = R.lastShare(date);
  const agentsAll = O.uniq(O.Tracker.live().filter(a=>dayOf(a)===date), 'agent');

  const kpi = (label, value, sub, color, bg, bar) => `<div class="kpi" style="--kc:${color};--kb:${bg}">
    <div class="kpi-top"><div class="kpi-label">${O.esc(label)}</div></div>
    <div class="kpi-val">${value}</div>${sub?`<div class="kpi-sub">${sub}</div>`:''}
    ${bar!=null?`<div class="kpi-bar"><i style="width:${Math.min(100,bar)}%"></i></div>`:''}</div>`;
  const toneVar = {ok:'var(--ok)', warn:'var(--warn)', bad:'var(--bad)', info:'var(--info)'};

  host.innerHTML = `<div class="page-head">
      <div class="page-eyebrow">Reporting</div>
      <h1 class="page-title">Daily Calling Report</h1>
      <div class="page-sub">Every party whose status was updated on ${O.esc(m.dateLabel)}${m.isToday?' (today)':''} — who was called, what was discussed, who could not be reached and which follow-ups are still pending. Built live from the activity log.</div>
    </div>
    ${O.Tracker.online()?'':`<div class="callout" style="border-left-color:var(--warn);margin-bottom:16px">
      <b style="color:var(--warn)">&#9888; Only this browser's entries are in this report.</b>
      The team log is not shared yet, so calls logged on other devices are missing.</div>`}
    <div class="rep-bar">
      <label>Date <input type="date" id="rDate" class="fsel" value="${date}" max="${today}"></label>
      <label>Agent <select id="rAgent" class="fsel">
        <option value="all">All team</option>
        ${agentsAll.map(a=>`<option${a===agent?' selected':''}>${O.esc(a)}</option>`).join('')}
        ${agent!=='all'&&!agentsAll.includes(agent)?`<option selected>${O.esc(agent)}</option>`:''}
      </select></label>
      <button class="btn sm" id="rToday" ${m.isToday?'disabled':''}>Today</button>
      <button class="btn sm" id="rPrev">&#8249; Previous day</button>
      <div class="rep-actions">
        <button class="btn sm" id="rPdf">&#8681; Download PDF</button>
        <button class="btn wa" id="rShare" title="Send the PDF to ${O.esc((rc.shareTo||[]).join(' & '))} on WhatsApp">&#128172; Share Report</button>
      </div>
    </div>
    <div class="rep-share-note">Sends to <b>${(rc.shareTo||[]).map(O.esc).join('</b> &amp; <b>')||'—'}</b>${
      last?` &middot; last shared ${new Date(last.at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`:''}</div>

    <div class="kpis">
      ${kpi('Parties Called', O.fmt.n(k.parties), `<span>${O.fmt.n(k.touches)} updates &middot; ${O.fmt.n(k.calls)} calls</span>`, 'var(--acc)','var(--acc-dim)')}
      ${kpi('Connected', O.fmt.n(k.conn), `<span>${k.rate}% connect rate</span>`, 'var(--ok)','var(--ok-dim)', k.rate)}
      ${kpi('Not Connected', O.fmt.n(k.nc), `<span>No answer / off / busy / wrong</span>`, 'var(--bad)','var(--bad-dim)', pct(k.nc,k.conn+k.nc))}
      ${kpi('Hot Leads', O.fmt.n(k.hot), `<span>${k.hotValue?O.fmt.short(k.hotValue)+' expected':'Order / visit / quote'}</span>`, 'var(--acc)','var(--acc-dim)')}
      ${kpi('Follow-ups Pending', O.fmt.n(k.pending), `<span style="color:${k.overdue?'var(--bad)':'inherit'}">${k.dueOpen} due &middot; ${k.overdue} overdue</span>`, k.pending?'var(--bad)':'var(--ok)', k.pending?'var(--bad-dim)':'var(--ok-dim)')}
      ${kpi('Follow-ups Actioned', `${O.fmt.n(k.dueToday-k.dueOpen)}<span style="font-size:15px;color:var(--tx-3)"> / ${O.fmt.n(k.dueToday)}</span>`, `<span>${k.closedToday} closed in the log</span>`, 'var(--info)','var(--info-dim)', k.dueToday?pct(k.dueToday-k.dueOpen,k.dueToday):null)}
      ${kpi('New Follow-ups Set', O.fmt.n(k.newFu), `<span style="color:${k.noNext?'var(--warn)':'inherit'}">${k.noNext?k.noNext+' connected without a next step':'Every connect has a next step'}</span>`, 'var(--info)','var(--info-dim)')}
      ${kpi('Expected Pipeline', O.fmt.short(k.pipeline), `<span>${k.lost} declined today</span>`, 'var(--ok)','var(--ok-dim)')}
    </div>

    <div class="grid g-21">
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Key Insights</div>
        <div class="panel-desc">An analyst's read of the day — the same points go into the PDF</div></div></div>
        <div class="panel-body"><ul class="ins-list">${m.insights.map(i=>
          `<li><i style="background:${toneVar[i.tone]||'var(--info)'}"></i><span>${O.esc(i.text)}</span></li>`).join('')}</ul></div></div>
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Outcome Mix</div>
        <div class="panel-desc">Parties by final outcome of the day</div></div></div>
        <div class="panel-body" id="rMix"></div></div>
    </div>

    <div class="panel"><div class="panel-head">
      <div><div class="panel-title">Party-wise Call Details</div>
        <div class="panel-desc">${O.fmt.n(k.parties)} ${k.parties===1?'party':'parties'} in calling order — one row per party, every note from the day. Click a party for the full record.</div></div></div>
      <div class="panel-body flush" id="rParties"></div></div>

    <div class="grid g2">
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Not Connected — Retry List</div>
        <div class="panel-desc">${O.fmt.n(k.nc)} ${k.nc===1?'party':'parties'} to try again${m.bestHour?`, ideally ${O.esc(m.bestHour.label)}`:''}</div></div></div>
        <div class="panel-body flush" id="rNc"></div></div>
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Calls By Hour</div>
        <div class="panel-desc">Dials per hour and how many connected</div></div></div>
        <div class="panel-body" id="rHour"></div></div>
    </div>

    <div class="panel"><div class="panel-head">
      <div><div class="panel-title">Pending Follow-ups</div>
        <div class="panel-desc">${O.fmt.n(k.dueOpen)} due on this day and ${O.fmt.n(k.overdue)} overdue that nobody contacted — carry these into tomorrow</div></div>
      <div class="panel-tools"><button class="btn sm" id="rGoFu">Open Follow-Ups &#8250;</button></div></div>
      <div class="panel-body flush" id="rPend"></div></div>

    ${m.agentRows.length>1?`<div class="panel"><div class="panel-head"><div><div class="panel-title">Agent Performance</div>
      <div class="panel-desc">Who called whom, and how it went</div></div></div>
      <div class="panel-body flush" id="rAgents"></div></div>`:''}`;

  /* ---- party table: full notes, wrapped, not clipped ---- */
  const stTag = p => `<span class="tag ${p.cls==='conn'?'ok':p.cls==='nc'?'bad':'info'}">${O.esc(p.status)}</span>`;
  const outTag = p => `<span class="tag ${p.temp==='hot'?'ok':p.temp==='lost'?'bad':'mut'}">${O.esc(shortOutcome(p.disposition))}</span>`;
  O.$('#rParties').innerHTML = m.parties.length ? `<div class="tbl-wrap"><table class="dt rep-dt"><thead><tr>
      <th>#</th><th>Party</th><th>Time</th><th>Status</th><th>Outcome</th><th>What was discussed</th>
      <th>Next F/U</th><th class="num">Exp. Value</th><th>Agent</th></tr></thead><tbody>
    ${m.parties.map((p,i)=>`<tr data-n="${O.esc(p.customer_name||'')}" style="cursor:pointer">
      <td style="color:var(--tx-3)">${i+1}</td>
      <td><div class="cell-name">${O.esc(p.customer_name)}</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--fm)">${O.esc(p.phone||'no phone')}${p.state?' · '+O.esc(p.state):''}</div></td>
      <td style="white-space:nowrap">${p.touches>1?`${p.first_time}–${p.time}<div style="font-size:10.5px;color:var(--tx-3)">${p.touches} updates</div>`:p.time}</td>
      <td>${stTag(p)}</td><td>${outTag(p)}</td>
      <td class="rep-note">${p.note?O.esc(p.note):`<span style="color:var(--tx-3)">${p.cls==='nc'?'Could not reach':'No notes recorded'}</span>`}</td>
      <td>${p.followup?`<span class="tag warn">${O.fmt.dateShort(p.followup)}</span>`:(p.cls==='conn'&&p.temp!=='lost'?'<span class="tag bad" title="Connected but no next step">none</span>':'—')}</td>
      <td class="num">${p.value?O.fmt.rs(p.value):'—'}</td>
      <td style="font-size:12px;color:var(--tx-2)">${O.esc(p.agent||'—')}</td></tr>`).join('')}
    </tbody></table></div>`
    : `<div class="empty" style="padding:40px"><div class="empty-ico">&#128222;</div>
       <b>No party was called or updated on this day</b>Log a call from any list and it appears here immediately.</div>`;
  O.$$('#rParties tbody tr[data-n]').forEach(tr=>tr.addEventListener('click',()=>{
    const p = m.parties.find(x=>x.customer_name===tr.dataset.n); if(p) O.openCustomer(p); }));

  Ch().hbars(O.$('#rMix'), m.outcomeMix.map(x=>({key:x.key, value:x.value,
    color: rc.lostDispositions.map(shortOutcome).includes(x.key)?'var(--bad)'
      : rc.hotDispositions.map(shortOutcome).includes(x.key)?'var(--ok)'
      : rc.notConnectedDispositions.includes(x.key)?'var(--warn)':'var(--info)'})),
    {format:v=>O.fmt.n(v), vLabel:'Parties'});
  if(!m.outcomeMix.length) O.$('#rMix').innerHTML = '<div class="empty"><b>No outcomes yet</b></div>';

  if(m.hourly.length) Ch().hbars(O.$('#rHour'), m.hourly.map(h=>({key:h.label, value:h.dials,
    color: h.rate>=60?'var(--ok)':h.rate>=40?'var(--warn)':'var(--bad)'})),
    {format:v=>O.fmt.n(v)+' dials', vLabel:'Dials', limit:24});
  else O.$('#rHour').innerHTML = '<div class="empty"><b>No calls yet</b></div>';
  O.$$('#rHour .hbar-row').forEach((row,i)=>{ const h=m.hourly[i]; if(!h) return;
    const vl=O.$('.hbar-vl',row); if(vl) vl.textContent = `${h.conn}/${h.dials} · ${h.rate}%`; });

  if(m.nc.length) O.Grid({host:O.$('#rNc'), rows:m.nc,
    cols:['customer_name','nc_reason','nc_attempts','time','phone'], sort:'time', dir:'asc',
    exportName:'oakcraft-retry-list-'+date, pageSize:25});
  else O.$('#rNc').innerHTML = '<div class="empty" style="padding:30px"><b>Nobody to retry</b>Every dialled party was reached.</div>';

  if(m.pending.length) O.Grid({host:O.$('#rPend'), rows:m.pending,
    cols:['customer_name','due','due_label','disposition','note','agent','phone'], sort:'due', dir:'asc',
    exportName:'oakcraft-pending-followups-'+date, pageSize:25,
    filters:[{key:'agent',label:'Agent'}]});
  else O.$('#rPend').innerHTML = '<div class="empty" style="padding:30px"><b>No follow-up is pending</b>Everything due was actioned.</div>';

  if(m.agentRows.length>1) O.$('#rAgents').innerHTML = `<div class="tbl-wrap"><table class="dt"><thead><tr>
    <th>Agent</th><th class="num">Parties</th><th class="num">Connected</th><th class="num">Not Conn.</th>
    <th class="num">Connect %</th><th class="num">Hot</th><th class="num">F/U Set</th><th class="num">Exp. Value</th></tr></thead><tbody>
    ${m.agentRows.map(a=>`<tr><td style="font-weight:600">${O.esc(a.agent)}</td><td class="num">${a.parties}</td>
      <td class="num" style="color:var(--ok)">${a.conn}</td><td class="num" style="color:var(--bad)">${a.nc}</td>
      <td class="num">${a.rate}%</td><td class="num">${a.hot}</td><td class="num">${a.fu}</td>
      <td class="num">${a.value?O.fmt.rs(a.value):'—'}</td></tr>`).join('')}</tbody></table></div>`;

  O.$('#rDate').addEventListener('change',e=>{ O.reportDate = e.target.value || today; O.render(); });
  O.$('#rAgent').addEventListener('change',e=>{ O.reportAgent = e.target.value; O.render(); });
  O.$('#rToday').addEventListener('click',()=>{ O.reportDate = today; O.render(); });
  O.$('#rPrev').addEventListener('click',()=>{ O.reportDate = O.dateAdd(date,-1); O.render(); });
  O.$('#rGoFu').addEventListener('click',()=>O.go('followups'));
  O.$('#rPdf').addEventListener('click',()=>R.download(R.build(date, agent)));
  O.$('#rShare').addEventListener('click',()=>R.share(R.build(date, agent)));
};
})(window.OAK);
