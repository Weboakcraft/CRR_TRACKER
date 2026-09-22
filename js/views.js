/* ====== OAKCRAFT — VIEWS ====== */
(function(O){
'use strict';
const C=()=>O.CONFIG, Ch=()=>O.Charts;
const V = O.Views = {};

/* ---------- shared builders ---------- */
function head(eyebrow, title, sub, callout){
  return `<div class="page-head">
    <div class="page-eyebrow">${eyebrow}</div>
    <h1 class="page-title">${O.esc(title)}</h1>
    ${sub?`<div class="page-sub">${O.esc(sub)}</div>`:''}
  </div>${callout?`<div class="callout">${callout}</div>`:''}`;
}
function kpi(o){
  return `<div class="kpi" style="--kc:${o.color||'var(--acc)'};--kb:${o.bg||'var(--acc-dim)'}">
    <div class="kpi-top"><div class="kpi-label">${O.esc(o.label)}</div>
      <div class="kpi-ico">${o.ico||''}</div></div>
    <div class="kpi-val">${o.value}</div>
    ${o.sub?`<div class="kpi-sub">${o.sub}</div>`:''}
    ${o.bar!=null?`<div class="kpi-bar"><i style="width:${Math.min(100,o.bar)}%"></i></div>`:''}
  </div>`;
}
function panel(title, desc, id, tools, flush){
  return `<div class="panel"><div class="panel-head">
    <div><div class="panel-title">${title}</div>${desc?`<div class="panel-desc">${desc}</div>`:''}</div>
    ${tools?`<div class="panel-tools">${tools}</div>`:''}</div>
    <div class="panel-body${flush?' flush':''}" id="${id}"></div></div>`;
}
function miniTable(rows, cols){
  return `<div class="tbl-wrap"><table class="dt"><thead><tr>${
    cols.map(c=>`<th class="${c.num?'num':''}">${c.label}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r=>`<tr data-n="${O.esc(r.customer_name||'')}" style="cursor:pointer">${
      cols.map(c=>`<td class="${c.num?'num':''}">${c.get(r)}</td>`).join('')}</tr>`).join('')
    }</tbody></table></div>`;
}
function wireRows(host){
  O.$$('tbody tr[data-n]',host).forEach(tr=>tr.addEventListener('click',()=>{
    const c=O.data.customers.find(x=>x.customer_name===tr.dataset.n); if(c) O.openCustomer(c); }));
}

/* ==================================================================
   1. EXECUTIVE DASHBOARD
   ================================================================== */
V.dashboard = function(host){
  const A=O.data.analytics, K=A.kpi, M=O.data.meta;
  host.innerHTML = head('Command Center', 'Executive Dashboard',
    `Live view of all ${O.fmt.n(K.total_customers)} real customer accounts extracted from ${O.esc(M.source_file)} across ${O.modules().length} modules. Every figure below is computed directly from the source workbook — nothing is estimated or sampled.`) +
  `<div class="kpis">
    ${kpi({label:'Total Book Value', value:O.fmt.short(K.total_value), ico:'&#8377;',
      sub:`<span>${O.fmt.n(K.total_orders)} orders &middot; AOV ${O.fmt.short(K.avg_aov)}</span>`})}
    ${kpi({label:'Identified Upside', value:O.fmt.short(K.total_upside), ico:'&#9650;',
      color:'var(--ok)', bg:'var(--ok-dim)',
      sub:`<span>${O.fmt.pct(K.total_upside/K.total_value*100,0)} of current book</span>`,
      bar:K.total_upside/K.total_value*100})}
    ${kpi({label:'Revenue At Risk', value:O.fmt.short(K.value_at_risk), ico:'&#9888;',
      color:'var(--bad)', bg:'var(--bad-dim)',
      sub:`<span>${O.fmt.n(K.critical_risk)} accounts in critical band</span>`,
      bar:K.value_at_risk/K.total_value*100})}
    ${kpi({label:'Total Accounts', value:O.fmt.n(K.total_customers), ico:'&#128101;',
      color:'var(--info)', bg:'var(--info-dim)',
      sub:`<span>${O.fmt.n(K.repeat_customers)} repeat &middot; ${O.fmt.n(K.one_time)} one-time</span>`})}
    ${kpi({label:'Active (90 days)', value:O.fmt.n(K.active_90d), ico:'&#9889;',
      color:'var(--ok)', bg:'var(--ok-dim)',
      sub:`<span>${O.fmt.pct(K.active_90d/K.total_customers*100,0)} of base</span>`,
      bar:K.active_90d/K.total_customers*100})}
    ${kpi({label:'Lapsed (180 days+)', value:O.fmt.n(K.lapsed_180d), ico:'&#8987;',
      color:'var(--warn)', bg:'var(--warn-dim)',
      sub:`<span>${O.fmt.pct(K.lapsed_180d/K.total_customers*100,0)} need win-back</span>`,
      bar:K.lapsed_180d/K.total_customers*100})}
    ${kpi({label:'Reachable Now', value:O.fmt.n(K.with_phone), ico:'&#128222;',
      color:'var(--wa)', bg:'rgba(37,211,102,.13)',
      sub:`<span style="color:var(--bad)">${O.fmt.n(K.no_phone)} have no phone on file</span>`,
      bar:K.with_phone/K.total_customers*100})}
    ${kpi({label:'A-Class Accounts', value:O.fmt.n(K.a_class), ico:'&#9733;',
      color:'var(--purple)', bg:'rgba(167,139,250,.13)',
      sub:`<span>Drive 80% of all revenue</span>`, bar:K.a_class/K.total_customers*100})}
  </div>

  <div class="grid g-21">
    ${panel('Order Recency Timeline','When each account last bought — count of accounts by month of last order','c-trend',
      '<span class="tag mut">30 months of real order history</span>')}
    ${panel('Customer Health Mix','Share of accounts by churn-risk band','c-risk')}
  </div>

  <div class="grid g-12">
    ${panel('Recency Buckets','Accounts and book value by days since last order','c-recency')}
    ${panel('Revenue By State','Top states by total order value — click a bar to filter','c-state',
      `<button class="btn xs" id="stateAll">View all ${A.by_state.length}</button>`)}
  </div>

  <div class="grid g2">
    ${panel('Lifecycle Segments','Segment classification carried in the workbook','c-seg')}
    ${panel('Recommended Actions','What the data says to do next, weighted by upside','c-action')}
  </div>

  <div class="grid g3">
    ${panel('Top 12 Accounts By Value','','t-top',
      '<button class="btn xs" id="expTop">&#8681;</button>', true)}
    ${panel('Biggest Revival Upside','Highest 12-month upside if reactivated','t-up','',true)}
    ${panel('Largest Revenue At Risk','Value weighted by churn probability','t-risk','',true)}
  </div>`;

  Ch().area(O.$('#c-trend'), A.monthly_last_order.map(m=>({
    key:m.key, label:O.fmt.month(m.key), value:m.count, count:m.count})),
    {height:236, color:'var(--acc)', format:v=>Math.round(v), vLabel:'Accounts last ordered:'});

  Ch().donut(O.$('#c-risk'), A.by_risk.map(r=>({key:r.key, value:r.count, count:r.count,
    color:O.riskColor(r.key)})), {size:180, centerValue:O.fmt.n(K.total_customers),
    centerLabel:'ACCOUNTS', format:v=>O.fmt.n(v)+' acct',
    onClick:d=>{ O.route={page:'queue',param:null}; O.render(); }});

  Ch().bars(O.$('#c-recency'), A.recency_buckets.map((b,i)=>({
    key:b.key, label:b.key+'d', value:b.count, count:b.count,
    color:['var(--ok)','var(--ok)','var(--info)','var(--warn)','var(--bad)','var(--bad)'][i]})),
    {height:210, format:v=>Math.round(v), vLabel:'Accounts:'});

  Ch().hbars(O.$('#c-state'), A.by_state.slice(0,9).map(s=>({key:s.key,value:s.value,count:s.count})),
    {limit:9, onClick:d=>{ O.stateFilter=d.key; O.go('queue'); }});
  O.$('#stateAll').addEventListener('click',()=>O.go('analytics'));

  Ch().donut(O.$('#c-seg'), A.by_segment.filter(s=>s.key!=='Unspecified')
    .map((s,i)=>({key:s.key, value:s.count, count:s.count, color:O.color(i)})),
    {size:172, format:v=>O.fmt.n(v)});

  Ch().hbars(O.$('#c-action'), A.recommended_actions.map(a=>({key:a.key, value:a.upside, count:a.count})),
    {vLabel:'Upside'});

  O.$('#t-top').innerHTML = miniTable(A.top_by_value.slice(0,12), [
    {label:'Customer', get:r=>`<div class="cell-name" style="max-width:190px">${O.esc(r.customer_name)}</div>`},
    {label:'State', get:r=>`<span style="color:var(--tx-3);font-size:11.5px">${O.esc(r.state||'—')}</span>`},
    {label:'Orders', num:1, get:r=>O.fmt.n(r.total_orders)},
    {label:'Value', num:1, get:r=>`<b style="color:var(--acc-2)">${O.fmt.short(r.total_value)}</b>`}]);
  O.$('#t-up').innerHTML = miniTable(A.top_by_upside.slice(0,12), [
    {label:'Customer', get:r=>`<div class="cell-name" style="max-width:180px">${O.esc(r.customer_name)}</div>`},
    {label:'Gap', num:1, get:r=>`<span style="color:var(--warn)">${O.fmt.n(r.days_since)}d</span>`},
    {label:'Upside', num:1, get:r=>`<b style="color:var(--ok)">${O.fmt.short(r.upside)}</b>`}]);
  O.$('#t-risk').innerHTML = miniTable(A.top_at_risk.slice(0,12), [
    {label:'Customer', get:r=>`<div class="cell-name" style="max-width:180px">${O.esc(r.customer_name)}</div>`},
    {label:'Risk', num:1, get:r=>`<span style="color:var(--bad)">${r.churn_risk}%</span>`},
    {label:'At Risk', num:1, get:r=>`<b style="color:var(--bad)">${O.fmt.short(r.value_at_risk)}</b>`}]);
  wireRows(host);
  O.$('#expTop').addEventListener('click',()=>{
    O.csv.download('oakcraft-top-accounts.csv', O.csv.build(A.top_by_value,[
      {key:'customer_name',label:'Customer'},{key:'state',label:'State'},
      {key:'total_orders',label:'Orders'},{key:'total_value',label:'Total Value'}]));
    O.toast('Top accounts exported'); });
};

/* ==================================================================
   2. ADVANCED ANALYTICS
   ================================================================== */
V.analytics = function(host){
  const A=O.data.analytics, cs=O.data.customers, K=A.kpi;
  const ranked = cs.filter(c=>O.num(c.total_value)>0).slice(0,180);

  host.innerHTML = head('Analytics Workbench','Advanced Analytics',
    'RFM segmentation, Pareto concentration, churn modelling and geography — all computed live from the real order history in the workbook.') +
  `<div class="grid g-21">
    ${panel('Pareto / ABC Concentration','How much of the book sits in how few accounts. Amber = first 80% of revenue, blue = next 15%, grey = tail.','c-pareto',
      `<span class="tag ok">${O.fmt.n(K.a_class)} A</span>
       <span class="tag info">${O.fmt.n(A.by_abc.find(x=>x.key==='B')?.count||0)} B</span>
       <span class="tag mut">${O.fmt.n(A.by_abc.find(x=>x.key==='C')?.count||0)} C</span>`)}
    ${panel('ABC Value Split','Book value by class','c-abc')}
  </div>

  <div class="grid g-12">
    ${panel('RFM Matrix','Recency × Frequency. Cell colour = total book value. Click any cell to open that group.','c-rfm')}
    ${panel('Value vs Recency Bubble','X = days since last order, Y = total value (log scale), bubble size = 12-month upside. Accounts to the right are going cold; the biggest bubbles there are the most valuable to revive.','c-scatter')}
  </div>

  <div class="grid g2">
    ${panel('State Performance Matrix','Value, accounts and upside by state','c-states',
      '<button class="btn xs" id="expState">&#8681; CSV</button>', true)}
    ${panel('Business Type Ranking','Researched business type — the real classification, not the original file labels','c-biz')}
  </div>

  <div class="grid g2">
    ${panel('Research Confidence','How reliable the enrichment is per account','c-conf')}
    ${panel('Trade Evidence Mix','Evidence that an account is in the furniture/interiors trade','c-trade')}
  </div>

  <div class="grid g-21">
    ${panel('Revival Simulator','Move the sliders to model what a revival campaign is worth. Base numbers are the real upside figures in the workbook.','c-sim')}
    ${panel('Concentration Risk','Share of the book held by the largest accounts','c-conc')}
  </div>`;

  Ch().pareto(O.$('#c-pareto'), ranked.map(c=>({key:c.customer_name, value:O.num(c.total_value)})),
    {height:268, onClick:d=>{ const c=cs.find(x=>x.customer_name===d.key); if(c)O.openCustomer(c); }});

  Ch().donut(O.$('#c-abc'), A.by_abc.map(a=>({key:'Class '+a.key, value:a.value, count:a.count,
    color:a.key==='A'?'var(--acc)':a.key==='B'?'var(--info)':'var(--tx-3)'})),
    {size:172, centerValue:O.fmt.short(K.total_value), centerLabel:'TOTAL BOOK'});

  /* RFM matrix */
  const cell={};
  cs.forEach(c=>{ if(!c.R) return; const k=c.R+'-'+c.F;
    (cell[k]=cell[k]||{n:0,v:0,list:[]}); cell[k].n++; cell[k].v+=O.num(c.total_value); cell[k].list.push(c); });
  const maxV=Math.max(1,...Object.values(cell).map(x=>x.v));
  let rh='<div class="rfm"><div></div>'+[1,2,3,4,5].map(f=>`<div class="rfm-ax">F${f}</div>`).join('');
  [5,4,3,2,1].forEach(r=>{ rh+=`<div class="rfm-ax">R${r}</div>`;
    [1,2,3,4,5].forEach(f=>{ const d=cell[r+'-'+f];
      rh+=`<div class="rfm-c" data-r="${r}" data-f="${f}" style="background:${d?O.heat(d.v/maxV):'var(--bg-4)'};
        color:${d&&d.v/maxV>.45?'#fff':'var(--tx-2)'}" title="R${r} F${f}">${d?d.n:''}</div>`; });
  });
  rh+='</div><div style="display:flex;align-items:center;gap:8px;margin-top:11px;font-size:11px;color:var(--tx-3)">'+
    '<span>Low value</span><div style="flex:1;height:8px;border-radius:5px;background:linear-gradient(90deg,'+
    [0,.2,.4,.6,.8,1].map(t=>O.heat(t)).join(',')+')"></div><span>High value</span></div>'+
    '<div style="margin-top:9px;font-size:11.5px;color:var(--tx-3)">R5 = most recent buyers &middot; F5 = most frequent. '+
    'Cell number = how many real accounts sit there.</div>';
  O.$('#c-rfm').innerHTML=rh;
  O.$$('#c-rfm .rfm-c').forEach(el=>el.addEventListener('click',()=>{
    const d=cell[el.dataset.r+'-'+el.dataset.f]; if(!d||!d.list.length) return;
    O.rfmSel=d.list; O.go('queue'); }));

  Ch().scatter(O.$('#c-scatter'), cs.filter(c=>O.num(c.total_value)>50000).slice(0,320).map(c=>({
    x:O.num(c.days_since), y:O.num(c.total_value), r:O.num(c.upside),
    label:c.customer_name, color:O.riskColor(c.risk_band), _c:c})),
    {height:300, logY:true, xLabel:'Days since last order', yLabel:'Total order value (log)',
     yFormat:O.fmt.shortN, xFormat:v=>Math.round(v)+'d',
     tip:p=>`Value ${O.fmt.short(p.y)}<br>${Math.round(p.x)} days ago<br>Upside ${O.fmt.short(p.r)}`,
     onClick:p=>O.openCustomer(p._c)});

  O.$('#c-states').innerHTML = `<div class="tbl-wrap" style="max-height:340px"><table class="dt"><thead><tr>
    <th>State</th><th class="num">Accounts</th><th class="num">Orders</th>
    <th class="num">Book Value</th><th class="num">Upside</th><th class="num">Share</th></tr></thead><tbody>
    ${A.by_state.map(s=>`<tr><td style="font-weight:600">${O.esc(s.key)}</td>
      <td class="num">${O.fmt.n(s.count)}</td><td class="num">${O.fmt.n(s.orders)}</td>
      <td class="num"><b style="color:var(--acc-2)">${O.fmt.short(s.value)}</b></td>
      <td class="num" style="color:var(--ok)">${O.fmt.short(s.upside)}</td>
      <td class="num">${O.fmt.pct(s.value/K.total_value*100)}</td></tr>`).join('')}
    </tbody></table></div>`;
  O.$('#expState').addEventListener('click',()=>{
    O.csv.download('oakcraft-state-performance.csv', O.csv.build(A.by_state,[
      {key:'key',label:'State'},{key:'count',label:'Accounts'},{key:'orders',label:'Orders'},
      {key:'value',label:'Book Value'},{key:'upside',label:'Upside'}]));
    O.toast('State matrix exported'); });

  Ch().hbars(O.$('#c-biz'), A.by_business.slice(0,11).map(b=>({key:b.key,value:b.value,count:b.count})),{limit:11});
  Ch().donut(O.$('#c-conf'), A.by_confidence.map(c=>({key:c.key, value:c.count, count:c.count,
    color:c.key==='HIGH'?'var(--ok)':c.key==='MEDIUM'?'var(--warn)':c.key==='LOW'?'var(--tx-3)':'var(--bg-4)'})),
    {size:168, format:v=>O.fmt.n(v)});
  Ch().hbars(O.$('#c-trade'), A.by_trade.slice(0,8).map(t=>({key:t.key||'Not evidenced',value:t.value,count:t.count})),{limit:8});

  /* Revival simulator */
  const lapsed = cs.filter(c=>O.num(c.days_since)>120);
  const pool = lapsed.reduce((s,c)=>s+O.num(c.upside),0);
  O.$('#c-sim').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:15px">
      <div><label style="font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--tx-3);text-transform:uppercase">
        Accounts contacted <b id="s1v" style="color:var(--acc-2);float:right">100%</b></label>
        <input type="range" id="s1" min="10" max="100" value="100" style="width:100%;margin-top:8px;accent-color:var(--acc)"></div>
      <div><label style="font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--tx-3);text-transform:uppercase">
        Reactivation rate <b id="s2v" style="color:var(--acc-2);float:right">20%</b></label>
        <input type="range" id="s2" min="1" max="60" value="20" style="width:100%;margin-top:8px;accent-color:var(--acc)"></div>
      <div><label style="font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--tx-3);text-transform:uppercase">
        Upside realised <b id="s3v" style="color:var(--acc-2);float:right">60%</b></label>
        <input type="range" id="s3" min="10" max="100" value="60" style="width:100%;margin-top:8px;accent-color:var(--acc)"></div>
    </div>
    <div class="dr-grid" style="margin-top:17px">
      <div class="dr-stat"><b id="simA">—</b><span>Accounts Worked</span></div>
      <div class="dr-stat"><b id="simB" style="color:var(--info)">—</b><span>Expected Revivals</span></div>
      <div class="dr-stat"><b id="simC" style="color:var(--ok)">—</b><span>Projected Revenue</span></div>
      <div class="dr-stat"><b id="simD">—</b><span>Per Revived Account</span></div>
    </div>
    <div style="margin-top:13px;font-size:11.5px;color:var(--tx-3);line-height:1.6">
      Pool: <b style="color:var(--tx-2)">${O.fmt.n(lapsed.length)}</b> real accounts lapsed 120+ days,
      carrying <b style="color:var(--tx-2)">${O.fmt.short(pool)}</b> of estimated 12-month upside in the source file.</div>`;
  const sim=()=>{ const a=+O.$('#s1').value, b=+O.$('#s2').value, c3=+O.$('#s3').value;
    O.$('#s1v').textContent=a+'%'; O.$('#s2v').textContent=b+'%'; O.$('#s3v').textContent=c3+'%';
    const worked=Math.round(lapsed.length*a/100), rev=Math.round(worked*b/100);
    const money=pool*(a/100)*(b/100)*(c3/100);
    O.$('#simA').textContent=O.fmt.n(worked); O.$('#simB').textContent=O.fmt.n(rev);
    O.$('#simC').textContent=O.fmt.short(money);
    O.$('#simD').textContent= rev? O.fmt.short(money/rev):'—'; };
  ['s1','s2','s3'].forEach(id=>O.$('#'+id).addEventListener('input',sim)); sim();

  const top10=cs.slice(0,10).reduce((s,c)=>s+O.num(c.total_value),0);
  const top50=cs.slice(0,50).reduce((s,c)=>s+O.num(c.total_value),0);
  const top1=cs.slice(0,1).reduce((s,c)=>s+O.num(c.total_value),0);
  Ch().hbars(O.$('#c-conc'),[
    {key:'Largest account', value:top1/K.total_value*100, color:'var(--bad)'},
    {key:'Top 10 accounts', value:top10/K.total_value*100, color:'var(--warn)'},
    {key:'Top 50 accounts', value:top50/K.total_value*100, color:'var(--acc)'},
    {key:'A-class ('+K.a_class+')', value:80, color:'var(--info)'},
  ],{format:v=>v.toFixed(1)+'%', vLabel:'Share of book'});
  wireRows(host);
};

/* ==================================================================
   3. PRIORITY CALL QUEUE
   ================================================================== */
V.queue = function(host){
  const cs = O.rfmSel || O.data.customers;
  const custom = !!O.rfmSel;
  if(O.stateFilter && !custom) {}
  /* Priority = upside × reachability × urgency, all from real fields */
  const scored = cs.map(c=>{
    const up=O.num(c.upside), risk=O.num(c.churn_risk), val=O.num(c.total_value);
    const reach = c.has_phone ? 1 : 0.25;
    const act = /CALL NOW/i.test(c.recommended_action||'') ? 1.35
              : /VISIT/i.test(c.recommended_action||'') ? 1.2
              : /DEALER|TENDER/i.test(c.recommended_action||'') ? 1.15
              : /LOW PRIORITY/i.test(c.recommended_action||'') ? .45 : 1;
    const conf = c.confidence==='HIGH'?1.15:c.confidence==='LOW'?.9:1;
    return Object.assign({}, c, {
      priority: Math.round((up*0.55 + val*0.25 + up*risk/100*0.6) * reach * act * conf / 1000)
    });
  }).sort((a,b)=>b.priority-a.priority);

  /* one customer, one row — records sharing a mobile are the same buyer */
  const ranked = O.dedupeByPhone(scored);
  const merged = scored.length - ranked.length;

  host.innerHTML = head('Execution','Priority Call Queue',
    custom ? `Filtered to the ${O.fmt.n(cs.length)} accounts in the RFM cell you selected.`
    : 'Every real account ranked by a composite of 12-month upside, current book value, churn urgency, phone reachability and the recommended action carried in the workbook.',
    custom ? `<button class="btn xs" id="clrSel">&#10005; Clear RFM filter and show all accounts</button>` :
    `<b>How the score works:</b> upside (55%) + book value (25%) + upside×churn-risk (60% weight) — then multiplied by reachability (accounts with no phone are down-weighted to 25%), the recommended action, and research confidence. All inputs are real columns from your file.`) +
  `<div class="panel">
    <div class="panel-head"><div><div class="panel-title">Ranked Queue</div>
      <div class="panel-desc">${O.fmt.n(ranked.length)} real accounts — highest priority first${
        merged?` &middot; ${O.fmt.n(merged)} duplicate ${merged===1?'record':'records'} hidden (same mobile number)`:''}</div></div>
      <div class="panel-tools">
        <button class="btn sm" id="qCallNow">&#9889; CALL NOW only</button>
        <button class="btn sm" id="qPhone">&#128222; Reachable only</button>
        <button class="btn sm wa" id="qBulk">&#128172; Bulk WhatsApp top 50</button>
      </div></div>
    <div class="panel-body flush" id="qGrid"></div>
  </div>`;

  if(custom) O.$('#clrSel').addEventListener('click',()=>{ O.rfmSel=null; O.render(); });

  const grid = O.Grid({host:O.$('#qGrid'), rows:ranked,
    cols:['customer_name','state','seg_label','total_orders','upside',
          'days_since','churn_risk','recommended_action','phone','confidence'],
    sort:'priority', dir:'desc', exportName:'oakcraft-priority-queue',
    filters:[{key:'state',label:'State'},{key:'recommended_action',label:'Action'},
             {key:'seg_label',label:'Segment'},{key:'risk_band',label:'Risk'},
             {key:'__phone',label:'Phone'}]});

  O.$('#qCallNow').addEventListener('click',()=>{
    grid.state.filters={}; grid.state.filters['recommended_action']='CALL NOW';
    grid.state.page=1; grid.refresh(); });
  O.$('#qPhone').addEventListener('click',()=>{
    grid.state.filters['__phone']='yes'; grid.state.page=1; grid.refresh(); });
  O.$('#qBulk').addEventListener('click',()=>O.bulkWA(grid.visible().slice(0,50),'Top 50 Priority Queue'));
};

/* ==================================================================
   3b. FOLLOW-UP BOARD — today's promises, front and centre
   ================================================================== */
const FU_TABS = [
  {k:'today',      label:'Today',      tone:'warn', desc:"Promised for today — work these first."},
  {k:'overdue',    label:'Overdue',    tone:'bad',  desc:'Past the date you promised. Every day here costs trust.'},
  {k:'tomorrow',   label:'Tomorrow',   tone:'info', desc:'Lined up for tomorrow.'},
  {k:'week',       label:'Next 7 Days',tone:'mut',  desc:'Due within the week.'},
  {k:'later',      label:'Later',      tone:'mut',  desc:'Dated further out.'},
  {k:'done',       label:'Completed',  tone:'ok',   desc:'Closed follow-ups — kept on record with their outcome.'},
  {k:'superseded', label:'Superseded', tone:'mut',  desc:'A newer promise replaced these. Nothing is deleted, so they stay visible here.'},
  {k:'all',        label:'Everything', tone:'mut',  desc:'Every follow-up ever set, in any state.'}
];

V.followups = function(host){
  const T = O.Tracker, F = T.followups();
  const tab = O.fuTab && FU_TABS.some(t=>t.k===O.fuTab) ? O.fuTab : 'today';
  const meta = FU_TABS.find(t=>t.k===tab);
  const rows = tab==='all' ? F.all : F[tab];
  const count = k => (k==='all' ? F.all : F[k]).length;

  const pipeline = rows.reduce((s,f)=>s+O.num(f.value),0);

  host.innerHTML = head('Execution','Follow-Ups',
    `Every promise your team made, derived straight from the activity log. Today's follow-ups open here automatically — ${
      F.today.length? `${O.fmt.n(F.today.length)} due today` : 'nothing is due today'}${
      F.overdue.length? `, ${O.fmt.n(F.overdue.length)} still overdue` : ''}.`,
    F.overdue.length
      ? `<b style="color:var(--bad)">&#9888; ${O.fmt.n(F.overdue.length)} follow-up${F.overdue.length===1?' is':'s are'} past the promised date.</b>
         Closing one never deletes it — the outcome is appended and the whole chain stays on record.`
      : `<b>Closing a follow-up never deletes it.</b> The outcome is appended to the log and the original promise stays on record, so the full history is always auditable.`) +
  `<div class="chips" id="fuTabs" style="margin-bottom:14px">
    ${FU_TABS.map(t=>`<span class="chip${t.k===tab?' on':''}" data-t="${t.k}">${t.label}
      <b style="margin-left:6px;opacity:.8">${O.fmt.n(count(t.k))}</b></span>`).join('')}
  </div>
  <div class="panel">
    <div class="panel-head">
      <div><div class="panel-title">${meta.label}${rows.length?` — ${O.fmt.n(rows.length)}`:''}</div>
        <div class="panel-desc">${O.esc(meta.desc)}${
          pipeline?` &middot; ${O.fmt.short(pipeline)} of expected value riding on them`:''}</div></div>
      <div class="panel-tools">
        ${rows.length && tab!=='done' ? `<button class="btn sm wa" id="fuBulk">&#128172; WhatsApp this list</button>`:''}
        <button class="btn sm" id="fuToday">&#9200; Jump to today</button>
      </div></div>
    <div class="panel-body flush" id="fuGrid"></div>
  </div>`;

  O.$$('#fuTabs .chip',host).forEach(ch=>ch.addEventListener('click',()=>{
    O.fuTab = ch.dataset.t; O.render(); }));
  O.$('#fuToday').addEventListener('click',()=>{ O.fuTab='today'; O.render(); });

  if(!rows.length){
    O.$('#fuGrid').innerHTML = `<div class="empty" style="padding:40px"><div class="empty-ico">&#9200;</div>
      <b>Nothing in ${O.esc(meta.label.toLowerCase())}</b>
      Set a follow-up date when you log a call and it lands here automatically.</div>`;
    return;
  }

  const closedTab = tab==='done';
  const cols = closedTab
    ? ['customer_name','due','promised_day','outcome','value','agent','outcome_note','rescheduled_to']
    : ['customer_name','due','due_label','disposition','value','agent','note','phone','state'];

  const grid = O.Grid({host:O.$('#fuGrid'), rows, cols,
    sort: closedTab ? 'closed_at' : 'due', dir: closedTab ? 'desc' : 'asc',
    exportName:'oakcraft-followups-'+tab,
    filters:[{key:'agent',label:'Agent'},{key:'disposition',label:'Last Outcome'},
             {key:'state',label:'State'},{key:'__phone',label:'Phone'}],
    extraActions: closedTab ? [] : [
      {act:'fu-done', cls:'log', icon:'&#10004;', title:'Close this follow-up — records the outcome'},
      {act:'fu-snooze', cls:'', icon:'&#8635;', title:'Reschedule — keeps the original promise on record'}
    ],
    onAction:(act, rec)=>{
      if(act==='fu-done') closeFollowup(rec);
      if(act==='fu-snooze') snoozeFollowup(rec);
    }});

  const bulk = O.$('#fuBulk');
  if(bulk) bulk.addEventListener('click',()=>O.bulkWA(grid.visible(), meta.label+' follow-ups'));
};

/* --- close a follow-up: appends the outcome, never edits the promise --- */
function closeFollowup(f){
  const today = O.today();
  O.modal('Close follow-up — '+O.esc(f.customer_name),
    `<div class="dr-note" style="margin-bottom:13px">
       Promised <b>${O.fmt.date(f.due)}</b> (${O.esc(f.due_label)}) after
       &ldquo;${O.esc(f.disposition||f.type||'activity')}&rdquo; on ${O.fmt.date(f.promised_day)}.
       ${f.note?`<br><span style="color:var(--tx-2)">${O.esc(f.note)}</span>`:''}
       <br><br><b>Nothing is deleted.</b> This appends the outcome to the log and leaves the
       original promise exactly where it is.</div>
     <div class="fld"><label>What happened?</label>
       <select id="fu-disp">${C().dispositions.map(d=>
         `<option${d==='Connected — Follow-up'?' selected':''}>${O.esc(d)}</option>`).join('')}</select></div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
       <div class="fld"><label>Expected Order Value (₹)</label>
         <input id="fu-val" type="number" min="0" step="1000" value="${f.value||''}" placeholder="0"></div>
       <div class="fld"><label>Next follow-up (leave blank to finish)</label>
         <input id="fu-next" type="date" min="${today}"></div>
     </div>
     <div class="fld"><label>Notes</label>
       <textarea id="fu-note" placeholder="What was said, what you promised next…"></textarea></div>`,
    [{label:'Cancel',cls:'ghost',act:()=>O.closeModal()},
     {label:'Save Outcome',cls:'primary',act:()=>{
        O.Tracker.closeFollowup(f.id,{
          disposition:O.$('#fu-disp').value, value:+O.$('#fu-val').value||0,
          next:O.$('#fu-next').value||'', note:O.$('#fu-note').value.trim(), phone:f.phone});
        O.closeModal();
        O.toast(O.$('#fu-next')&&O.$('#fu-next').value?'Outcome saved — next follow-up set':'Follow-up closed');
        O.render(); }}]);
}

/* --- reschedule: closes this promise and opens the next one --- */
function snoozeFollowup(f){
  const today = O.today();
  const opts = [['Tomorrow',1],['In 3 days',3],['In a week',7],['In 2 weeks',14]];
  O.modal('Reschedule — '+O.esc(f.customer_name),
    `<div class="dr-note" style="margin-bottom:13px">
       Currently due <b>${O.fmt.date(f.due)}</b> (${O.esc(f.due_label)}).
       Rescheduling closes this promise and opens the next one, so the chain — and the
       fact that it slipped — stays on record.</div>
     <div class="chips" id="fu-quick" style="margin-bottom:12px">
       ${opts.map(([l,d])=>`<span class="chip" data-d="${O.dateAdd(today,d)}">${l}</span>`).join('')}</div>
     <div class="fld"><label>New date</label>
       <input id="fu-newdate" type="date" min="${today}" value="${O.dateAdd(today,1)}"></div>
     <div class="fld"><label>Why is it moving?</label>
       <textarea id="fu-why" placeholder="Asked to call next week, travelling, waiting on their approval…"></textarea></div>`,
    [{label:'Cancel',cls:'ghost',act:()=>O.closeModal()},
     {label:'Reschedule',cls:'primary',act:()=>{
        const next=O.$('#fu-newdate').value;
        if(!next){ O.toast('Pick a date first','warn'); return; }
        O.Tracker.closeFollowup(f.id,{disposition:'Busy / Call Later', next,
          note:O.$('#fu-why').value.trim()||'Rescheduled from '+f.due, phone:f.phone});
        O.closeModal(); O.toast('Moved to '+O.fmt.date(next)); O.render(); }}]);
  O.$$('#fu-quick .chip').forEach(ch=>ch.addEventListener('click',()=>{
    O.$('#fu-newdate').value = ch.dataset.d;
    O.$$('#fu-quick .chip').forEach(x=>x.classList.remove('on')); ch.classList.add('on'); }));
}

/* ==================================================================
   4. CALL TRACKER
   ================================================================== */
V.tracker = function(host){
  const T=O.Tracker, s=T.stats();
  /* the full record, newest first — voided entries included, because the log
     is the audit trail and nothing is ever hidden from it */
  const acts = T.all().slice().sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
  const F = T.followups();

  host.innerHTML = head('Field Operations','Call Tracker',
    'Every call, WhatsApp, visit and quotation your team logs — an append-only record. Entries are never deleted or overwritten; a correction is logged as a new entry beside the original.',
    T.online() ? `<b>Google Sheets backend connected.</b> ${s.unsynced?`${s.unsynced} activities still pending — hit Sync in the top bar.`:'All activities synced.'}`
    : `<b>Running in local mode.</b> Activities are saved in this browser only. Use <b>Backup JSON</b> below to keep a copy that survives a cleared browser, or deploy <code>backend/Code.gs</code> as a Web App and paste the <code>/exec</code> URL into <code>js/config.js</code> to write them straight into Google Sheets.`) +
  `${F.dueNow.length?`<div class="callout" style="border-left-color:var(--bad);margin-bottom:16px">
    <b style="color:var(--bad)">&#9200; ${O.fmt.n(F.dueNow.length)} follow-up${F.dueNow.length===1?'':'s'} need attention</b>
    — ${O.fmt.n(F.today.length)} due today${F.overdue.length?`, ${O.fmt.n(F.overdue.length)} overdue`:''}.
    <button class="btn xs" id="tGoFu" style="margin-left:10px">Open the Follow-Up board &#8250;</button></div>`:''}

  <div class="panel"><div class="panel-head">
    <div><div class="panel-title">Activity Log</div>
      <div class="panel-desc">${O.fmt.n(acts.length)} entr${acts.length===1?'y':'ies'} on record${
        s.voided?` &middot; ${O.fmt.n(s.voided)} voided (kept, never deleted)`:''} &middot; append-only</div></div>
    <div class="panel-tools">
      <button class="btn sm" id="tExp">&#8681; Export CSV</button>
      <button class="btn sm" id="tBak">&#128190; Backup JSON</button>
      <button class="btn sm" id="tRes">&#8593; Restore</button>
      <button class="btn sm" id="tSync">&#8635; Push to Sheets</button></div></div>
    <div class="panel-body flush" id="tGrid"></div></div>`;

  const goFu=O.$('#tGoFu'); if(goFu) goFu.addEventListener('click',()=>O.go('followups'));

  if(acts.length){
    O.Grid({host:O.$('#tGrid'),
      rows: acts.map(a=>({seq:a.seq, id:a.id, customer_name:a.customer_name,
        when:new Date(a.ts).toLocaleString('en-IN'),
        type:a.type, disposition:a.disposition, phone:a.phone, phones:a.phone?[a.phone]:[],
        has_phone:!!a.phone, value:a.value, followup:a.followup, agent:a.agent, note:a.note,
        state:a.state, synced:a.synced?'Yes':'Pending',
        record: a.voided ? 'Voided' : a.type==='void' ? 'Void marker'
              : a.closes ? 'Follow-up outcome' : 'Original',
        voided_by:a.voided_by||'', void_reason:a.void_reason||''})),
      cols:['seq','customer_name','when','type','disposition','value','followup','agent','note','record','synced'],
      sort:'seq', dir:'desc', exportName:'oakcraft-activity-log',
      filters:[{key:'record',label:'Record'},{key:'disposition',label:'Disposition'},
               {key:'type',label:'Type'},{key:'agent',label:'Agent'},{key:'synced',label:'Sync'}]});
  } else {
    O.$('#tGrid').innerHTML='<div class="empty"><div class="empty-ico">&#9998;</div>'+
      '<b>No activity logged yet</b>Open any module, pick a customer and press the pencil icon to log a call.</div>';
  }
  O.$('#tExp')?.addEventListener('click',()=>{
    O.csv.download('oakcraft-activity-log.csv', O.csv.build(acts,[
      {key:'seq',label:'#'},{key:'id',label:'Entry ID'},
      {key:'ts',label:'Timestamp'},{key:'customer_name',label:'Customer'},{key:'sr_no',label:'Sr No'},
      {key:'type',label:'Type'},{key:'disposition',label:'Disposition'},{key:'phone',label:'Phone'},
      {key:'value',label:'Expected Value'},{key:'followup',label:'Follow-up'},
      {key:'agent',label:'Agent'},{key:'note',label:'Note'},{key:'state',label:'State'},
      {key:'closes',label:'Closes Follow-up'},{key:'voids',label:'Voids Entry'},
      {key:'voided',label:'Voided'},{key:'void_reason',label:'Void Reason'},
      {key:'voided_by',label:'Voided By'}]));
    O.toast('Activity log exported'); });
  O.$('#tSync')?.addEventListener('click',()=>T.syncAll());
  O.$('#tBak')?.addEventListener('click',()=>T.backup());
  O.$('#tRes')?.addEventListener('click',()=>{
    const inp=O.el('input',{type:'file',accept:'.json,application/json'});
    inp.addEventListener('change',()=>{
      const f=inp.files && inp.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{ T.restore(String(r.result)); O.render(); };
      r.readAsText(f); });
    inp.click(); });
};

/* ==================================================================
   5. WHATSAPP CAMPAIGNS
   ================================================================== */
V.campaign = function(host){
  const cs=O.data.customers;
  const presets=[
    {id:'p1', name:'Small one-time buyers (bulk WhatsApp)', tpl:'catalogue',
     desc:'Your workbook says: below roughly ₹25,000, do not spend field time — run those as a bulk WhatsApp or email campaign.',
     f:c=>O.num(c.total_orders)===1 && O.num(c.total_value)<25000},
    {id:'p2', name:'Lapsed 180+ days with a phone number', tpl:'winback',
     desc:'Win-back sweep for every reachable account that has gone quiet for six months or more.',
     f:c=>O.num(c.days_since)>180 && c.has_phone},
    {id:'p3', name:'Furniture & seating trade — dealer offer', tpl:'dealer',
     desc:'Accounts researched as being in the furniture or seating trade. They buy at retail; move them to dealer terms.',
     f:c=>/Furniture \/ seating trade/i.test(c.trade_evidence||'') && c.has_phone},
    {id:'p4', name:'Architects, interiors & fitout firms', tpl:'intro',
     desc:'Spec-in accounts — they specify furniture into every project they win.',
     f:c=>/Interiors \/ fitout \/ design/i.test(c.trade_evidence||'') && c.has_phone},
    {id:'p5', name:'Near-factory belt — book a visit', tpl:'visit',
     desc:'Customers inside the Bawana / Poothkhurd / Narela / Rithala belt. Cheapest cost-per-meeting in the file.',
     f:c=>(c.sheets||[]).some(s=>/NEAR FACTORY/i.test(s)) && c.has_phone},
    {id:'p6', name:'Institutions, Govt & PSU — GeM pitch', tpl:'tender',
     desc:'Tender-watch list. Oakcraft is a Micro MSE and the OEM, eligible for MSE purchase preference on GeM.',
     f:c=>(c.sheets||[]).some(s=>/INSTITUTIONS/i.test(s)) && c.has_phone},
    {id:'p7', name:'Champions — protect & upsell', tpl:'intro',
     desc:'Active repeat payers. Defensive campaign: first look at new models.',
     f:c=>(c.sheets||[]).some(s=>/ACTIVE REPEAT/i.test(s)) && c.has_phone},
  ].map(p=>{ const rows=O.dedupeByPhone(cs.filter(p.f));
    return Object.assign(p,{rows, count:rows.length,
      value:rows.reduce((s,c)=>s+O.num(c.total_value),0),
      upside:rows.reduce((s,c)=>s+O.num(c.upside),0)}); });

  const reach=cs.filter(c=>c.has_phone);
  host.innerHTML = head('Outreach','WhatsApp Campaigns',
    `Ready-made campaign lists built from the real segmentation in your workbook. ${O.fmt.n(reach.length)} of ${O.fmt.n(cs.length)} accounts carry a working number, so those are the only ones a WhatsApp campaign can reach.`,
    `<b>How sending works:</b> browsers block mass auto-opening of chats, so each campaign runs as a guided sequence — one chat opens at a time with the message pre-filled, and every send is logged to the Call Tracker automatically. You can also export the whole list as a CSV of <code>wa.me</code> links for a BSP or bulk tool.`) +
  `<div class="grid g2" id="campGrid">
    ${presets.map(p=>`<div class="panel"><div class="panel-head">
      <div style="flex:1"><div class="panel-title">${O.esc(p.name)}</div>
        <div class="panel-desc">${O.esc(p.desc)}</div></div></div>
      <div class="panel-body">
        <div class="dr-grid" style="margin-bottom:13px">
          <div class="dr-stat"><b>${O.fmt.n(p.count)}</b><span>Accounts</span></div>
          <div class="dr-stat"><b style="color:var(--acc-2)">${O.fmt.short(p.value)}</b><span>Book Value</span></div>
          <div class="dr-stat"><b style="color:var(--ok)">${O.fmt.short(p.upside)}</b><span>Upside</span></div>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn sm wa" data-camp="${p.id}" ${p.count?'':'disabled'}>&#128172; Launch Campaign</button>
          <button class="btn sm" data-view="${p.id}">View List</button>
        </div></div></div>`).join('')}
  </div>
  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><div><div class="panel-title">Message Templates</div>
      <div class="panel-desc">Placeholders are filled with each customer's real data: {name} {agent} {last_order} {orders} {value} {state} {business}</div></div></div>
    <div class="panel-body">
      ${C().waTemplates.map(t=>`<div style="border:1px solid var(--line);border-radius:10px;padding:11px 13px;margin-bottom:8px">
        <div style="font-weight:650;font-size:12.5px;margin-bottom:5px;color:var(--acc-2)">${O.esc(t.name)}</div>
        <div style="font-size:12.5px;color:var(--tx-2);line-height:1.65">${O.esc(t.body)}</div></div>`).join('')}
      <div style="font-size:11.5px;color:var(--tx-3);margin-top:9px">Edit or add templates in <code>js/config.js</code> → <code>waTemplates</code>.</div>
    </div></div>`;

  O.$$('[data-camp]',host).forEach(b=>b.addEventListener('click',()=>{
    const p=presets.find(x=>x.id===b.dataset.camp);
    O.store.set('lastTpl',p.tpl); O.bulkWA(p.rows, p.name); }));
  O.$$('[data-view]',host).forEach(b=>b.addEventListener('click',()=>{
    const p=presets.find(x=>x.id===b.dataset.view);
    O.modal(p.name+' — '+O.fmt.n(p.count)+' accounts',
      `<div class="tbl-wrap" style="max-height:52vh"><table class="dt"><thead><tr>
        <th>Customer</th><th>Phone</th><th>State</th><th class="num">Days</th></tr></thead><tbody>
        ${p.rows.slice(0,300).map(c=>`<tr><td>${O.esc(c.customer_name)}</td>
          <td style="font-family:var(--fm);font-size:11.5px">${O.esc((c.phones||[]).join(', ')||'—')}</td>
          <td>${O.esc(c.state||'—')}</td>
          <td class="num">${O.fmt.n(c.days_since)}</td></tr>`).join('')}
      </tbody></table></div>${p.rows.length>300?`<div style="font-size:11.5px;color:var(--tx-3);margin-top:8px">Showing first 300 of ${O.fmt.n(p.rows.length)} — export for the full list.</div>`:''}`,
      [{label:'Close',cls:'ghost',act:()=>O.closeModal()},
       {label:'&#8681; Export CSV',cls:'',act:()=>{
         O.csv.download('oakcraft-campaign-'+p.id+'.csv', O.csv.build(p.rows,[
           {key:'customer_name',label:'Customer'},{key:'phone',label:'Phone',get:r=>(r.phones||[]).join(' | ')},
           {key:'state',label:'State'},{key:'total_orders',label:'Orders'},
           {key:'total_value',label:'Total Value'},{key:'upside',label:'Upside'},
           {key:'days_since',label:'Days Since'},{key:'pitch_angle',label:'Pitch Angle'}]));
         O.toast('Campaign list exported'); }},
       {label:'&#128172; Launch',cls:'wa',act:()=>{O.closeModal();O.store.set('lastTpl',p.tpl);O.bulkWA(p.rows,p.name);}}]);
  }));
};

/* ==================================================================
   6. MODULE VIEW — one per Excel sheet
   ================================================================== */
V.module = function(host, id){
  const meta = O.moduleHidden(id) ? null : O.data.meta.modules.find(m=>m.id===id);
  if(!meta){ host.innerHTML='<div class="empty"><b>Module not found</b></div>'; return; }
  host.innerHTML = `<div class="loading" style="height:300px"><div class="spin"></div></div>`;
  O.data.loadModule(id).then(mod=>{ paintModule(host, mod, meta); })
    .catch(e=>host.innerHTML=`<div class="empty"><b>Could not load ${O.esc(meta.sheet_name)}</b>${O.esc(e.message)}</div>`);
};

function paintModule(host, mod, meta){
  const has = k => mod.columns.includes(k);
  const isAccountSheet = has('customer_name') && has('total_value');

  /* ---- one customer, one row --------------------------------------
     Sheet 13 lists duplicate groups on purpose, so it is left alone.
     Everywhere else a mobile number that shows up twice is the same
     customer twice, and only the richer record is listed.            */
  const source = mod.rows;
  const rows = isAccountSheet ? O.dedupeByPhone(source) : source;
  const merged = source.length - rows.length;
  /* keep the sidebar badge honest — it should count what is actually listed */
  if(O.moduleCount[mod.id] !== rows.length){ O.moduleCount[mod.id] = rows.length; O.buildNav && O.buildNav(); }

  host.innerHTML = head('Module '+meta.code, meta.title,
    null, `<b>${O.esc(meta.sheet_name)}</b> — ${O.esc(meta.subtitle)}`) +
    `<div class="panel"><div class="panel-head">
      <div><div class="panel-title">${O.esc(meta.sheet_name)}</div>
        <div class="panel-desc">${O.fmt.n(rows.length)} rows from the workbook${
          merged?` &middot; ${O.fmt.n(merged)} duplicate ${merged===1?'record':'records'} hidden (same mobile number)`:''}</div></div>
      <div class="panel-tools">
        ${isAccountSheet?`<button class="btn sm wa" id="mBulk">&#128172; Bulk WhatsApp</button>`:''}
        <button class="btn sm" id="mCols">&#9776; Columns</button>
      </div></div>
      <div class="panel-body flush" id="mGrid"></div></div>`;

  /* ---- column selection: show the meaningful ones first, all available ---- */
  const PRIMARY = ['sr_no','customer_name','group','sr_nos','records','records_in_group','state','states',
    'seg_label','verified_business_type','total_orders','combined_value',
    'days_since','recommended_action','phone','confidence','upside','quality_flag',
    'gstin','evidence'];
  const visible = mod.columns.filter(c=>PRIMARY.includes(c) ||
    (c==='segment' && !mod.columns.includes('seg_label')));
  const ordered = PRIMARY.filter(c=>visible.includes(c));
  /* Total Value, AOV and Last Order are never offered here — they belong
     to the customer detail panel now. */
  const pickable = mod.columns.filter(c=>c!=='phone_on_file' && !O.HIDDEN_COLS.has(c));

  const filters=[];
  if(mod.columns.includes('state')) filters.push({key:'state',label:'State'});
  if(mod.columns.includes('segment')) filters.push({key:'seg_label',label:'Segment'});
  if(mod.columns.includes('recommended_action')) filters.push({key:'recommended_action',label:'Action'});
  if(mod.columns.includes('confidence')) filters.push({key:'confidence',label:'Confidence'});
  if(mod.columns.includes('trade_evidence')) filters.push({key:'trade_evidence',label:'Trade'});
  if(mod.columns.includes('group')) filters.push({key:'group',label:'Group'});
  if(mod.columns.includes('quality_flag')) filters.push({key:'quality_flag',label:'Flag'});
  if(isAccountSheet) filters.push({key:'__phone',label:'Phone'});

  let cols = ordered.slice();
  const grid = O.Grid({host:O.$('#mGrid'), rows, cols,
    sort: mod.columns.includes('total_value')?'total_value':null, dir:'desc',
    exportName:'oakcraft-'+mod.id, filters});

  O.$('#mCols').addEventListener('click',()=>{
    O.modal('Show / hide columns',
      `<div class="chips" id="colChips">${pickable.map(c=>
        `<span class="chip${cols.includes(c)?' on':''}" data-c="${c}">${O.esc(O.gridLabel(c))}</span>`).join('')}</div>
       <div style="font-size:11.5px;color:var(--tx-3);margin-top:12px">
         ${O.fmt.n(mod.columns.length)} columns exist in this sheet. Long text columns
         (pitch angle, gap reason, what they do) stay out of the table to keep it readable, and
         Total Value, AOV and Last Order now live in the customer detail panel —
         click any customer to see them.</div>`,
      [{label:'Close',cls:'ghost',act:()=>O.closeModal()},
       {label:'Apply',cls:'primary',act:()=>{
         cols = O.$$('#colChips .chip.on').map(e=>e.dataset.c);
         if(!cols.length) cols=['customer_name'];
         grid.state.cols=cols; grid.refresh(); O.closeModal(); }}]);
    O.$$('#colChips .chip').forEach(ch=>ch.addEventListener('click',()=>ch.classList.toggle('on')));
  });
  if(isAccountSheet) O.$('#mBulk').addEventListener('click',()=>O.bulkWA(grid.visible(), mod.sheet_name));
}
})(window.OAK);
