/* ====== OAKCRAFT — CALLING REPORTS (DAILY / WEEKLY / MONTHLY / CUSTOM) ======
   Built only from the activity log: every party whose status was updated
   in the chosen period (calls, WhatsApp, visits, quotes, follow-up
   closures), rolled up to ONE row per party, plus the follow-up book as
   it stood at the end of that period. A period is a single day, a
   Monday–Sunday week, a calendar month or any custom From–To range.
   Renders on screen, as a formatted PDF, and shares the PDF to the
   management numbers over WhatsApp.                                    */
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
const MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const parts = k => String(k||'').split('-').map(Number);
const dm = k => { const [,m,d]=parts(k); return m ? d+' '+MON[m-1] : ''; };
const wdm = k => { const [y,m,d]=parts(k); return m ? WD[new Date(y,m-1,d).getDay()]+' '+d+' '+MON[m-1] : ''; };
const longDate = k => { const [y,m,d]=parts(k);
  return new Date(y,m-1,d).toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}); };

/* ------------------------------------------------------------------
   PERIOD — every report covers [from .. to], both inclusive.
   mode: 'day' | 'week' (Mon–Sun) | 'month' | 'range' (custom)
   ------------------------------------------------------------------ */
const mondayOf = k => { const [y,m,d]=parts(k); return O.dateAdd(k, -((new Date(y,m-1,d).getDay()+6)%7)); };
const monthStart = k => String(k).slice(0,7)+'-01';
const monthEnd = k => { const [y,m]=parts(k); return O.dateKey(new Date(y,m,0)); };
/* "12–18 Oct 2026", "28 Sep – 4 Oct 2026", "28 Dec 2025 – 3 Jan 2026" */
function rangeLabel(f, t){
  const [fy,fm,fd]=parts(f), [ty,tm,td]=parts(t);
  if(f===t) return longDate(f);
  if(fy===ty && fm===tm) return `${fd}–${td} ${MON[tm-1]} ${ty}`;
  if(fy===ty) return `${fd} ${MON[fm-1]} – ${td} ${MON[tm-1]} ${ty}`;
  return `${fd} ${MON[fm-1]} ${fy} – ${td} ${MON[tm-1]} ${ty}`;
}

R.period = function(mode, anchor, from, to){
  const today = O.today();
  anchor = anchor || today;
  let f, t;
  if(mode==='week'){ f = mondayOf(anchor); t = O.dateAdd(f, 6); }
  else if(mode==='month'){ f = monthStart(anchor); t = monthEnd(anchor); }
  else if(mode==='range'){
    f = from || O.dateAdd(today, -6); t = to || today;
    if(f > t){ const x=f; f=t; t=x; }
  }
  else { mode = 'day'; f = t = anchor; }
  /* the follow-up book is read as it stood at the end of the period —
     never in the future, so a running week/month is read as of today */
  let asOf = t < today ? t : today;
  if(asOf < f) asOf = f;
  const isCurrent = f <= today && today <= t;
  const single = f === t;
  const [ay,am] = parts(f);
  const P = { mode, from:f, to:t, asOf, single, isCurrent,
    days: O.dayDiff(f, t) + 1,
    key: single ? f : f+'_to_'+t,
    isToday: single && f === today };
  if(mode==='day'){
    Object.assign(P, { title:'Daily Calling Report', label:longDate(f), noun:'day',
      span: P.isToday ? 'today' : 'that day', phrase:'on '+longDate(f) });
  } else if(mode==='week'){
    Object.assign(P, { title:'Weekly Calling Report', label:'Week of '+rangeLabel(f, t), noun:'week',
      span: isCurrent ? 'this week' : 'that week', phrase:'in the week of '+rangeLabel(f, t) });
  } else if(mode==='month'){
    Object.assign(P, { title:'Monthly Calling Report', label:MONTH[am-1]+' '+ay, noun:'month',
      span: isCurrent ? 'this month' : 'that month', phrase:'in '+MONTH[am-1]+' '+ay });
  } else {
    Object.assign(P, { title:'Calling Report', label:rangeLabel(f, t), noun:single?'day':'period',
      span: single ? (P.isToday?'today':'that day') : 'in this period',
      phrase: single ? 'on '+longDate(f) : 'between '+rangeLabel(f, t) });
  }
  return P;
};

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
   ROLL-UP — the activities of a period become one row per party.
   Over several days the party's status is the best thing that happened
   (connected beats not connected) and its outcome is its final word.
   ------------------------------------------------------------------ */
function rollup(acts, rc, single){
  const stampOf = a => single ? timeOf(a.ts) : dm(dayOf(a))+' '+timeOf(a.ts);
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
        _cls:new Set(), agents:new Set(), _days:new Set() };
      p.has_phone = p.phones.length>0;
      map.set(k, p);
    }
    p.acts.push(a); p._cls.add(classify(a, rc)); p._days.add(dayOf(a)); if(a.agent) p.agents.add(a.agent);
  });

  return Array.from(map.values()).map(p=>{
    const last = p.acts[p.acts.length-1];
    const cls = p._cls.has('conn') ? 'conn' : p._cls.has('nc') ? 'nc' : p._cls.has('msg') ? 'msg' : 'other';
    const withFu = p.acts.filter(a=>a.followup);
    const withVal = p.acts.filter(a=>O.num(a.value)>0);
    const notes = p.acts.filter(a=>a.note && a.type!=='whatsapp').map(a=>
      (p.acts.length>1 ? stampOf(a)+' ' : '') + a.note.trim());
    /* the period's final word on the party decides hot / lost */
    const lastConn = p.acts.slice().reverse().find(a=>classify(a,rc)==='conn') || last;
    const outcome = cls==='conn' ? lastConn.disposition : last.disposition || last.type;
    const temp = rc.hotDispositions.includes(outcome) ? 'hot'
      : rc.lostDispositions.includes(outcome) ? 'lost' : cls==='nc' ? 'nc' : 'neutral';
    return Object.assign(p, {
      phone: last.phone || p.phones[0] || '',
      first_time: stampOf(p.acts[0]), time: stampOf(last), ts: last.ts,
      first_day: dayOf(p.acts[0]), last_day: dayOf(last), active_days: p._days.size,
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
}

/* ------------------------------------------------------------------
   MODEL
   R.build(period, agent) — period from R.period(); a plain 'YYYY-MM-DD'
   string still works and means that single day.
   ------------------------------------------------------------------ */
R.build = function(period, agent){
  const T = O.Tracker, rc = cfg();
  const P = (period && typeof period==='object') ? period : R.period('day', period || O.today());
  agent = agent || 'all';
  const {from, to, asOf, single} = P;

  const inPeriod = T.live().filter(a=>{ if(a.type==='void') return false; const d=dayOf(a); return d>=from && d<=to; });
  const agents = O.uniq(inPeriod,'agent');
  const acts = (agent==='all' ? inPeriod : inPeriod.filter(a=>a.agent===agent))
    .slice().sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));

  const parties = rollup(acts, rc, single);
  const by = c => parties.filter(p=>p.cls===c);
  const conn = by('conn'), nc = by('nc'), msg = by('msg');
  const hot = parties.filter(p=>p.temp==='hot'), lost = parties.filter(p=>p.temp==='lost');

  /* ---- follow-up book as it stood at the end of the period ----
     A follow-up counts as actioned if it was closed by then OR the party
     was contacted in the period after the promise was made — calling
     someone is doing the follow-up even if the caller used "Log Activity"
     instead of "Close".                                                */
  const touchesOf = new Map();
  acts.forEach(a=>{ const k=a.customer_name||'(unnamed)';
    (touchesOf.get(k) || touchesOf.set(k, []).get(k)).push(a); });
  const contacted = f => (touchesOf.get(f.customer_name)||[]).some(a=>
    a.id!==f.id && dayOf(a) >= (f.promised_day||'') && dayOf(a) <= asOf);
  const F = T.followups();
  const closeDay = f => f.closed_at ? O.dateKey(new Date(f.closed_at)) : null;
  const mine = F.all.filter(f=>agent==='all' || f.agent===agent);
  /* a promise superseded by a call made in the period was actioned, not dropped */
  const scoped = mine.filter(f=>!f.superseded);
  const openAt = f => !f.done || closeDay(f) > asOf;
  const rel = f => { const n=O.dayDiff(asOf, f.due);
    return Object.assign({}, f, {due_in:n, due_label:O.dueLabel(n), actioned: contacted(f)}); };
  const dueInPeriod = mine.filter(f=>f.due>=from && f.due<=asOf && (!f.superseded || contacted(f))).map(rel);
  const dueActioned = dueInPeriod.filter(f=>!openAt(f) || f.actioned);
  const dueOpen = dueInPeriod.filter(f=>openAt(f) && !f.actioned);
  const overdue = scoped.filter(f=>f.due<from && openAt(f)).map(rel).filter(f=>!f.actioned)
    .sort((a,b)=>a.due.localeCompare(b.due));
  const closedInPeriod = mine.filter(f=>f.done && closeDay(f)>=from && closeDay(f)<=to);
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

  /* ---- day-by-day trend (multi-day periods) — each day rolled up on its own ---- */
  const daily = [];
  if(!single){
    const byDay = new Map();
    acts.forEach(a=>{ const d=dayOf(a); (byDay.get(d) || byDay.set(d, []).get(d)).push(a); });
    for(let d=from; d<=asOf; d=O.dateAdd(d,1)){
      const da = byDay.get(d) || [];
      const ps = da.length ? rollup(da, rc, true) : [];
      const c = ps.filter(p=>p.cls==='conn').length, n = ps.filter(p=>p.cls==='nc').length;
      daily.push({ day:d, label:wdm(d), parties:ps.length, touches:da.length,
        calls:da.filter(a=>a.type==='call').length, conn:c, nc:n, rate:pct(c,c+n),
        hot:ps.filter(p=>p.temp==='hot').length, fu:ps.filter(p=>p.followup).length,
        value:ps.reduce((s,p)=>s+p.value,0) });
    }
  }
  const activeDays = single ? (acts.length?1:0) : daily.filter(d=>d.parties).length;
  const busiest = daily.filter(d=>d.parties).sort((a,b)=>b.parties-a.parties || b.conn-a.conn)[0] || null;

  const agentRows = O.uniq(parties.flatMap(p=>Array.from(p.agents).map(a=>({a}))),'a').map(name=>{
    const ps = parties.filter(p=>p.agents.has(name));
    const c = ps.filter(p=>p.cls==='conn').length, n = ps.filter(p=>p.cls==='nc').length;
    return { agent:name, parties:ps.length, conn:c, nc:n, rate:pct(c,c+n),
      hot:ps.filter(p=>p.temp==='hot').length, fu:ps.filter(p=>p.followup).length,
      value:ps.reduce((s,p)=>s+p.value,0) };
  }).sort((a,b)=>b.parties-a.parties);

  const stampOf = a => single ? timeOf(a.ts) : dm(dayOf(a))+' '+timeOf(a.ts);
  const k = {
    parties: parties.length, touches: acts.length,
    calls: acts.filter(a=>a.type==='call').length,
    conn: conn.length, nc: nc.length, msg: msg.length,
    rate: pct(conn.length, conn.length+nc.length),
    hot: hot.length, lost: lost.length,
    pipeline: parties.reduce((s,p)=>s+p.value,0),
    hotValue: hot.reduce((s,p)=>s+p.value,0),
    /* "dueToday" keeps its name for the PDF / share code: due in the period */
    dueToday: dueInPeriod.length, dueActioned: dueActioned.length, dueOpen: dueOpen.length,
    overdue: overdue.length, pending: pending.length,
    closedToday: closedInPeriod.length, newFu: newFu.length,
    noNext: noNext.length, noNotes: noNotes.length,
    days: O.dayDiff(from, asOf)+1, activeDays,
    perDay: activeDays ? Math.round(parties.length/activeDays*10)/10 : 0,
    first: acts.length ? stampOf(acts[0]) : '',
    last: acts.length ? stampOf(acts[acts.length-1]) : ''
  };

  const m = { period:P, mode:P.mode, from, to, asOf, single,
    /* `date` is the share-log / backend key: the day itself for a daily report */
    date: P.key, key: P.key, agent, agents,
    title: P.title, dateLabel: P.label, isToday: P.isToday, isCurrent: P.isCurrent,
    generated: new Date(), scope: agent==='all' ? (agents.length>1?`All team (${agents.length} agents)`:'All team') : agent,
    parties, conn, nc, msg, hot, lost, newFu, noNext, noNotes,
    dueToday: dueInPeriod, dueOpen, overdue, pending, closedToday: closedInPeriod,
    outcomeMix, ncMix, hourly, bestHour, agentRows, daily, busiest, k };
  m.insights = insights(m);
  return m;
};

/* ------------------------------------------------------------------
   ANALYST READ-OUT — plain sentences a manager can act on
   ------------------------------------------------------------------ */
function insights(m){
  const k = m.k, P = m.period, out = [];
  const say = (tone, text) => out.push({tone, text});
  const names = list => list.slice(0,3).map(p=>p.customer_name).join(', ') + (list.length>3?` +${list.length-3} more`:'');
  const dueWord = m.single ? 'due that day' : 'due in the period';

  if(!k.parties){
    say('warn', `No party was called or updated ${P.phrase}${m.agent!=='all'?' by '+m.agent:''}.`);
    if(k.pending) say('bad', `${k.pending} follow-up${k.pending===1?' is':'s are'} still pending (${k.dueOpen} ${dueWord}, ${k.overdue} overdue).`);
    return out;
  }
  if(m.single)
    say('info', `${k.parties} parties worked${m.agent==='all'&&m.agents.length>1?` by ${m.agents.length} agents`:''} between ${k.first} and ${k.last} — ${k.touches} status update${k.touches===1?'':'s'} logged.`);
  else {
    say('info', `${k.parties} unique part${k.parties===1?'y':'ies'} worked${m.agent==='all'&&m.agents.length>1?` by ${m.agents.length} agents`:''} on ${k.activeDays} of ${k.days} day${k.days===1?'':'s'} (about ${k.perDay} per calling day) — ${k.touches} status update${k.touches===1?'':'s'} logged.`);
    if(m.busiest && k.activeDays>1) say('info', `Busiest day: ${m.busiest.label} with ${m.busiest.parties} parties (${m.busiest.conn} connected).`);
    const idle = k.days - k.activeDays;
    if(idle>0 && k.days>=5) say(idle > k.days/2 ? 'warn' : 'info', `${idle} day${idle===1?'':'s'} in this ${P.noun} had no calls logged.`);
  }

  const dialled = k.conn + k.nc;
  if(dialled){
    const tone = k.rate>=60 ? 'ok' : k.rate>=40 ? 'warn' : 'bad';
    say(tone, `Connect rate ${k.rate}%: ${k.conn} of ${dialled} dialled parties picked up.`+
      (k.rate<40 ? ' Well below a healthy 40–60% — check number quality and call timing.' : ''));
  }
  if(m.bestHour) say('info', `Best calling window: ${m.bestHour.label} (${m.bestHour.conn} of ${m.bestHour.dials} connected, ${m.bestHour.rate}%). Schedule retries around it.`);

  if(k.hot) say('ok', `${k.hot} hot lead${k.hot===1?'':'s'} (${names(m.hot)})`+
    (k.hotValue ? ` carrying ${O.fmt.short(k.hotValue)} of expected orders.` : '.'));
  else if(k.conn) say('warn', `No hot lead came out of the ${m.isToday?'day\'s':P.noun+'\'s'} connected calls.`);

  if(k.nc){
    const parts = m.ncMix.map(x=>`${x.value} ${x.key}`).join(', ');
    say('warn', `${k.nc} not connected — ${parts}. They are on the retry list.`);
    const wrong = m.ncMix.find(x=>/Wrong Number/i.test(x.key));
    if(wrong) say('bad', `${wrong.value} wrong number${wrong.value===1?'':'s'} — correct them in the master data before the next calling round.`);
  }

  if(k.dueToday) say(k.dueOpen ? 'warn' : 'ok',
    `Follow-up discipline: ${k.dueToday-k.dueOpen} of ${k.dueToday} follow-ups ${dueWord} were actioned (${pct(k.dueToday-k.dueOpen,k.dueToday)}%).`);
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
    `*${C().orgName} — ${m.title}*`,
    `${m.dateLabel} · ${m.scope}`,
    ``,
    `Parties called: *${k.parties}*${m.single?'':` (on ${k.activeDays} of ${k.days} days)`}`,
    `Connected: ${k.conn} · Not connected: ${k.nc}${(k.conn+k.nc)?` (${k.rate}% connect rate)`:''}`,
    `Hot leads: ${k.hot}${k.pipeline?` · Expected value: ${O.fmt.short(k.pipeline)}`:''}`,
    `Follow-ups pending: ${k.pending}${k.overdue?` (${k.overdue} overdue)`:''} · New booked: ${k.newFu}`,
    ``,
    `Full party-wise report attached (PDF).`
  ].join('\n');
};

R.fileName = m => `${C().orgName}-${m.title.replace(/\s+/g,'-')}-${m.key}${m.agent!=='all'?'-'+m.agent.replace(/[^\w]+/g,'-'):''}.pdf`;

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
  doc.text(m.title, M, 34, {size:21, bold:true, color:'#ffffff'});
  doc.text(m.dateLabel+'   |   '+m.scope, M, 62, {size:10, color:'#cbd5e1'});
  doc.text('Generated', doc.W-M, 24, {size:7.5, color:'#94a3b8', align:'right'});
  doc.text(m.generated.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    doc.W-M, 35, {size:9, bold:true, color:'#ffffff', align:'right'});
  if(m.single){ if(m.k.parties) doc.text(`Calling window ${m.k.first} - ${m.k.last}`, doc.W-M, 62, {size:9, color:'#cbd5e1', align:'right'}); }
  else doc.text(`${m.k.activeDays} of ${m.k.days} days with calls${m.isCurrent?' (so far)':''}`, doc.W-M, 62, {size:9, color:'#cbd5e1', align:'right'});
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
  if(!m.single) tiles[0][2] = `${k.touches} updates · ${k.activeDays}/${k.days} days`;
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
    section('Outcome Summary', `one row per party, by final outcome of the ${m.period.noun}`);
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
    [[m.single?'Due on this day':'Due in this '+m.period.noun, k.dueToday, PC.ink],
     ['Actioned (called or closed)', k.dueToday-k.dueOpen, PC.ok],
     [m.single?'Due today - still pending':'Due in period - still pending', k.dueOpen, k.dueOpen?PC.bad:PC.ink],
     ['Overdue - still pending', k.overdue, k.overdue?PC.bad:PC.ink],
     [m.single?'Closed in the log today':'Closed in the log', k.closedToday, PC.ink],
     ['New follow-ups booked', k.newFu, PC.info],
     ['Connected, no next step', k.noNext, k.noNext?PC.warn:PC.ink]].forEach(([l,v,c])=>{
      doc.text(l, rx, ry, {size:8.5, color:PC.ink});
      doc.text(String(v), rx+half, ry, {size:8.5, bold:true, color:c, align:'right'});
      doc.line(rx, ry+11.5, rx+half, ry+11.5, {color:PC.line, lw:0.4});
      ry += rowH;
    });
    y = Math.max(ly, ry) + 12;
  }

  /* ---- day-wise summary (week / month / custom) ---- */
  if(!m.single){
    section('Day-wise Summary', `${k.activeDays} of ${k.days} days with calls · avg ${k.perDay} parties per calling day`);
    const sum = f => m.daily.reduce((s,d)=>s+d[f],0);
    const tc = sum('conn'), tn = sum('nc');
    table([
      {label:'Day', w:78, bold:true, get:r=>r.label, color:r=>r.total?PC.ink:r.parties?PC.ink:PC.ink3},
      {label:'Parties', align:'right', get:r=>r.parties},
      {label:'Updates', align:'right', get:r=>r.touches},
      {label:'Calls', align:'right', get:r=>r.calls},
      {label:'Connected', align:'right', get:r=>r.conn, color:()=>PC.ok},
      {label:'Not conn.', align:'right', get:r=>r.nc, color:()=>PC.bad},
      {label:'Connect %', align:'right', get:r=>(r.conn+r.nc)?r.rate+'%':'-'},
      {label:'Hot', align:'right', get:r=>r.hot},
      {label:'F/U set', align:'right', get:r=>r.fu},
      {label:'Exp. Value', w:70, align:'right', get:r=>r.value?O.fmt.rs(r.value):'-'}
    ], m.daily.concat([{total:true, label:'Total', parties:sum('parties'), touches:k.touches, calls:k.calls,
      conn:tc, nc:tn, rate:pct(tc,tc+tn), hot:sum('hot'), fu:sum('fu'), value:sum('value')}]),
      {size:7.6, empty:'No calls logged in this period.'});
  }

  /* ---- party-wise detail ---- */
  const statusColor = p => p.cls==='conn' ? PC.ok : p.cls==='nc' ? PC.bad : PC.info;
  const outColor = p => p.temp==='hot' ? PC.ok : p.temp==='lost' ? PC.bad : PC.ink;
  section('Party-wise Call Details', `${k.parties} ${k.parties===1?'party':'parties'} · in calling order`);
  table([
    {label:'#', w:18, get:(r,i)=>i+1, color:()=>PC.ink3},
    {label:'Party', w:m.single?100:88, bold:true, get:r=>r.customer_name, sub:r=>[r.phone, r.state].filter(Boolean).join(' · ')},
    m.single
      ? {label:'Time', w:32, get:r=>r.touches>1 ? `${r.first_time}-${r.time}` : r.time,
          sub:r=>r.touches>1 ? `${r.touches} tries` : ''}
      : {label:'Last contact', w:50, get:r=>r.time,
          sub:r=>r.touches>1 ? `${r.touches} tries${r.active_days>1?', '+r.active_days+' days':''}` : ''},
    {label:'Status', w:62, get:r=>r.status, color:statusColor, bold:true},
    {label:'Outcome', w:70, get:r=>shortOutcome(r.disposition), color:outColor},
    {label:'What was discussed', get:r=>r.note || (r.cls==='nc' ? 'Could not reach' : 'No notes recorded')},
    {label:'Next F/U', w:42, get:r=>r.followup ? dm(r.followup) : '-'},
    {label:'Exp. Value', w:58, align:'right', get:r=>r.value ? O.fmt.rs(r.value) : '-'}
  ], m.parties, {empty:`No party was called or updated ${m.single?'on this day':'in this '+m.period.noun}.`});

  /* ---- retry list ---- */
  section('Not Connected - Retry List', `${k.nc} ${k.nc===1?'party':'parties'}`);
  table([
    {label:'#', w:18, get:(r,i)=>i+1, color:()=>PC.ink3},
    {label:'Party', get:r=>r.customer_name, bold:true},
    {label:'Phone', w:92, get:r=>r.phone || (r.phones||[]).join(', ')},
    {label:'Reason', w:96, get:r=>r.nc_reason, color:()=>PC.bad},
    {label:'Attempts', w:50, align:'right', get:r=>r.nc_attempts},
    {label:'Last try', w:m.single?46:60, get:r=>r.time},
    {label:'Agent', w:80, get:r=>r.agent}
  ], m.nc, {empty:'Every dialled party was reached.'});

  /* ---- pending follow-ups ---- */
  section('Pending Follow-ups', `${k.dueOpen} due · ${k.overdue} overdue · not contacted ${m.single?'on this day':'in this '+m.period.noun}`);
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
    doc.text(`${C().orgName} CRR Tracker  ·  ${m.title}  ·  ${m.dateLabel}  ·  ${m.scope}`,
      M, doc.H-22, {size:7, color:PC.ink3});
    doc.text(`Page ${i+1} of ${n}`, doc.W-M, doc.H-22, {size:7, color:PC.ink3, align:'right'});
  }
  return doc.output({title:`${m.title} - ${m.dateLabel}`, author:C().orgName});
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
R.lastShare = key => (O.store.get('reportShares', [])||[]).filter(s=>s.date===key).pop() || null;

/* ------------------------------------------------------------------
   VIEW — period picker state lives on O so it survives re-renders:
   O.reportMode  'day' | 'week' | 'month' | 'range'
   O.reportDate  anchor day for day / week / month
   O.reportFrom / O.reportTo   custom range
   ------------------------------------------------------------------ */
const MODES = [['day','Daily'],['week','Weekly'],['month','Monthly'],['range','Custom Range']];
R.current = function(){
  const today = O.today();
  const mode = O.reportMode || 'day';
  let anchor = O.reportDate || today;
  if(anchor > today) anchor = today;
  return R.period(mode, anchor, O.reportFrom, O.reportTo);
};

const V = O.Views;
V.reports = function(host){
  const today = O.today();
  const P = R.current();
  const agent = O.reportAgent || 'all';
  const m = R.build(P, agent);
  const k = m.k;
  const rc = cfg();
  const last = R.lastShare(P.key);
  const agentsAll = O.uniq(O.Tracker.live().filter(a=>{ const d=dayOf(a); return d>=P.from && d<=P.to; }), 'agent');
  const anchor = O.reportDate && O.reportDate<=today ? O.reportDate : today;

  const kpi = (label, value, sub, color, bg, bar) => `<div class="kpi" style="--kc:${color};--kb:${bg}">
    <div class="kpi-top"><div class="kpi-label">${O.esc(label)}</div></div>
    <div class="kpi-val">${value}</div>${sub?`<div class="kpi-sub">${sub}</div>`:''}
    ${bar!=null?`<div class="kpi-bar"><i style="width:${Math.min(100,bar)}%"></i></div>`:''}</div>`;
  const toneVar = {ok:'var(--ok)', warn:'var(--warn)', bad:'var(--bad)', info:'var(--info)'};

  /* ---- month list: back to the first logged activity (min. 12 months) ---- */
  let firstDay = today;
  O.Tracker.live().forEach(a=>{ const d=dayOf(a); if(d && d<firstDay) firstDay = d; });
  const months = [];
  for(let mk=monthStart(today), stop=monthStart(O.dateAdd(today,-334)) < monthStart(firstDay) ? monthStart(O.dateAdd(today,-334)) : monthStart(firstDay);
      mk>=stop; mk=monthStart(O.dateAdd(mk,-1))){
    const [y,mo]=parts(mk); months.push({v:mk, l:MONTH[mo-1]+' '+y});
  }

  /* ---- period-specific controls ---- */
  const nav = {
    day:   {cur:'Today', prev:'&#8249; Previous day', next:'Next day &#8250;'},
    week:  {cur:'This week', prev:'&#8249; Previous week', next:'Next week &#8250;'},
    month: {cur:'This month', prev:'&#8249; Previous month', next:'Next month &#8250;'}
  }[P.mode];
  const picker = P.mode==='day'
      ? `<label>Date <input type="date" id="rDate" class="fsel" value="${P.from}" max="${today}"></label>`
    : P.mode==='week'
      ? `<label>Week of <input type="date" id="rDate" class="fsel" value="${anchor<P.from||anchor>P.to?P.from:anchor}" max="${today}" title="Pick any day — the report covers its Monday to Sunday"></label>
         <span class="rep-span">${O.esc(rangeLabel(P.from, P.to))}</span>`
    : P.mode==='month'
      ? `<label>Month <select id="rMonth" class="fsel">${months.map(x=>
          `<option value="${x.v}"${x.v===P.from?' selected':''}>${x.l}</option>`).join('')}</select></label>`
      : `<label>From <input type="date" id="rFrom" class="fsel" value="${P.from}" max="${today}"></label>
         <label>To <input type="date" id="rTo" class="fsel" value="${P.to}" max="${today}"></label>
         <span class="rep-span">${P.days} day${P.days===1?'':'s'}</span>`;
  const navBtns = nav
    ? `<button class="btn sm" id="rCur" ${P.isCurrent?'disabled':''}>${nav.cur}</button>
       <button class="btn sm" id="rPrev">${nav.prev}</button>
       <button class="btn sm" id="rNext" ${P.to>=today?'disabled':''}>${nav.next}</button>`
    : `<button class="btn sm" data-last="7">Last 7 days</button>
       <button class="btn sm" data-last="30">Last 30 days</button>`;

  const fuDesc = m.single
    ? `${O.fmt.n(k.dueOpen)} due on this day and ${O.fmt.n(k.overdue)} overdue that nobody contacted — carry these into tomorrow`
    : `${O.fmt.n(k.dueOpen)} due in this ${P.noun}${P.isCurrent?' so far':''} and ${O.fmt.n(k.overdue)} overdue from before it that nobody contacted`;

  host.innerHTML = `<div class="page-head">
      <div class="page-eyebrow">Reporting</div>
      <h1 class="page-title">${O.esc(P.title)}</h1>
      <div class="page-sub">${m.single
        ? `Every party whose status was updated on ${O.esc(m.dateLabel)}${m.isToday?' (today)':''} — who was called, what was discussed, who could not be reached and which follow-ups are still pending.`
        : `Every party whose status was updated ${O.esc(P.mode==='week'?'in the week of '+rangeLabel(P.from,P.to)+' (Mon–Sun)':P.phrase)}${P.isCurrent?` — ${P.span} so far`:''} — rolled up to one row per party, with the day-wise trend and the follow-ups still pending at the end of the ${P.noun}.`}
        Built live from the activity log.</div>
    </div>
    ${O.Tracker.online()?'':`<div class="callout" style="border-left-color:var(--warn);margin-bottom:16px">
      <b style="color:var(--warn)">&#9888; Only this browser's entries are in this report.</b>
      The team log is not shared yet, so calls logged on other devices are missing.</div>`}
    <div class="rep-bar">
      <div class="rep-seg" role="tablist" aria-label="Report period">${MODES.map(([v,l])=>
        `<button role="tab" aria-selected="${v===P.mode}" class="${v===P.mode?'on':''}" data-mode="${v}">${l}</button>`).join('')}</div>
      ${picker}
      <label>Agent <select id="rAgent" class="fsel">
        <option value="all">All team</option>
        ${agentsAll.map(a=>`<option${a===agent?' selected':''}>${O.esc(a)}</option>`).join('')}
        ${agent!=='all'&&!agentsAll.includes(agent)?`<option selected>${O.esc(agent)}</option>`:''}
      </select></label>
      ${navBtns}
      <div class="rep-actions">
        <button class="btn sm" id="rPdf">&#8681; Download PDF</button>
        <button class="btn wa" id="rShare" title="Send the PDF to ${O.esc((rc.shareTo||[]).join(' & '))} on WhatsApp">&#128172; Share Report</button>
      </div>
    </div>
    <div class="rep-share-note">Sends to <b>${(rc.shareTo||[]).map(O.esc).join('</b> &amp; <b>')||'—'}</b>${
      last?` &middot; last shared ${new Date(last.at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`:''}</div>

    <div class="kpis">
      ${kpi('Parties Called', O.fmt.n(k.parties), `<span>${O.fmt.n(k.touches)} updates &middot; ${O.fmt.n(k.calls)} calls${m.single?'':` &middot; ${k.activeDays}/${k.days} days`}</span>`, 'var(--acc)','var(--acc-dim)')}
      ${kpi('Connected', O.fmt.n(k.conn), `<span>${k.rate}% connect rate</span>`, 'var(--ok)','var(--ok-dim)', k.rate)}
      ${kpi('Not Connected', O.fmt.n(k.nc), `<span>No answer / off / busy / wrong</span>`, 'var(--bad)','var(--bad-dim)', pct(k.nc,k.conn+k.nc))}
      ${kpi('Hot Leads', O.fmt.n(k.hot), `<span>${k.hotValue?O.fmt.short(k.hotValue)+' expected':'Order / visit / quote'}</span>`, 'var(--acc)','var(--acc-dim)')}
      ${kpi('Follow-ups Pending', O.fmt.n(k.pending), `<span style="color:${k.overdue?'var(--bad)':'inherit'}">${k.dueOpen} due &middot; ${k.overdue} overdue</span>`, k.pending?'var(--bad)':'var(--ok)', k.pending?'var(--bad-dim)':'var(--ok-dim)')}
      ${kpi('Follow-ups Actioned', `${O.fmt.n(k.dueToday-k.dueOpen)}<span style="font-size:15px;color:var(--tx-3)"> / ${O.fmt.n(k.dueToday)}</span>`, `<span>${k.closedToday} closed in the log</span>`, 'var(--info)','var(--info-dim)', k.dueToday?pct(k.dueToday-k.dueOpen,k.dueToday):null)}
      ${kpi('New Follow-ups Set', O.fmt.n(k.newFu), `<span style="color:${k.noNext?'var(--warn)':'inherit'}">${k.noNext?k.noNext+' connected without a next step':'Every connect has a next step'}</span>`, 'var(--info)','var(--info-dim)')}
      ${kpi('Expected Pipeline', O.fmt.short(k.pipeline), `<span>${k.lost} declined ${P.span}</span>`, 'var(--ok)','var(--ok-dim)')}
      ${m.single?'':kpi('Avg / Calling Day', O.fmt.n(k.perDay,k.perDay%1?1:0), `<span>${m.busiest?'Busiest: '+O.esc(m.busiest.label)+' ('+m.busiest.parties+')':'No calling day yet'}</span>`, 'var(--info)','var(--info-dim)', k.days?pct(k.activeDays,k.days):null)}
    </div>

    <div class="grid g-21">
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Key Insights</div>
        <div class="panel-desc">An analyst's read of the ${P.noun} — the same points go into the PDF</div></div></div>
        <div class="panel-body"><ul class="ins-list">${m.insights.map(i=>
          `<li><i style="background:${toneVar[i.tone]||'var(--info)'}"></i><span>${O.esc(i.text)}</span></li>`).join('')}</ul></div></div>
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Outcome Mix</div>
        <div class="panel-desc">Parties by final outcome of the ${P.noun}</div></div></div>
        <div class="panel-body" id="rMix"></div></div>
    </div>

    ${m.single?'':`<div class="panel"><div class="panel-head">
      <div><div class="panel-title">Day-wise Trend</div>
        <div class="panel-desc">Parties called each day — bar colour shows that day's connect rate. Click a day to open its daily report.</div></div></div>
      <div class="panel-body" id="rTrend"></div>
      <div class="panel-body flush" id="rDaily" style="padding-top:0"></div></div>`}

    <div class="panel"><div class="panel-head">
      <div><div class="panel-title">Party-wise Call Details</div>
        <div class="panel-desc">${O.fmt.n(k.parties)} ${k.parties===1?'party':'parties'} in calling order — one row per party, every note from the ${P.noun}. Click a party for the full record.</div></div></div>
      <div class="panel-body flush" id="rParties"></div></div>

    <div class="grid g2">
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Not Connected — Retry List</div>
        <div class="panel-desc">${O.fmt.n(k.nc)} ${k.nc===1?'party':'parties'} ${m.single?'':'never reached in this '+P.noun+' '}to try again${m.bestHour?`, ideally ${O.esc(m.bestHour.label)}`:''}</div></div></div>
        <div class="panel-body flush" id="rNc"></div></div>
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Calls By Hour</div>
        <div class="panel-desc">Dials per hour${m.single?'':' of the day, across the '+P.noun} and how many connected</div></div></div>
        <div class="panel-body" id="rHour"></div></div>
    </div>

    <div class="panel"><div class="panel-head">
      <div><div class="panel-title">Pending Follow-ups</div>
        <div class="panel-desc">${fuDesc}</div></div>
      <div class="panel-tools"><button class="btn sm" id="rGoFu">Open Follow-Ups &#8250;</button></div></div>
      <div class="panel-body flush" id="rPend"></div></div>

    ${m.agentRows.length>1?`<div class="panel"><div class="panel-head"><div><div class="panel-title">Agent Performance</div>
      <div class="panel-desc">Who called whom, and how it went</div></div></div>
      <div class="panel-body flush" id="rAgents"></div></div>`:''}`;

  /* ---- party table: full notes, wrapped, not clipped ---- */
  const stTag = p => `<span class="tag ${p.cls==='conn'?'ok':p.cls==='nc'?'bad':'info'}">${O.esc(p.status)}</span>`;
  const outTag = p => `<span class="tag ${p.temp==='hot'?'ok':p.temp==='lost'?'bad':'mut'}">${O.esc(shortOutcome(p.disposition))}</span>`;
  const timeCell = p => m.single
    ? (p.touches>1?`${p.first_time}–${p.time}<div style="font-size:10.5px;color:var(--tx-3)">${p.touches} updates</div>`:p.time)
    : `${p.time}<div style="font-size:10.5px;color:var(--tx-3)">${p.touches>1?`${p.touches} updates${p.active_days>1?` &middot; ${p.active_days} days`:''}<br>first ${p.first_time}`:''}</div>`;
  O.$('#rParties').innerHTML = m.parties.length ? `<div class="tbl-wrap"><table class="dt rep-dt"><thead><tr>
      <th>#</th><th>Party</th><th>${m.single?'Time':'Last contact'}</th><th>Status</th><th>Outcome</th><th>What was discussed</th>
      <th>Next F/U</th><th class="num">Exp. Value</th><th>Agent</th></tr></thead><tbody>
    ${m.parties.map((p,i)=>`<tr data-n="${O.esc(p.customer_name||'')}" style="cursor:pointer">
      <td style="color:var(--tx-3)">${i+1}</td>
      <td><div class="cell-name">${O.esc(p.customer_name)}</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--fm)">${O.esc(p.phone||'no phone')}${p.state?' · '+O.esc(p.state):''}</div></td>
      <td style="white-space:nowrap">${timeCell(p)}</td>
      <td>${stTag(p)}</td><td>${outTag(p)}</td>
      <td class="rep-note">${p.note?O.esc(p.note):`<span style="color:var(--tx-3)">${p.cls==='nc'?'Could not reach':'No notes recorded'}</span>`}</td>
      <td>${p.followup?`<span class="tag warn">${O.fmt.dateShort(p.followup)}</span>`:(p.cls==='conn'&&p.temp!=='lost'?'<span class="tag bad" title="Connected but no next step">none</span>':'—')}</td>
      <td class="num">${p.value?O.fmt.rs(p.value):'—'}</td>
      <td style="font-size:12px;color:var(--tx-2)">${O.esc(p.agent||'—')}</td></tr>`).join('')}
    </tbody></table></div>`
    : `<div class="empty" style="padding:40px"><div class="empty-ico">&#128222;</div>
       <b>No party was called or updated ${O.esc(m.single?'on this day':'in this '+P.noun)}</b>Log a call from any list and it appears here immediately.</div>`;
  O.$$('#rParties tbody tr[data-n]').forEach(tr=>tr.addEventListener('click',()=>{
    const p = m.parties.find(x=>x.customer_name===tr.dataset.n); if(p) O.openCustomer(p); }));

  Ch().hbars(O.$('#rMix'), m.outcomeMix.map(x=>({key:x.key, value:x.value,
    color: rc.lostDispositions.map(shortOutcome).includes(x.key)?'var(--bad)'
      : rc.hotDispositions.map(shortOutcome).includes(x.key)?'var(--ok)'
      : rc.notConnectedDispositions.includes(x.key)?'var(--warn)':'var(--info)'})),
    {format:v=>O.fmt.n(v), vLabel:'Parties'});
  if(!m.outcomeMix.length) O.$('#rMix').innerHTML = '<div class="empty"><b>No outcomes yet</b></div>';

  /* ---- day-wise trend (week / month / custom) ---- */
  const openDay = d => { O.reportMode = 'day'; O.reportDate = d; O.render(); O.$('.content').scrollTop = 0; };
  if(!m.single){
    const rateColor = d => !d.parties ? 'var(--tx-3)' : (d.conn+d.nc)===0 ? 'var(--info)'
      : d.rate>=60 ? 'var(--ok)' : d.rate>=40 ? 'var(--warn)' : 'var(--bad)';
    if(m.daily.some(d=>d.parties)) Ch().bars(O.$('#rTrend'), m.daily.map(d=>({key:d.day,
        label: m.daily.length>14 ? String(parts(d.day)[2]) : d.label.replace(/ \w+$/,''),
        value:d.parties, color:rateColor(d)})),
      {format:v=>O.fmt.n(v), vLabel:'Parties', height:210, left:36,
       labelEvery: m.daily.length>40 ? 7 : m.daily.length>14 ? 2 : 1, onClick:d=>openDay(d.key)});
    else O.$('#rTrend').innerHTML = `<div class="empty"><b>No calls logged in this ${P.noun}</b></div>`;
    O.$$('#rTrend .ct-bar').forEach((bar,i)=>{ const d=m.daily[i]; if(!d) return;
      bar.addEventListener('mousemove',()=>{ const t=O.$('.tip'); if(t) t.innerHTML =
        `<b>${O.esc(d.label)}</b><span>${d.parties} parties &middot; ${d.conn} connected &middot; ${d.nc} not connected`+
        `${(d.conn+d.nc)?` (${d.rate}%)`:''}<br>${d.hot} hot &middot; ${d.fu} follow-ups set</span>`; }); });
    const shown = m.daily.slice().reverse();
    O.$('#rDaily').innerHTML = `<div class="tbl-wrap"><table class="dt"><thead><tr>
      <th>Day</th><th class="num">Parties</th><th class="num">Updates</th><th class="num">Calls</th><th class="num">Connected</th>
      <th class="num">Not Conn.</th><th class="num">Connect %</th><th class="num">Hot</th><th class="num">F/U Set</th><th class="num">Exp. Value</th></tr></thead><tbody>
      ${shown.map(d=>`<tr data-day="${d.day}" style="cursor:pointer${d.parties?'':';opacity:.55'}">
        <td style="font-weight:600;white-space:nowrap">${O.esc(d.label)}${d.day===today?' <span class="tag info">today</span>':''}</td>
        <td class="num">${d.parties}</td><td class="num">${d.touches}</td><td class="num">${d.calls}</td>
        <td class="num" style="color:var(--ok)">${d.conn}</td><td class="num" style="color:var(--bad)">${d.nc}</td>
        <td class="num">${(d.conn+d.nc)?d.rate+'%':'—'}</td><td class="num">${d.hot}</td><td class="num">${d.fu}</td>
        <td class="num">${d.value?O.fmt.rs(d.value):'—'}</td></tr>`).join('')}
      </tbody><tfoot><tr style="font-weight:700">
        <td>Total &middot; ${k.activeDays} calling day${k.activeDays===1?'':'s'}</td>
        <td class="num" title="Party-days; the same party called on two days counts twice">${m.daily.reduce((s,d)=>s+d.parties,0)}</td>
        <td class="num">${k.touches}</td><td class="num">${k.calls}</td>
        <td class="num" style="color:var(--ok)">${m.daily.reduce((s,d)=>s+d.conn,0)}</td>
        <td class="num" style="color:var(--bad)">${m.daily.reduce((s,d)=>s+d.nc,0)}</td>
        <td class="num">${(()=>{ const c=m.daily.reduce((s,d)=>s+d.conn,0), n=m.daily.reduce((s,d)=>s+d.nc,0); return (c+n)?pct(c,c+n)+'%':'—'; })()}</td>
        <td class="num">${m.daily.reduce((s,d)=>s+d.hot,0)}</td><td class="num">${m.daily.reduce((s,d)=>s+d.fu,0)}</td>
        <td class="num">${(()=>{ const v=m.daily.reduce((s,d)=>s+d.value,0); return v?O.fmt.rs(v):'—'; })()}</td></tr></tfoot></table></div>`;
    O.$$('#rDaily tbody tr[data-day]').forEach(tr=>tr.addEventListener('click',()=>openDay(tr.dataset.day)));
  }

  if(m.hourly.length) Ch().hbars(O.$('#rHour'), m.hourly.map(h=>({key:h.label, value:h.dials,
    color: h.rate>=60?'var(--ok)':h.rate>=40?'var(--warn)':'var(--bad)'})),
    {format:v=>O.fmt.n(v)+' dials', vLabel:'Dials', limit:24});
  else O.$('#rHour').innerHTML = '<div class="empty"><b>No calls yet</b></div>';
  O.$$('#rHour .hbar-row').forEach((row,i)=>{ const h=m.hourly[i]; if(!h) return;
    const vl=O.$('.hbar-vl',row); if(vl) vl.textContent = `${h.conn}/${h.dials} · ${h.rate}%`; });

  if(m.nc.length) O.Grid({host:O.$('#rNc'), rows:m.nc,
    cols:['customer_name','nc_reason','nc_attempts','time','phone'], sort:'ts', dir:'asc',
    exportName:'oakcraft-retry-list-'+P.key, pageSize:25});
  else O.$('#rNc').innerHTML = '<div class="empty" style="padding:30px"><b>Nobody to retry</b>Every dialled party was reached.</div>';

  if(m.pending.length) O.Grid({host:O.$('#rPend'), rows:m.pending,
    cols:['customer_name','due','due_label','disposition','note','agent','phone'], sort:'due', dir:'asc',
    exportName:'oakcraft-pending-followups-'+P.key, pageSize:25,
    filters:[{key:'agent',label:'Agent'}]});
  else O.$('#rPend').innerHTML = '<div class="empty" style="padding:30px"><b>No follow-up is pending</b>Everything due was actioned.</div>';

  if(m.agentRows.length>1) O.$('#rAgents').innerHTML = `<div class="tbl-wrap"><table class="dt"><thead><tr>
    <th>Agent</th><th class="num">Parties</th><th class="num">Connected</th><th class="num">Not Conn.</th>
    <th class="num">Connect %</th><th class="num">Hot</th><th class="num">F/U Set</th><th class="num">Exp. Value</th></tr></thead><tbody>
    ${m.agentRows.map(a=>`<tr><td style="font-weight:600">${O.esc(a.agent)}</td><td class="num">${a.parties}</td>
      <td class="num" style="color:var(--ok)">${a.conn}</td><td class="num" style="color:var(--bad)">${a.nc}</td>
      <td class="num">${a.rate}%</td><td class="num">${a.hot}</td><td class="num">${a.fu}</td>
      <td class="num">${a.value?O.fmt.rs(a.value):'—'}</td></tr>`).join('')}</tbody></table></div>`;

  /* ---- period controls ---- */
  O.$$('.rep-seg [data-mode]').forEach(b=>b.addEventListener('click',()=>{
    const mode = b.dataset.mode; if(mode===P.mode) return;
    /* carry the period across: Oct 17 (day) -> its week -> October -> 1 Oct..today */
    if(mode==='range'){ O.reportFrom = P.from; O.reportTo = P.to<today ? P.to : today; }
    else O.reportDate = P.mode==='range' ? (P.to<today ? P.to : today)
      : (anchor>=P.from && anchor<=P.to ? anchor : (P.to<today ? P.to : today));
    O.reportMode = mode; O.render(); }));
  const setAnchor = d => { O.reportDate = d > today ? today : d; O.render(); };
  const rDate = O.$('#rDate');
  if(rDate) rDate.addEventListener('change',e=>setAnchor(e.target.value || today));
  const rMonth = O.$('#rMonth');
  if(rMonth) rMonth.addEventListener('change',e=>{
    const v = e.target.value; setAnchor(v.slice(0,7)===today.slice(0,7) ? today : monthEnd(v)); });
  const rFrom = O.$('#rFrom'), rTo = O.$('#rTo');
  if(rFrom) rFrom.addEventListener('change',e=>{ O.reportFrom = e.target.value || P.from; O.reportTo = P.to; O.render(); });
  if(rTo) rTo.addEventListener('change',e=>{ O.reportTo = e.target.value || P.to; O.reportFrom = P.from; O.render(); });
  O.$$('[data-last]').forEach(b=>b.addEventListener('click',()=>{
    O.reportTo = today; O.reportFrom = O.dateAdd(today, 1-Number(b.dataset.last)); O.render(); }));
  const step = dir => {
    if(P.mode==='day') return setAnchor(O.dateAdd(P.from, dir));
    if(P.mode==='week') return setAnchor(O.dateAdd(P.from, dir*7));
    /* month: the 1st of the previous / next month, clamped to today */
    return setAnchor(dir<0 ? O.dateAdd(P.from,-1) : O.dateAdd(P.to,1));
  };
  if(O.$('#rCur')) O.$('#rCur').addEventListener('click',()=>setAnchor(today));
  if(O.$('#rPrev')) O.$('#rPrev').addEventListener('click',()=>step(-1));
  if(O.$('#rNext')) O.$('#rNext').addEventListener('click',()=>step(1));

  O.$('#rAgent').addEventListener('change',e=>{ O.reportAgent = e.target.value; O.render(); });
  O.$('#rGoFu').addEventListener('click',()=>O.go('followups'));
  O.$('#rPdf').addEventListener('click',()=>R.download(R.build(R.current(), agent)));
  O.$('#rShare').addEventListener('click',()=>R.share(R.build(R.current(), agent)));
};
})(window.OAK);
