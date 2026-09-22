/* ====== OAKCRAFT — DATA GRID (sort / filter / paginate / export) ====== */
(function(O){
'use strict';

/* Column presets built from the REAL column keys in the workbook */
const LBL = {
  sr_no:'Sr#', customer_name:'Customer', verified_business_type:'Business Type',
  what_they_do:'What They Do', trade_evidence:'Trade Evidence', state:'State',
  segment:'Segment', seg_label:'Segment', total_orders:'Orders',
  total_value:'Total Value', aov:'AOV', last_order:'Last Order', days_since:'Days Since',
  gap_reason:'Likely Gap / Churn Reason', pitch_angle:'Pitch Angle',
  recommended_action:'Action', phone:'Phone', phone_on_file:'Phone On File',
  confidence:'Confidence', upside:'12M Upside', source_url:'Source',
  gstin:'GSTIN / UIN', address:'Address', quality_flag:'Data Quality Flag',
  group:'Group', sr_nos:'Sr. Nos.', records:'Records', records_in_group:'# In Group',
  combined_value:'Combined Value', states:'State(s)', gstins:'GSTIN(s)',
  evidence:'Evidence / What To Do',
  churn_risk:'Risk %', risk_band:'Risk', abc:'ABC', rfm:'RFM', value_at_risk:'Value At Risk'
};
const NUMCOL = new Set(['sr_no','total_orders','total_value','aov','days_since','upside',
  'combined_value','records_in_group','churn_risk','value_at_risk','cum_share']);
const MONEY  = new Set(['total_value','aov','upside','combined_value','value_at_risk']);
const WIDE   = new Set(['gap_reason','pitch_angle','what_they_do','evidence','address',
  'verified_business_type','trade_evidence','records','quality_flag','segment','source_url']);

O.gridLabel = k => LBL[k] || k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

/* Columns deliberately kept out of every section's table. They are
   per-customer figures, not list-scanning figures, so they live in the
   customer detail panel (click any customer) instead of the grid.      */
O.HIDDEN_COLS = new Set(['total_value','aov','last_order']);
O.visibleCols = cols => (cols||[]).filter(k=>!O.HIDDEN_COLS.has(k));

function renderCell(key, rec){
  const v = rec[key];
  if(key==='customer_name')
    return `<div class="cell-name" data-act="open">${O.esc(v)}</div>`;
  if(key==='phone'){
    if(!rec.phones || !rec.phones.length)
      return `<span class="tag bad">NO PHONE</span>`;
    return `<span style="font-family:var(--fm);font-size:11.5px">${O.esc(rec.phones.join(', '))}</span>`;
  }
  if(key==='phone_on_file')
    return rec.has_phone ? `<span class="tag ok">Yes</span>` : `<span class="tag bad">No phone</span>`;
  if(key==='confidence' && v) return `<span class="tag ${O.confTag(v)}">${O.esc(v)}</span>`;
  if(key==='recommended_action' && v) return `<span class="tag ${O.actionTag(v)}">${O.esc(v)}</span>`;
  if(key==='risk_band' && v) return `<span class="tag ${O.riskTag(v)}">${O.esc(v)}</span>`;
  if(key==='abc' && v) return `<span class="tag ${v==='A'?'ok':v==='B'?'info':'mut'}">${v}</span>`;
  if(key==='segment'||key==='seg_label'){
    const code = rec.seg_code||''; const lb = rec.seg_label||v||'';
    if(!lb) return '<span style="color:var(--tx-3)">—</span>';
    const t = code==='A'?'ok':code==='B'?'warn':code==='E'?'bad':code==='C'?'mut':'info';
    return `<span class="tag ${t}" title="${O.esc(v)}">${O.esc(lb)}</span>`;
  }
  if(key==='last_order') return v?O.fmt.dateShort(v):'—';
  if(key==='days_since') {
    if(v==null) return '—';
    const c = v>365?'var(--bad)':v>180?'var(--warn)':v>90?'var(--info)':'var(--ok)';
    return `<span style="color:${c};font-weight:650">${O.fmt.n(v)}</span>`;
  }
  if(key==='churn_risk'){ if(v==null)return '—';
    return `<span style="color:${O.riskColor(rec.risk_band)};font-weight:650">${v}</span>`; }
  if(key==='source_url' && v){
    if(/^https?:/.test(v)) return `<a href="${O.esc(v)}" target="_blank" rel="noopener"
      class="cell-clip" style="color:var(--info)" title="${O.esc(v)}">${O.esc(v.replace(/^https?:\/\//,''))}</a>`;
    return `<span class="cell-clip" title="${O.esc(v)}">${O.esc(v)}</span>`;
  }
  if(MONEY.has(key)) return v==null?'—':O.fmt.rs(v);
  if(NUMCOL.has(key)) return v==null?'—':O.fmt.n(v);
  if(v==null||v==='') return '<span style="color:var(--tx-3)">—</span>';
  if(WIDE.has(key)) return `<div class="cell-clip" title="${O.esc(v)}">${O.esc(v)}</div>`;
  return O.esc(v);
}

/* ---------------- Grid component ---------------- */
O.Grid = function(opts){
  const st = {
    rows: opts.rows||[], cols: O.visibleCols(opts.cols), q:'', filters:{},
    sort: opts.sort || ((opts.cols||[]).some(c=>c==='total_value') ? 'total_value':null),
    dir: opts.dir||'desc', page:1, size: opts.pageSize || (O.CONFIG.pageSize||50),
    onOpen: opts.onOpen
  };
  const host = opts.host;
  const filterDefs = opts.filters||[];

  function visible(){
    let r = st.rows;
    if(st.q) r = r.filter(x=>O.matches(x, st.q));
    for(const k in st.filters){
      const v = st.filters[k]; if(!v) continue;
      if(k==='__phone') r = r.filter(x=> v==='yes' ? x.has_phone : !x.has_phone);
      else r = r.filter(x=> String(x[k]||'')===v);
    }
    if(st.sort) r = O.sortBy(r, st.sort, st.dir);
    return r;
  }

  function build(){
    host.innerHTML='';
    /* --- filter bar --- */
    const fb = O.el('div',{class:'filters'});
    const fs = O.el('div',{class:'fsearch'});
    fs.innerHTML = `<span>&#128269;</span><input type="search" placeholder="Search ${O.fmt.n(st.rows.length)} records…" value="${O.esc(st.q)}">`;
    fs.querySelector('input').addEventListener('input', O.debounce(e=>{
      st.q=e.target.value.trim(); st.page=1; paint(); },200));
    fb.appendChild(fs);

    filterDefs.forEach(f=>{
      const sel=O.el('select',{class:'fsel'});
      let vals;
      if(f.key==='__phone') vals=[['yes','Has phone'],['no','No phone']];
      else vals=O.uniq(st.rows,f.key).map(v=>[v, v.length>34?v.slice(0,34)+'…':v]);
      sel.innerHTML = `<option value="">${O.esc(f.label)}: All</option>` +
        vals.map(([v,l])=>`<option value="${O.esc(v)}"${st.filters[f.key]===v?' selected':''}>${O.esc(l)}</option>`).join('');
      sel.addEventListener('change',e=>{ st.filters[f.key]=e.target.value; st.page=1; paint(); });
      fb.appendChild(sel);
    });
    const clr=O.el('button',{class:'btn sm ghost'},'&#10005; Clear');
    clr.addEventListener('click',()=>{ st.q=''; st.filters={}; st.page=1; build(); });
    fb.appendChild(clr);
    const exp=O.el('button',{class:'btn sm'},'&#8681; CSV');
    exp.addEventListener('click',()=>{
      const rows=visible();
      const cols=st.cols.map(k=>({key:k,label:O.gridLabel(k),
        get:r=> k==='phone' ? (r.phones||[]).join(' | ') : r[k]}));
      O.csv.download((opts.exportName||'oakcraft-export')+'.csv', O.csv.build(rows,cols));
      O.toast(`Exported ${rows.length} real records to CSV`); });
    fb.appendChild(exp);
    host.appendChild(fb);

    host.appendChild(O.el('div',{class:'tbl-wrap',id:'gw'}));
    host.appendChild(O.el('div',{class:'tbl-foot',id:'gf'}));
    paint();
  }

  function paint(){
    const all = visible();
    const pages = Math.max(1, Math.ceil(all.length/st.size));
    if(st.page>pages) st.page=pages;
    const slice = all.slice((st.page-1)*st.size, st.page*st.size);
    const wrap = host.querySelector('#gw');

    let h = '<table class="dt"><thead><tr>';
    st.cols.forEach(k=>{
      const num = NUMCOL.has(k);
      h += `<th class="${num?'num':''}${st.sort===k?' sorted':''}" data-k="${k}">${O.esc(O.gridLabel(k))}`+
           `<span class="sort">${st.sort===k?(st.dir==='asc'?'▲':'▼'):'▾'}</span></th>`;
    });
    h += '<th class="num" style="cursor:default">Actions</th></tr></thead><tbody>';
    if(!slice.length) h += `<tr><td colspan="${st.cols.length+1}"><div class="empty">`+
      `<div class="empty-ico">&#128269;</div><b>No records match</b>Adjust your search or filters</div></td></tr>`;
    slice.forEach((r,i)=>{
      const idx = (st.page-1)*st.size+i;
      h += `<tr data-i="${idx}"${!r.has_phone && r.customer_name?' class="no-phone"':''}>`;
      st.cols.forEach(k=> h += `<td class="${NUMCOL.has(k)?'num':''}">${renderCell(k,r)}</td>`);
      h += `<td class="num"><div class="rowact">`;
      if(r.phones && r.phones.length)
        h += `<button class="ra wa" data-act="wa" title="WhatsApp ${O.esc(r.phones[0])}">&#128172;</button>`+
             `<button class="ra call" data-act="tel" title="Call ${O.esc(r.phones[0])}">&#128222;</button>`;
      if(r.customer_name)
        h += `<button class="ra log" data-act="log" title="Log call activity">&#9998;</button>`+
             `<button class="ra" data-act="open" title="Open full record">&#8250;</button>`;
      h += `</div></td></tr>`;
    });
    h += '</tbody></table>';
    wrap.innerHTML = h;

    wrap.querySelectorAll('th[data-k]').forEach(th=>th.addEventListener('click',()=>{
      const k=th.dataset.k;
      if(st.sort===k) st.dir = st.dir==='asc'?'desc':'asc';
      else { st.sort=k; st.dir = NUMCOL.has(k)?'desc':'asc'; }
      paint();
    }));
    wrap.querySelectorAll('tbody tr[data-i]').forEach(tr=>{
      tr.addEventListener('click', e=>{
        const rec = all[+tr.dataset.i]; if(!rec) return;
        const act = e.target.closest('[data-act]')?.dataset.act;
        if(act==='wa'){ e.stopPropagation(); O.quickWA(rec); }
        else if(act==='tel'){ e.stopPropagation(); location.href='tel:+'+O.wa.normalize(rec.phones[0]); }
        else if(act==='log'){ e.stopPropagation(); O.Tracker.openLog(rec); }
        else if(act==='open'){ e.stopPropagation(); (st.onOpen||O.openCustomer)(rec); }
      });
    });

    const foot = host.querySelector('#gf');
    let pg='';
    const win=[]; const S=Math.max(1,st.page-2), E=Math.min(pages,S+4);
    for(let p=S;p<=E;p++) win.push(p);
    pg += `<button class="pg" ${st.page===1?'disabled':''} data-p="1">&#171;</button>`;
    pg += `<button class="pg" ${st.page===1?'disabled':''} data-p="${st.page-1}">&#8249;</button>`;
    win.forEach(p=> pg += `<button class="pg${p===st.page?' on':''}" data-p="${p}">${p}</button>`);
    pg += `<button class="pg" ${st.page===pages?'disabled':''} data-p="${st.page+1}">&#8250;</button>`;
    pg += `<button class="pg" ${st.page===pages?'disabled':''} data-p="${pages}">&#187;</button>`;
    const sumVal = all.reduce((s,r)=>s+O.num(r.total_value),0);
    const sumUp  = all.reduce((s,r)=>s+O.num(r.upside),0);
    foot.innerHTML = `<span><b style="color:var(--tx)">${O.fmt.n(all.length)}</b> of ${O.fmt.n(st.rows.length)} records</span>`+
      (sumVal?`<span>Value: <b style="color:var(--acc-2);font-family:var(--fm)">${O.fmt.short(sumVal)}</b></span>`:'')+
      (sumUp?`<span>Upside: <b style="color:var(--ok);font-family:var(--fm)">${O.fmt.short(sumUp)}</b></span>`:'')+
      `<div class="pager">${pg}</div>`;
    foot.querySelectorAll('.pg[data-p]').forEach(b=>b.addEventListener('click',()=>{
      st.page=+b.dataset.p; paint();
      host.closest('.panel')?.scrollIntoView({behavior:'smooth',block:'start'}); }));
  }

  build();
  return { refresh: build, state: st, visible };
};
})(window.OAK);
