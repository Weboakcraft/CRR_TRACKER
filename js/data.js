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

/* ---- Cross-module lookup used by the drawer ---- */
O.findCustomer = function(rec){
  if(!rec) return null;
  const list = O.raw['customers']||[];
  if(rec.sr_no!=null){ const m=list.find(c=>c.sr_no===rec.sr_no); if(m) return m; }
  return list.find(c=>c.customer_name===rec.customer_name) || null;
};
})(window.OAK);
