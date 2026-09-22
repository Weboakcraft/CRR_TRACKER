/* ====== OAKCRAFT — APP SHELL, ROUTING, DRAWER, MODAL ====== */
(function(O){
'use strict';
const C=()=>O.CONFIG;
O.route = {page:'dashboard', param:null};

/* ---------------- Modal ---------------- */
let MODAL;
O.modal = function(title, bodyHtml, buttons){
  if(!MODAL){ MODAL=O.el('div',{class:'modal'}); document.body.appendChild(MODAL);
    MODAL.addEventListener('click',e=>{ if(e.target===MODAL) O.closeModal(); }); }
  MODAL.innerHTML = `<div class="modal-card">
    <div class="modal-head"><div class="panel-title">${title}</div>
      <button class="icon-btn" style="margin-left:auto" id="mx">&#10005;</button></div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-foot"></div></div>`;
  const foot=MODAL.querySelector('.modal-foot');
  (buttons||[]).forEach(b=>{
    const el=O.el('button',{class:'btn '+(b.cls||'')}, b.label);
    el.addEventListener('click', b.act); foot.appendChild(el); });
  MODAL.querySelector('#mx').addEventListener('click', O.closeModal);
  requestAnimationFrame(()=>MODAL.classList.add('on'));
};
O.closeModal = ()=> MODAL && MODAL.classList.remove('on');

/* ---------------- Customer 360 drawer ---------------- */
let DRAWER, SCRIM;
function drawerEls(){
  if(!DRAWER){
    SCRIM=O.el('div',{class:'scrim'}); DRAWER=O.el('div',{class:'drawer'});
    document.body.append(SCRIM,DRAWER);
    SCRIM.addEventListener('click', O.closeDrawer);
  }
  return {DRAWER,SCRIM};
}
O.closeDrawer = ()=>{ if(DRAWER){ DRAWER.classList.remove('on'); SCRIM.classList.remove('on'); } };

O.openCustomer = function(rec){
  const c = O.findCustomer(rec) || rec;
  const {DRAWER:d,SCRIM:s} = drawerEls();
  const acts = O.Tracker.forCustomer(c.customer_name);
  const kv = (k,v) => v==null||v===''? '' : `<dt>${O.esc(k)}</dt><dd>${v}</dd>`;
  const money = v => v==null?'—':O.fmt.rs(v);

  d.innerHTML = `
  <div class="dr-head">
    <div style="flex:1;min-width:0">
      <div class="dr-title">${O.esc(c.customer_name||'—')}</div>
      <div class="dr-sub">${O.esc(c.verified_business_type||'')}${c.state?' &middot; '+O.esc(c.state):''}
        ${c.sr_no!=null?' &middot; Sr# '+c.sr_no:''}</div>
      <div class="chips" style="margin-top:9px">
        ${(c.tags||[]).map(t=>`<span class="tag acc">${O.esc(t)}</span>`).join('')}
        ${c.risk_band?`<span class="tag ${O.riskTag(c.risk_band)}">${c.risk_band} risk</span>`:''}
        ${c.abc?`<span class="tag ${c.abc==='A'?'ok':c.abc==='B'?'info':'mut'}">Class ${c.abc}</span>`:''}
        ${c.rfm?`<span class="tag mut">RFM ${c.rfm}</span>`:''}
      </div>
    </div>
    <button class="icon-btn" id="dx">&#10005;</button>
  </div>
  <div class="dr-body">
    <div class="dr-sec"><div class="dr-grid">
      <div class="dr-stat"><b>${money(c.total_value)}</b><span>Total Value</span></div>
      <div class="dr-stat"><b>${O.fmt.n(c.total_orders)}</b><span>Orders</span></div>
      <div class="dr-stat"><b>${money(c.aov)}</b><span>Avg Order</span></div>
      <div class="dr-stat"><b style="color:var(--ok)">${money(c.upside)}</b><span>12M Upside</span></div>
      <div class="dr-stat"><b style="color:${O.riskColor(c.risk_band)}">${O.fmt.n(c.days_since)}d</b><span>Since Last Order</span></div>
      <div class="dr-stat"><b style="color:var(--bad)">${money(c.value_at_risk)}</b><span>Value At Risk</span></div>
    </div></div>

    ${c.recommended_action?`<div class="dr-sec"><div class="dr-sec-t">Recommended Action</div>
      <span class="tag ${O.actionTag(c.recommended_action)}" style="font-size:13px;padding:6px 13px">
      ${O.esc(c.recommended_action)}</span></div>`:''}

    ${c.pitch_angle?`<div class="dr-sec"><div class="dr-sec-t">Pitch Angle — what to say</div>
      <div class="dr-note">${O.esc(c.pitch_angle)}</div></div>`:''}

    ${c.gap_reason?`<div class="dr-sec"><div class="dr-sec-t">Likely Reason For Gap / Churn</div>
      <div class="dr-note" style="border-left-color:var(--bad)">${O.esc(c.gap_reason)}</div></div>`:''}

    ${c.what_they_do?`<div class="dr-sec"><div class="dr-sec-t">What They Do</div>
      <div class="dr-note" style="border-left-color:var(--info)">${O.esc(c.what_they_do)}</div></div>`:''}

    <div class="dr-sec"><div class="dr-sec-t">Account Record</div>
      <dl class="dr-kv">
        ${kv('Segment', c.segment?O.esc(c.segment):'')}
        ${kv('Business Type', O.esc(c.verified_business_type||''))}
        ${kv('Trade Evidence', O.esc(c.trade_evidence||''))}
        ${kv('State', O.esc(c.state||''))}
        ${kv('Last Order', c.last_order?O.fmt.date(c.last_order):'')}
        ${kv('Phone(s)', (c.phones||[]).length
            ? c.phones.map(p=>`<a href="tel:+${O.wa.normalize(p)}" style="color:var(--info);font-family:var(--fm)">${O.esc(p)}</a>`).join(' &nbsp;')
            : '<span class="tag bad">No phone on file — trace via GST portal / IndiaMART / invoice</span>')}
        ${kv('GSTIN / UIN', c.gstin?`<span style="font-family:var(--fm)">${O.esc(c.gstin)}</span>`:'')}
        ${kv('Address', O.esc(c.address||''))}
        ${kv('Confidence', c.confidence?`<span class="tag ${O.confTag(c.confidence)}">${O.esc(c.confidence)}</span>`:'')}
        ${kv('Source', c.source_url && /^https?:/.test(c.source_url)
            ? `<a href="${O.esc(c.source_url)}" target="_blank" rel="noopener" style="color:var(--info)">${O.esc(c.source_url)}</a>`
            : O.esc(c.source_url||''))}
        ${kv('Appears In', (c.sheets||[]).map(s=>`<span class="tag mut" style="margin:2px 3px 2px 0">${O.esc(s)}</span>`).join(''))}
        ${kv('Churn Risk', c.churn_risk!=null?`${c.churn_risk}% <span class="tag ${O.riskTag(c.risk_band)}">${c.risk_band}</span>`:'')}
        ${kv('Revenue Rank', c.cum_share!=null?`Top ${c.cum_share.toFixed(2)}% cumulative &middot; Class ${c.abc}`:'')}
      </dl></div>

    <div class="dr-sec"><div class="dr-sec-t">Activity History (${acts.length})</div>
      ${acts.length? acts.map(a=>`
        <div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:7px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="tag ${C().positiveDispositions.includes(a.disposition)?'ok':/No Answer|Wrong|Switched|Not Interested/.test(a.disposition)?'bad':'mut'}">${O.esc(a.disposition||a.type)}</span>
            ${a.value?`<span class="tag info">${O.fmt.short(a.value)} expected</span>`:''}
            ${a.followup?`<span class="tag warn">Follow-up ${O.fmt.dateShort(a.followup)}</span>`:''}
            ${!a.synced?'<span class="tag mut">unsynced</span>':''}
            <span style="margin-left:auto;font-size:11px;color:var(--tx-3)">${new Date(a.ts).toLocaleString('en-IN')}</span>
          </div>
          ${a.note?`<div style="margin-top:6px;font-size:12.5px;color:var(--tx-2);white-space:pre-wrap">${O.esc(a.note)}</div>`:''}
          <div style="margin-top:6px;font-size:11px;color:var(--tx-3)">by ${O.esc(a.agent||'—')}${a.phone?' · '+O.esc(a.phone):''}</div>
        </div>`).join('')
        : '<div class="empty" style="padding:26px"><b>No activity logged yet</b>Use “Log Call” below</div>'}
    </div>
  </div>
  <div class="dr-foot">
    ${(c.phones||[]).length?`<button class="btn wa" id="d-wa">&#128172; WhatsApp</button>
      <button class="btn" id="d-tel">&#128222; Call ${O.esc(c.phones[0])}</button>`:''}
    <button class="btn primary" id="d-log">&#9998; Log Activity</button>
    <button class="btn ghost" id="d-copy" style="margin-left:auto">&#128203; Copy Record</button>
  </div>`;

  O.$('#dx',d).addEventListener('click',O.closeDrawer);
  O.$('#d-log',d).addEventListener('click',()=>O.Tracker.openLog(c));
  const wa=O.$('#d-wa',d); if(wa) wa.addEventListener('click',()=>O.quickWA(c));
  const tel=O.$('#d-tel',d); if(tel) tel.addEventListener('click',()=>location.href='tel:+'+O.wa.normalize(c.phones[0]));
  O.$('#d-copy',d).addEventListener('click',()=>{
    const txt=[c.customer_name,c.verified_business_type,c.state,
      'Phone: '+((c.phones||[]).join(', ')||'none on file'),
      'GSTIN: '+(c.gstin||'—'),
      'Orders: '+O.num(c.total_orders)+' | Value: '+O.fmt.rs(c.total_value)+' | AOV: '+O.fmt.rs(c.aov),
      'Last order: '+(c.last_order||'—')+' ('+O.num(c.days_since)+' days ago)',
      'Action: '+(c.recommended_action||'—'),'Pitch: '+(c.pitch_angle||'—')].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(txt).then(()=>O.toast('Record copied to clipboard'));});

  s.classList.add('on'); d.classList.add('on');
};

/* ---------------- Sync indicator ---------------- */
O.setSync = (state, label)=>{
  const dot=O.$('#syncDot'), txt=O.$('#syncTxt');
  if(dot){ dot.className='sync-dot '+(state||''); }
  if(txt) txt.textContent = label || '';
};

/* ---------------- Navigation ---------------- */
function navGroups(){
  const m = O.data.meta;
  return [
    {title:'Command', items:[
      {id:'dashboard', ico:'&#9632;', label:'Executive Dashboard'},
      {id:'analytics', ico:'&#9650;', label:'Advanced Analytics'},
      {id:'queue',     ico:'&#9889;', label:'Priority Call Queue', badge: O.priorityCount()},
      {id:'tracker',   ico:'&#9998;', label:'Call Tracker', badge: O.Tracker.all().length||null},
      {id:'campaign',  ico:'&#128172;', label:'WhatsApp Campaigns'}
    ]},
    {title:'Modules — one per Excel sheet', items: m.modules.map(mod=>({
      id:'m:'+mod.id, ico:mod.code, label: modShort(mod.title), badge: mod.row_count,
      full: mod.code+' '+mod.title }))}
  ];
}
function modShort(t){
  return t.replace('DUPLICATES & SHARED PHONES','Duplicates & Shared')
          .replace('INSTITUTIONS, GOVT & PSU','Institutions & Govt')
          .replace('DEALER & CHANNEL TARGETS','Dealer & Channel')
          .replace('ACTIVE REPEAT - PROTECT','Champions — Protect')
          .replace('NEAR FACTORY - VISIT','Near Factory Visits')
          .replace('CALL LIST - TOP 100','Top 100 Call List')
          .replace(/\b(\w)(\w*)/g,(m,a,b)=>a+b.toLowerCase())
          .replace('Psu','PSU').replace('Govt','Govt');
}
O.priorityCount = function(){
  const cs=O.data.customers||[];
  return cs.filter(c=>/CALL NOW/i.test(c.recommended_action||'')).length;
};

function buildNav(){
  const nav=O.$('#nav'); nav.innerHTML='';
  navGroups().forEach(g=>{
    nav.appendChild(O.el('div',{class:'nav-group-title'}, g.title));
    g.items.forEach(it=>{
      const a=O.el('div',{class:'nav-item'+(O.routeKey()===it.id?' active':''),
        'data-id':it.id, title: it.full||it.label});
      a.innerHTML=`<span class="nav-ico">${it.ico}</span><span class="nav-label">${O.esc(it.label)}</span>`+
        (it.badge?`<span class="nav-badge">${O.fmt.n(it.badge)}</span>`:'');
      a.addEventListener('click',()=>{ O.go(it.id); O.$('#sidebar').classList.remove('open'); });
      nav.appendChild(a);
    });
  });
}
O.routeKey = ()=> O.route.page==='module' ? 'm:'+O.route.param : O.route.page;

O.go = function(key){
  if(key.startsWith('m:')){ O.route={page:'module', param:key.slice(2)}; }
  else O.route={page:key, param:null};
  location.hash = '#'+key;
  buildNav(); O.render();
  O.$('.content').scrollTop=0;
};

O.render = function(){
  const host=O.$('#view');
  const V=O.Views;
  buildNav();
  O.hideTip && O.hideTip();
  switch(O.route.page){
    case 'analytics': V.analytics(host); break;
    case 'queue':     V.queue(host); break;
    case 'tracker':   V.tracker(host); break;
    case 'campaign':  V.campaign(host); break;
    case 'module':    V.module(host, O.route.param); break;
    default:          V.dashboard(host);
  }
};

/* ---------------- Global search (Ctrl+K) ---------------- */
O.globalSearch = function(q){
  q=(q||'').trim().toLowerCase();
  const box=O.$('#gsRes');
  if(!q){ box.style.display='none'; return; }
  const cs=O.data.customers||[];
  const hits=cs.filter(c=>
     String(c.customer_name||'').toLowerCase().includes(q) ||
     String(c.state||'').toLowerCase().includes(q) ||
     String(c.gstin||'').toLowerCase().includes(q) ||
     (c.phones||[]).some(p=>p.includes(q)) ||
     String(c.verified_business_type||'').toLowerCase().includes(q)).slice(0,14);
  box.innerHTML = hits.length ? hits.map((c,i)=>`
    <div class="gs-row" data-n="${O.esc(c.customer_name)}" style="display:flex;gap:10px;align-items:center;
      padding:9px 13px;cursor:pointer;border-bottom:1px solid var(--line)">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${O.esc(c.customer_name)}</div>
        <div style="font-size:11px;color:var(--tx-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${O.esc(c.verified_business_type||'')}${c.state?' · '+O.esc(c.state):''}</div></div>
      <div style="text-align:right;flex:0 0 auto">
        <div style="font-family:var(--fm);font-size:12px;font-weight:650">${O.fmt.short(c.total_value)}</div>
        <div style="font-size:10.5px;color:var(--tx-3)">${O.fmt.n(c.total_orders)} orders</div></div>
      ${c.has_phone?'<span class="tag ok">&#128222;</span>':'<span class="tag bad">no ph</span>'}
    </div>`).join('') : '<div class="empty" style="padding:24px"><b>No match</b></div>';
  box.style.display='block';
  box.querySelectorAll('.gs-row').forEach(r=>r.addEventListener('click',()=>{
    const c=cs.find(x=>x.customer_name===r.dataset.n);
    box.style.display='none'; O.$('#gs').value=''; O.openCustomer(c); }));
};

/* ---------------- Boot ---------------- */
function shell(){
  document.body.innerHTML = `
  <div class="app" id="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-logo">O</div>
        <div class="brand-txt"><b>Oakcraft CRR</b><span>Customer Revival Tracker</span></div>
      </div>
      <div class="nav" id="nav"></div>
      <div class="side-foot">
        <div><span class="sync-dot" id="syncDot"></span><span id="syncTxt">Local storage</span></div>
        <div style="margin-top:4px;opacity:.75">${O.data.meta.unique_customers} accounts &middot; ${O.data.meta.sheet_count} modules</div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <button class="icon-btn" id="burger" title="Toggle sidebar">&#9776;</button>
        <div class="search-wrap">
          <span class="s-ico">&#128269;</span>
          <input id="gs" type="search" placeholder="Search customers, phones, GSTIN, states…" autocomplete="off">
          <kbd>Ctrl K</kbd>
          <div id="gsRes" style="display:none;position:absolute;top:42px;left:0;right:0;z-index:600;
            background:var(--panel-solid);border:1px solid var(--line-2);border-radius:12px;
            box-shadow:var(--sh-lg);max-height:420px;overflow:auto"></div>
        </div>
        <div class="top-actions">
          <button class="btn sm" id="btnSync" title="Push local activity to Google Sheets">&#8635; Sync</button>
          <button class="icon-btn" id="btnTheme" title="Toggle theme">&#9728;</button>
          <button class="icon-btn" id="btnPrint" title="Print / PDF">&#128424;</button>
        </div>
      </div>
      <div class="content"><div id="view"></div></div>
    </div>
  </div>
  <button class="wa-float" id="waFloat" title="WhatsApp campaign builder">&#128172;</button>`;

  O.$('#burger').addEventListener('click',()=>{
    if(innerWidth<=900) O.$('#sidebar').classList.toggle('open');
    else O.$('#app').classList.toggle('collapsed'); });
  O.$('#btnTheme').addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';
    document.documentElement.setAttribute('data-theme',cur); O.store.set('theme',cur);
    O.$('#btnTheme').innerHTML = cur==='light'?'&#127769;':'&#9728;'; O.render(); });
  O.$('#btnPrint').addEventListener('click',()=>window.print());
  O.$('#btnSync').addEventListener('click',()=>O.Tracker.syncAll());
  O.$('#waFloat').addEventListener('click',()=>O.go('campaign'));
  const gs=O.$('#gs');
  gs.addEventListener('input',O.debounce(e=>O.globalSearch(e.target.value),160));
  gs.addEventListener('blur',()=>setTimeout(()=>O.$('#gsRes').style.display='none',180));
  gs.addEventListener('focus',()=>{ if(gs.value) O.globalSearch(gs.value); });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); gs.focus(); gs.select(); }
    if(e.key==='Escape'){ O.closeDrawer(); O.closeModal(); O.$('#gsRes').style.display='none'; }
  });
  const th=O.store.get('theme','dark');
  document.documentElement.setAttribute('data-theme',th);
  O.$('#btnTheme').innerHTML = th==='light'?'&#127769;':'&#9728;';
  window.addEventListener('resize', O.debounce(()=>O.render(),320));
  window.addEventListener('hashchange',()=>{
    const k=location.hash.slice(1); if(k && k!==O.routeKey()) O.go(k); });
}

O.boot = function(){
  document.body.innerHTML = `<div class="loading"><div class="spin"></div>
    <div style="color:var(--tx-3);font-size:13px">Loading real production data…</div></div>`;
  O.loadAll(['meta','analytics','customers'])
   .then(()=>{
      shell();
      const k=location.hash.slice(1);
      if(k) { if(k.startsWith('m:')) O.route={page:'module',param:k.slice(2)};
              else O.route={page:k,param:null}; }
      O.setSync(O.Tracker.online()?'on':'off',
        O.Tracker.online()?'Google Sheets connected':'Local storage only');
      if(O.Tracker.online()) O.Tracker.pull();
      O.render();
   })
   .catch(err=>{
      document.body.innerHTML = `<div class="loading"><div style="max-width:560px;text-align:center">
        <div style="font-size:40px;margin-bottom:14px">&#9888;</div>
        <h2 style="margin-bottom:10px">Data files could not be loaded</h2>
        <p style="color:var(--tx-2);font-size:13.5px;line-height:1.7">${O.esc(err.message)}<br><br>
        Make sure the <code>data/</code> folder sits next to <code>index.html</code>.
        On GitHub Pages this works automatically once the whole repository is published.</p></div></div>`;
   });
};
})(window.OAK);
