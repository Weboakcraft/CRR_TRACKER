/* ====== OAKCRAFT — DATA LAYER (loads real Excel-derived JSON) ====== */
(function(O){
'use strict';
O.raw = O.raw || {};
const loaded = {}, pending = {};

/* Works on GitHub Pages (fetch) and from file:// (script injection) */
function loadScript(name){
  if(loaded[name]) return Promise.resolve(O.raw[name]);
  if(pending[name]) return pending[name];
  pending[name] = new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='data/'+name+'.js';
    s.onload=()=>{ loaded[name]=true; res(O.raw[name]); };
    s.onerror=()=>rej(new Error('Could not load data/'+name+'.js'));
    document.head.appendChild(s);
  });
  return pending[name];
}
O.load = loadScript;
O.loadAll = names => Promise.all(names.map(loadScript));

O.data = {
  get meta(){ return O.raw['meta']; },
  get analytics(){ return O.raw['analytics']; },
  get customers(){ return O.raw['customers']; },
  module(id){ return O.raw['module-'+id]; },
  loadModule(id){ return loadScript('module-'+id); },
  byName(n){ return (O.raw['customers']||[]).find(c=>c.customer_name===n); },
  bySr(sr){ return (O.raw['customers']||[]).find(c=>c.sr_no===sr); }
};

/* ---- Cross-module lookup used by the drawer and the follow-up board ----
   Indexed once, so resolving a few thousand follow-ups stays O(n) overall
   instead of scanning all 760 accounts for every single row.            */
let IDX = null, IDX_LEN = -1;
function index(){
  const list = O.raw['customers']||[];
  if(IDX && IDX_LEN===list.length) return IDX;
  IDX = {bySr:new Map(), byName:new Map()};
  list.forEach(c=>{
    if(c.sr_no!=null && !IDX.bySr.has(c.sr_no)) IDX.bySr.set(c.sr_no, c);
    if(c.customer_name && !IDX.byName.has(c.customer_name)) IDX.byName.set(c.customer_name, c);
  });
  IDX_LEN = list.length;
  return IDX;
}
O.customerIndex = index;
O.findCustomer = function(rec){
  if(!rec) return null;
  const ix = index();
  if(rec.sr_no!=null){ const m=ix.bySr.get(rec.sr_no); if(m) return m; }
  return ix.byName.get(rec.customer_name) || null;
};
})(window.OAK);
