/* ====== OAKCRAFT — ZERO-DEPENDENCY SVG CHART ENGINE ====== */
(function(O){
'use strict';
const NS='http://www.w3.org/2000/svg';
const mk=(t,a)=>{const e=document.createElementNS(NS,t);
  if(a)for(const k in a) if(a[k]!=null) e.setAttribute(k,a[k]); return e;};

/* ---- shared tooltip ---- */
let TIP;
function tip(){ if(!TIP){ TIP=O.el('div',{class:'tip'}); document.body.appendChild(TIP);} return TIP; }
function showTip(e, html){ const t=tip(); t.innerHTML=html; t.classList.add('on');
  const r=t.getBoundingClientRect();
  let x=e.clientX+14, y=e.clientY-10;
  if(x+r.width>innerWidth-10) x=e.clientX-r.width-14;
  if(y+r.height>innerHeight-10) y=innerHeight-r.height-10;
  t.style.left=x+'px'; t.style.top=Math.max(8,y)+'px'; }
function hideTip(){ if(TIP) TIP.classList.remove('on'); }
function bind(node, html){
  node.addEventListener('mousemove', e=>showTip(e,html));
  node.addEventListener('mouseleave', hideTip);
}
O.hideTip = hideTip;

const Charts = {};

/* ---------- HORIZONTAL BAR LIST (DOM, crisp + accessible) ---------- */
Charts.hbars = function(host, data, opt){
  opt = opt||{}; host.innerHTML='';
  const max = Math.max(1, ...data.map(d=>Math.abs(d.value)));
  const fmt = opt.format || O.fmt.short;
  data.slice(0, opt.limit||12).forEach((d,i)=>{
    const row = O.el('div',{class:'hbar-row'});
    row.appendChild(O.el('div',{class:'hbar-lb', title:d.key}, O.esc(d.key)));
    const tr = O.el('div',{class:'hbar-tr'});
    const fl = O.el('div',{class:'hbar-fl'});
    fl.style.background = d.color || opt.color || O.color(i);
    fl.style.width='0%';
    tr.appendChild(fl); row.appendChild(tr);
    row.appendChild(O.el('div',{class:'hbar-vl'}, fmt(d.value)));
    bind(row, `<b>${O.esc(d.key)}</b><span>${opt.vLabel||'Value'}: ${fmt(d.value)}`+
      (d.count!=null?` &middot; ${O.fmt.n(d.count)} accounts`:'')+`</span>`);
    if(opt.onClick) { row.style.cursor='pointer'; row.addEventListener('click',()=>opt.onClick(d)); }
    host.appendChild(row);
    requestAnimationFrame(()=>{ fl.style.width = (Math.abs(d.value)/max*100).toFixed(2)+'%'; });
  });
  if(!data.length) host.innerHTML='<div class="empty"><b>No data</b></div>';
};

/* ---------- VERTICAL BAR / COLUMN ---------- */
Charts.bars = function(host, data, opt){
  opt=opt||{}; host.innerHTML='';
  const W=host.clientWidth||620, H=opt.height||230, P={t:16,r:10,b:34,l:opt.left!=null?opt.left:48};
  const iw=Math.max(10,W-P.l-P.r), ih=H-P.t-P.b;
  const max=Math.max(1,...data.map(d=>d.value));
  const fmt=opt.format||O.fmt.shortN;
  const svg=mk('svg',{class:'chart',viewBox:`0 0 ${W} ${H}`,height:H});
  for(let g=0;g<=4;g++){ const y=P.t+ih-ih*g/4;
    svg.appendChild(mk('line',{class:'ct-grid',x1:P.l,x2:W-P.r,y1:y,y2:y,opacity:g?.5:1}));
    const tx=mk('text',{class:'ct-axis',x:P.l-7,y:y+3.5,'text-anchor':'end'});
    tx.textContent=fmt(max*g/4); svg.appendChild(tx); }
  const bw=iw/data.length, pad=Math.min(9,bw*.22);
  data.forEach((d,i)=>{
    const h=Math.max(1,d.value/max*ih), x=P.l+i*bw+pad/2, y=P.t+ih-h;
    const r=mk('rect',{class:'ct-bar',x:x,y:y,width:Math.max(1,bw-pad),height:h,rx:3,
      fill:d.color||opt.color||'var(--acc)'});
    bind(r, `<b>${O.esc(d.label||d.key)}</b><span>${opt.vLabel||''} ${(opt.format||O.fmt.short)(d.value)}`+
      (d.count!=null?`<br>${O.fmt.n(d.count)} accounts`:'')+`</span>`);
    if(opt.onClick){ r.style.cursor='pointer'; r.addEventListener('click',()=>opt.onClick(d)); }
    svg.appendChild(r);
    if(data.length<=26 && (data.length<=14 || i%2===0)){
      const t=mk('text',{class:'ct-axis',x:x+(bw-pad)/2,y:H-13,'text-anchor':'middle'});
      t.textContent=d.label||d.key; svg.appendChild(t); }
  });
  host.appendChild(svg);
};

/* ---------- AREA / LINE (time series) ---------- */
Charts.area = function(host, data, opt){
  opt=opt||{}; host.innerHTML='';
  const W=host.clientWidth||640,H=opt.height||240,P={t:16,r:14,b:32,l:opt.left!=null?opt.left:52};
  const iw=Math.max(10,W-P.l-P.r), ih=H-P.t-P.b;
  const max=Math.max(1,...data.map(d=>d.value));
  const fmt=opt.format||O.fmt.shortN;
  const svg=mk('svg',{class:'chart',viewBox:`0 0 ${W} ${H}`,height:H});
  const gid='ag'+Math.random().toString(36).slice(2,8);
  const defs=mk('defs'), lg=mk('linearGradient',{id:gid,x1:0,y1:0,x2:0,y2:1});
  lg.appendChild(mk('stop',{offset:'0%','stop-color':opt.color||'var(--acc)','stop-opacity':.45}));
  lg.appendChild(mk('stop',{offset:'100%','stop-color':opt.color||'var(--acc)','stop-opacity':0}));
  defs.appendChild(lg); svg.appendChild(defs);
  for(let g=0;g<=4;g++){ const y=P.t+ih-ih*g/4;
    svg.appendChild(mk('line',{class:'ct-grid',x1:P.l,x2:W-P.r,y1:y,y2:y,opacity:g?.5:1}));
    const t=mk('text',{class:'ct-axis',x:P.l-7,y:y+3.5,'text-anchor':'end'});
    t.textContent=fmt(max*g/4); svg.appendChild(t); }
  const X=i=>P.l+(data.length<2?iw/2:i*iw/(data.length-1));
  const Y=v=>P.t+ih-(v/max*ih);
  let ln='', ar='';
  data.forEach((d,i)=>{ const x=X(i),y=Y(d.value);
    ln += (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1);
    ar += (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1); });
  ar += `L${X(data.length-1).toFixed(1)},${P.t+ih}L${X(0).toFixed(1)},${P.t+ih}Z`;
  svg.appendChild(mk('path',{d:ar,fill:`url(#${gid})`}));
  svg.appendChild(mk('path',{d:ln,fill:'none',stroke:opt.color||'var(--acc)','stroke-width':2.2,
    'stroke-linejoin':'round','stroke-linecap':'round'}));
  data.forEach((d,i)=>{ const x=X(i),y=Y(d.value);
    const c=mk('circle',{cx:x,cy:y,r:3.2,fill:'var(--bg)',stroke:opt.color||'var(--acc)','stroke-width':2});
    bind(c,`<b>${O.esc(d.label||d.key)}</b><span>${(opt.format||O.fmt.short)(d.value)}`+
      (d.count!=null?`<br>${O.fmt.n(d.count)} accounts`:'')+`</span>`);
    const hit=mk('circle',{cx:x,cy:y,r:11,fill:'transparent'});
    bind(hit,`<b>${O.esc(d.label||d.key)}</b><span>${(opt.format||O.fmt.short)(d.value)}`+
      (d.count!=null?`<br>${O.fmt.n(d.count)} accounts`:'')+`</span>`);
    svg.appendChild(c); svg.appendChild(hit);
    const step=Math.ceil(data.length/9);
    const isLast=i===data.length-1;
    if((i%step===0 && !(isLast===false && i>data.length-1-step)) || isLast){
      const t=mk('text',{class:'ct-axis',x:x,y:H-11,'text-anchor':
        isLast?'end':(i===0?'start':'middle')});
      t.textContent=d.label||d.key; svg.appendChild(t); }
  });
  host.appendChild(svg);
};

/* ---------- DONUT ---------- */
Charts.donut = function(host, data, opt){
  opt=opt||{}; host.innerHTML='';
  const S=opt.size||190, R=S/2-4, r=R*(opt.inner||.62), cx=S/2, cy=S/2;
  const tot=data.reduce((s,d)=>s+Math.abs(d.value),0)||1;
  const fmt=opt.format||O.fmt.short;
  const wrap=O.el('div',{style:'display:flex;gap:18px;align-items:center;flex-wrap:wrap;justify-content:center'});
  const svg=mk('svg',{class:'chart',viewBox:`0 0 ${S} ${S}`,width:S,height:S,style:'flex:0 0 auto'});
  let a0=-Math.PI/2;
  data.forEach((d,i)=>{
    const frac=Math.abs(d.value)/tot, a1=a0+frac*Math.PI*2;
    const big=frac>.5?1:0;
    const p=[`M${cx+R*Math.cos(a0)},${cy+R*Math.sin(a0)}`,
      `A${R},${R} 0 ${big} 1 ${cx+R*Math.cos(a1)},${cy+R*Math.sin(a1)}`,
      `L${cx+r*Math.cos(a1)},${cy+r*Math.sin(a1)}`,
      `A${r},${r} 0 ${big} 0 ${cx+r*Math.cos(a0)},${cy+r*Math.sin(a0)}`,'Z'].join(' ');
    const path=mk('path',{d:p,fill:d.color||O.color(i),class:'ct-bar'});
    bind(path,`<b>${O.esc(d.key)}</b><span>${fmt(d.value)} &middot; ${(frac*100).toFixed(1)}%`+
      (d.count!=null?`<br>${O.fmt.n(d.count)} accounts`:'')+`</span>`);
    if(opt.onClick){ path.style.cursor='pointer'; path.addEventListener('click',()=>opt.onClick(d)); }
    svg.appendChild(path); a0=a1;
  });
  if(opt.centerValue!=null){
    const t1=mk('text',{x:cx,y:cy-2,'text-anchor':'middle',style:
      'font-size:19px;font-weight:750;fill:var(--tx)'});
    t1.textContent=opt.centerValue; svg.appendChild(t1);
    const t2=mk('text',{x:cx,y:cy+15,'text-anchor':'middle',style:
      'font-size:10px;font-weight:700;letter-spacing:.8px;fill:var(--tx-3)'});
    t2.textContent=opt.centerLabel||''; svg.appendChild(t2);
  }
  wrap.appendChild(svg);
  const lg=O.el('div',{style:'flex:1;min-width:130px'});
  data.forEach((d,i)=>{
    const row=O.el('div',{style:'display:flex;align-items:center;gap:7px;font-size:11.5px;padding:3px 0;cursor:'+(opt.onClick?'pointer':'default')});
    row.innerHTML=`<i style="width:9px;height:9px;border-radius:3px;flex:0 0 9px;background:${d.color||O.color(i)}"></i>`+
      `<span style="flex:1;color:var(--tx-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${O.esc(d.key)}">${O.esc(d.key)}</span>`+
      `<b style="font-family:var(--fm);font-size:11px;color:var(--tx)">${fmt(d.value)}</b>`;
    if(opt.onClick) row.addEventListener('click',()=>opt.onClick(d));
    lg.appendChild(row);
  });
  wrap.appendChild(lg); host.appendChild(wrap);
};

/* ---------- PARETO (bars + cumulative %) ---------- */
Charts.pareto = function(host, data, opt){
  opt=opt||{}; host.innerHTML='';
  const W=host.clientWidth||660,H=opt.height||270,P={t:18,r:44,b:40,l:56};
  const iw=Math.max(10,W-P.l-P.r), ih=H-P.t-P.b;
  const max=Math.max(1,...data.map(d=>d.value));
  const tot=data.reduce((s,d)=>s+d.value,0)||1;
  const svg=mk('svg',{class:'chart',viewBox:`0 0 ${W} ${H}`,height:H});
  for(let g=0;g<=4;g++){ const y=P.t+ih-ih*g/4;
    svg.appendChild(mk('line',{class:'ct-grid',x1:P.l,x2:W-P.r,y1:y,y2:y,opacity:g?.5:1}));
    let t=mk('text',{class:'ct-axis',x:P.l-7,y:y+3.5,'text-anchor':'end'});
    t.textContent=O.fmt.shortN(max*g/4); svg.appendChild(t);
    t=mk('text',{class:'ct-axis',x:W-P.r+7,y:y+3.5,'text-anchor':'start'});
    t.textContent=(g*25)+'%'; svg.appendChild(t); }
  const bw=iw/data.length, pad=Math.min(6,bw*.2);
  let cum=0; let line='';
  data.forEach((d,i)=>{
    const h=Math.max(1,d.value/max*ih), x=P.l+i*bw+pad/2, y=P.t+ih-h;
    cum+=d.value; const cp=cum/tot;
    const rect=mk('rect',{class:'ct-bar',x:x,y:y,width:Math.max(.8,bw-pad),height:h,rx:1.5,
      fill: cp<=.8 ? 'var(--acc)' : cp<=.95 ? 'var(--info)' : 'var(--tx-3)'});
    bind(rect,`<b>${O.esc(d.key)}</b><span>${O.fmt.short(d.value)}<br>Cumulative: ${(cp*100).toFixed(1)}%</span>`);
    if(opt.onClick){rect.style.cursor='pointer';rect.addEventListener('click',()=>opt.onClick(d));}
    svg.appendChild(rect);
    const lx=x+(bw-pad)/2, ly=P.t+ih-cp*ih;
    line+=(i?'L':'M')+lx.toFixed(1)+','+ly.toFixed(1);
  });
  svg.appendChild(mk('path',{d:line,fill:'none',stroke:'var(--ok)','stroke-width':2,
    'stroke-linejoin':'round'}));
  const y80=P.t+ih-.8*ih;
  svg.appendChild(mk('line',{x1:P.l,x2:W-P.r,y1:y80,y2:y80,stroke:'var(--bad)',
    'stroke-width':1.3,'stroke-dasharray':'5 4',opacity:.85}));
  const l80=mk('text',{class:'ct-val',x:P.l+5,y:y80-6,fill:'var(--bad)'});
  l80.textContent='80% of revenue'; svg.appendChild(l80);
  const xl=mk('text',{class:'ct-axis',x:P.l+iw/2,y:H-9,'text-anchor':'middle'});
  xl.textContent=opt.xLabel||('Accounts ranked by value (n='+data.length+')'); svg.appendChild(xl);
  host.appendChild(svg);
};

/* ---------- SCATTER / BUBBLE ---------- */
Charts.scatter = function(host, pts, opt){
  opt=opt||{}; host.innerHTML='';
  const W=host.clientWidth||660,H=opt.height||300,P={t:16,r:18,b:42,l:58};
  const iw=Math.max(10,W-P.l-P.r), ih=H-P.t-P.b;
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  const xmax=Math.max(1,...xs), ymax=Math.max(1,...ys);
  const rmax=Math.max(1,...pts.map(p=>p.r||1));
  /* log scale keeps a single huge account from flattening everything else */
  const LOG = !!opt.logY, lg = v => Math.log10(Math.max(1,v));
  const ymin = LOG ? Math.max(1, Math.min(...ys.filter(v=>v>0))) : 0;
  const lo = LOG ? lg(ymin) : 0, hi = LOG ? lg(ymax) : ymax;
  const span = Math.max(.0001, hi-lo);
  const yPos = v => LOG ? (lg(v)-lo)/span : v/ymax;
  const yTick = t => LOG ? Math.pow(10, lo + span*t) : ymax*t;
  const svg=mk('svg',{class:'chart',viewBox:`0 0 ${W} ${H}`,height:H});
  for(let g=0;g<=4;g++){ const y=P.t+ih-ih*g/4;
    svg.appendChild(mk('line',{class:'ct-grid',x1:P.l,x2:W-P.r,y1:y,y2:y,opacity:g?.5:1}));
    const t=mk('text',{class:'ct-axis',x:P.l-7,y:y+3.5,'text-anchor':'end'});
    t.textContent=(opt.yFormat||O.fmt.shortN)(yTick(g/4)); svg.appendChild(t); }
  for(let g=0;g<=5;g++){ const x=P.l+iw*g/5;
    svg.appendChild(mk('line',{class:'ct-grid',x1:x,x2:x,y1:P.t,y2:P.t+ih,opacity:.34}));
    const t=mk('text',{class:'ct-axis',x:x,y:H-24,'text-anchor':'middle'});
    t.textContent=(opt.xFormat||O.fmt.shortN)(xmax*g/5); svg.appendChild(t); }
  pts.forEach(p=>{
    const cx=P.l+p.x/xmax*iw, cy=P.t+ih-(yPos(p.y)*ih);
    const rr=3+Math.sqrt((p.r||1)/rmax)*13;
    const c=mk('circle',{cx:cx,cy:cy,r:rr,fill:p.color||'var(--acc)','fill-opacity':.42,
      stroke:p.color||'var(--acc)','stroke-width':1.2,class:'ct-bar'});
    bind(c,`<b>${O.esc(p.label)}</b><span>${opt.tip?opt.tip(p):''}</span>`);
    if(opt.onClick){c.style.cursor='pointer';c.addEventListener('click',()=>opt.onClick(p));}
    svg.appendChild(c);
  });
  let t=mk('text',{class:'ct-axis',x:P.l+iw/2,y:H-6,'text-anchor':'middle'});
  t.textContent=opt.xLabel||''; svg.appendChild(t);
  t=mk('text',{class:'ct-axis',x:14,y:P.t+ih/2,'text-anchor':'middle',
    transform:`rotate(-90 14 ${P.t+ih/2})`});
  t.textContent=opt.yLabel||''; svg.appendChild(t);
  host.appendChild(svg);
};

/* ---------- STACKED BAR ---------- */
Charts.stacked = function(host, data, series, opt){
  opt=opt||{}; host.innerHTML='';
  const W=host.clientWidth||660,H=opt.height||250,P={t:16,r:12,b:38,l:52};
  const iw=Math.max(10,W-P.l-P.r), ih=H-P.t-P.b;
  const totals=data.map(d=>series.reduce((s,k)=>s+O.num(d[k.key]),0));
  const max=Math.max(1,...totals);
  const svg=mk('svg',{class:'chart',viewBox:`0 0 ${W} ${H}`,height:H});
  for(let g=0;g<=4;g++){ const y=P.t+ih-ih*g/4;
    svg.appendChild(mk('line',{class:'ct-grid',x1:P.l,x2:W-P.r,y1:y,y2:y,opacity:g?.5:1}));
    const t=mk('text',{class:'ct-axis',x:P.l-7,y:y+3.5,'text-anchor':'end'});
    t.textContent=(opt.format||O.fmt.shortN)(max*g/4); svg.appendChild(t); }
  const bw=iw/data.length, pad=Math.min(10,bw*.26);
  data.forEach((d,i)=>{
    let acc=0;
    series.forEach(s=>{
      const v=O.num(d[s.key]); if(v<=0) return;
      const h=v/max*ih, x=P.l+i*bw+pad/2, y=P.t+ih-acc-h;
      const r=mk('rect',{class:'ct-bar',x:x,y:y,width:Math.max(1,bw-pad),height:h,fill:s.color});
      bind(r,`<b>${O.esc(d.label||d.key)}</b><span>${s.label}: ${(opt.format||O.fmt.short)(v)}</span>`);
      svg.appendChild(r); acc+=h;
    });
    if(data.length<=20){ const t=mk('text',{class:'ct-axis',x:P.l+i*bw+bw/2,y:H-13,'text-anchor':'middle'});
      t.textContent=d.label||d.key; svg.appendChild(t); }
  });
  host.appendChild(svg);
  const lg=O.el('div',{class:'legend'});
  series.forEach(s=>lg.innerHTML+=`<span><i style="background:${s.color}"></i>${O.esc(s.label)}</span>`);
  host.appendChild(lg);
};

O.Charts = Charts;
})(window.OAK);
