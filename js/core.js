/* ============ OAKCRAFT CRR TRACKER — CORE UTILITIES ============ */
window.OAK = window.OAK || {};
(function(O){
'use strict';
const C = () => O.CONFIG;

/* ---------- Number & currency formatting (Indian system) ---------- */
O.fmt = {
  n(v, d){ if(v==null||isNaN(v))return '—';
    return Number(v).toLocaleString('en-IN',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); },
  /* Indian short form: K / L (lakh) / Cr (crore) */
  short(v){ if(v==null||isNaN(v))return '—'; const n=Math.abs(v), s=v<0?'-':'';
    if(n>=1e7) return s+'₹'+(n/1e7).toFixed(n/1e7>=100?0:2)+' Cr';
    if(n>=1e5) return s+'₹'+(n/1e5).toFixed(n/1e5>=100?0:2)+' L';
    if(n>=1e3) return s+'₹'+(n/1e3).toFixed(n/1e3>=100?0:1)+'K';
    return s+'₹'+Math.round(n); },
  shortN(v){ if(v==null||isNaN(v))return '—'; const n=Math.abs(v),s=v<0?'-':'';
    if(n>=1e7)return s+(n/1e7).toFixed(2)+'Cr'; if(n>=1e5)return s+(n/1e5).toFixed(2)+'L';
    if(n>=1e3)return s+(n/1e3).toFixed(1)+'K'; return s+Math.round(n); },
  rs(v){ return v==null||isNaN(v) ? '—' : '₹'+Number(v).toLocaleString('en-IN',
    {minimumFractionDigits:0,maximumFractionDigits:0}); },
  pct(v,d){ return v==null||isNaN(v)?'—':Number(v).toFixed(d==null?1:d)+'%'; },
  date(s){ if(!s)return '—'; const d=new Date(s+'T00:00:00'); if(isNaN(d))return s;
    return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); },
  dateShort(s){ if(!s)return '—'; const d=new Date(s+'T00:00:00'); if(isNaN(d))return s;
    return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}); },
  month(s){ if(!s)return '—'; const [y,m]=s.split('-');
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+" '"+y.slice(2); },
  days(v){ if(v==null)return '—'; v=Math.round(v);
    if(v>=365) return (v/365).toFixed(1)+'y'; if(v>=30) return Math.round(v/30)+'mo'; return v+'d'; }
};
O.esc = s => String(s==null?'':s).replace(/[&<>"']/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
O.num = v => (typeof v==='number' && !isNaN(v)) ? v : 0;
O.el = (t,a,h)=>{const e=document.createElement(t);
  if(a)for(const k in a){ if(k==='class')e.className=a[k]; else if(k.startsWith('on'))
    e.addEventListener(k.slice(2),a[k]); else if(a[k]!=null)e.setAttribute(k,a[k]); }
  if(h!=null)e.innerHTML=h; return e;};
O.$ = (s,r)=> (r||document).querySelector(s);
O.$$ = (s,r)=> Array.from((r||document).querySelectorAll(s));
O.debounce=(f,ms)=>{let t;return function(){clearTimeout(t);const a=arguments,c=this;
  t=setTimeout(()=>f.apply(c,a),ms||220);};};

/* ---------- Colour ramps ---------- */
O.PALETTE = ['#f0a830','#4aa8ff','#2fd39a','#a78bfa','#f472b6','#2dd4bf','#ffb648',
             '#ff5f6d','#a3e635','#38bdf8','#fb923c','#c084fc','#34d399','#facc15'];
O.color = i => O.PALETTE[i % O.PALETTE.length];
O.heat = t => { t=Math.max(0,Math.min(1,t));
  const st=[[27,37,55],[36,92,122],[47,160,140],[200,170,60],[240,110,60],[214,50,70]];
  const x=t*(st.length-1), i=Math.min(st.length-2,Math.floor(x)), f=x-i;
  const a=st[i],b=st[i+1];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`; };
O.riskColor = b => ({Critical:'var(--bad)',High:'var(--warn)',Medium:'var(--info)',Low:'var(--ok)'}[b]||'var(--tx-3)');
O.riskTag   = b => ({Critical:'bad',High:'warn',Medium:'info',Low:'ok'}[b]||'mut');
O.confTag   = c => ({HIGH:'ok',MEDIUM:'warn',LOW:'mut'}[String(c).toUpperCase()]||'mut');
O.actionTag = a => /CALL NOW/i.test(a)?'bad' : /VISIT/i.test(a)?'acc' : /DEALER|TENDER/i.test(a)?'info'
              : /NURTURE|CATALOGUE/i.test(a)?'warn' : 'mut';

/* ---------- Toast ---------- */
O.toast = (msg, kind, ms) => {
  let w = O.$('.toast-wrap');
  if(!w){ w = O.el('div',{class:'toast-wrap'}); document.body.appendChild(w); }
  const t = O.el('div',{class:'toast'+(kind?' '+kind:'')}, O.esc(msg));
  w.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(30px)';
    t.style.transition='.25s'; setTimeout(()=>t.remove(),260); }, ms||2800);
};

/* ---------- Local persistence ---------- */
const LS = 'oakcraft_crr_v1';
O.store = {
  read(){ try{ return JSON.parse(localStorage.getItem(LS)||'{}'); }catch(e){ return {}; } },
  write(o){ try{ localStorage.setItem(LS, JSON.stringify(o)); return true; }catch(e){ return false; } },
  get(k,d){ const s=this.read(); return s[k]===undefined?d:s[k]; },
  set(k,v){ const s=this.read(); s[k]=v; return this.write(s); }
};

/* ---------- WhatsApp ---------- */
O.wa = {
  normalize(p){ let d=String(p||'').replace(/\D/g,'');
    if(d.length===10) d = C().countryCode + d;
    else if(d.length===11 && d[0]==='0') d = C().countryCode + d.slice(1);
    else if(d.length===12 && d.startsWith(C().countryCode)) {}
    return d; },
  valid(p){ const d=this.normalize(p); return d.length>=11 && d.length<=13; },
  render(body, rec){
    const map = {
      name: rec.customer_name || 'Sir/Madam',
      agent: O.store.get('agent', C().defaultAgent),
      last_order: rec.last_order ? O.fmt.date(rec.last_order) : 'a while ago',
      orders: O.num(rec.total_orders),
      value: O.fmt.rs(rec.total_value),
      state: rec.state || '',
      business: rec.verified_business_type || ''
    };
    return String(body).replace(/\{(\w+)\}/g, (m,k)=> map[k]!==undefined ? map[k] : m);
  },
  link(phone, text){
    return 'https://wa.me/' + this.normalize(phone) +
           (text ? '?text=' + encodeURIComponent(text) : ''); },
  open(phone, text){ window.open(this.link(phone,text), '_blank', 'noopener'); }
};

/* ---------- CSV export ---------- */
O.csv = {
  build(rows, cols){
    const head = cols.map(c=>`"${String(c.label).replace(/"/g,'""')}"`).join(',');
    const body = rows.map(r => cols.map(c=>{
      let v = typeof c.get==='function' ? c.get(r) : r[c.key];
      if(v==null) v='';
      if(Array.isArray(v)) v=v.join(' | ');
      return `"${String(v).replace(/"/g,'""')}"`;
    }).join(',')).join('\n');
    return head+'\n'+body;
  },
  download(name, text){
    const blob = new Blob(['﻿'+text], {type:'text/csv;charset=utf-8;'});
    const a = O.el('a',{href:URL.createObjectURL(blob), download:name});
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },300);
  }
};

/* ---------- Duplicate suppression by mobile number ----------------
   The workbook carries the same buyer more than once (spelling variants,
   a second Sr. No., a firm and its proprietor). The phone number is the
   only hard identifier in the file, so two records that share a mobile
   are treated as one customer and only the richer record is listed.
   Sheet 13 (DUPLICATES & SHARED PHONES) is never de-duplicated — showing
   the duplicates IS that sheet's job.                                  */
O.phoneKeys = rec => {
  const out = [];
  (rec && rec.phones || []).forEach(p=>{
    const d = String(p||'').replace(/\D/g,'');
    if(d.length >= 10) out.push(d.slice(-10));
  });
  return out;
};
/* Richer = more billed value, then more orders, then a more recent order. */
function richer(a, b){
  const d = O.num(b.total_value) - O.num(a.total_value); if(d) return d;
  const o = O.num(b.total_orders) - O.num(a.total_orders); if(o) return o;
  return String(b.last_order||'').localeCompare(String(a.last_order||''));
}
O.dedupeByPhone = function(rows){
  rows = rows || [];
  const keys = rows.map(O.phoneKeys);

  /* Union-find so a chain still collapses to one customer: if record A
     shares one number with B and another with C, A, B and C are one. */
  const parent = rows.map((_,i)=>i);
  const find = i => { while(parent[i]!==i){ parent[i]=parent[parent[i]]; i=parent[i]; } return i; };
  const union = (a,b)=>{ a=find(a); b=find(b); if(a!==b) parent[b]=a; };
  const owner = new Map();
  keys.forEach((ks,i)=> ks.forEach(k=>{
    if(owner.has(k)) union(owner.get(k), i); else owner.set(k, i);
  }));

  /* One survivor per group — the record carrying the most business. */
  const survivor = new Map();
  rows.forEach((r,i)=>{
    if(!keys[i].length) return;            // no number — nothing to match on
    const g = find(i), cur = survivor.get(g);
    if(cur===undefined || richer(r, rows[cur]) < 0) survivor.set(g, i);
  });

  const kept = rows.filter((r,i)=> !keys[i].length || survivor.get(find(i))===i);
  kept.removed = rows.length - kept.length;
  return kept;
};

/* ---------- Sorting / filtering helpers ---------- */
O.sortBy = (arr, key, dir) => {
  const d = dir==='asc' ? 1 : -1;
  return arr.slice().sort((a,b)=>{
    let x=a[key], y=b[key];
    const xn = typeof x==='number', yn = typeof y==='number';
    if(xn && yn) return (x-y)*d;
    if(x==null||x==='') return 1; if(y==null||y==='') return -1;
    return String(x).localeCompare(String(y),'en',{numeric:true})*d;
  });
};
O.uniq = (arr,key) => {
  const s=new Set(); arr.forEach(r=>{ const v=r[key]; if(v!=null&&v!=='') s.add(String(v)); });
  return Array.from(s).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
};
O.matches = (rec, q) => {
  if(!q) return true; q = q.toLowerCase();
  for(const k in rec){ const v = rec[k];
    if(v==null) continue;
    if(Array.isArray(v)){ if(v.join(' ').toLowerCase().includes(q)) return true; continue; }
    if(typeof v==='object') continue;
    if(String(v).toLowerCase().includes(q)) return true; }
  return false;
};
})(window.OAK);
