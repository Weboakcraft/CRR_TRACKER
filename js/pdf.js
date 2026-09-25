/* ====== OAKCRAFT — ZERO-DEPENDENCY PDF WRITER ======
   Just enough of PDF 1.4 to lay out a clean business report: text in
   Helvetica / Helvetica-Bold, filled and stroked rectangles, lines, and
   accurate word-wrap from the real Adobe font metrics. No library, no
   CDN — in keeping with the rest of the app.

   Coordinates are in points (1/72 in), origin at the TOP-LEFT of the
   page, y growing downwards — the way a screen layout thinks.        */
(function(O){
'use strict';

/* Standard Helvetica advance widths for ASCII 32..126, per 1000 em. */
const W_R = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

/* The base-14 fonts only carry Latin text. Everything is folded to
   printable ASCII so a stray character can never corrupt the file:
   the rupee sign becomes "Rs", dashes and quotes go straight, accents
   are stripped, and anything else (e.g. Devanagari) becomes "?".     */
const MAP = {'₹':'Rs ','—':'-','–':'-','‒':'-','−':'-','‘':"'",'’':"'",
  '“':'"','”':'"','…':'...','·':'-','•':'-',' ':' ','→':'->',
  '←':'<-','✓':'v','✔':'v','×':'x',' ':' ',' ':' '};
function clean(s){
  s = String(s==null?'':s).replace(/[\r\t]/g,' ');
  s = s.replace(/[   ₹‒-—−‘’“”…·•→←✓✔×]/g, c=>MAP[c]);
  try{ s = s.normalize('NFKD').replace(/[̀-ͯ]/g,''); }catch(e){}
  return s.replace(/[^\n\x20-\x7e]/g,'?');
}
function esc(s){ return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }
const n2 = v => (Math.round(v*100)/100).toString();
function rgb(c){
  if(!c) return [0,0,0];
  if(Array.isArray(c)) return c.map(v=>v/255);
  const h = String(c).replace('#','');
  const x = h.length===3 ? h.split('').map(ch=>ch+ch).join('') : h;
  return [0,2,4].map(i=>parseInt(x.substr(i,2),16)/255);
}

function width(str, size, bold){
  const t = bold ? W_B : W_R; let w = 0;
  const s = clean(str);
  for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); w += (c>=32&&c<=126) ? t[c-32] : 556; }
  return w * size / 1000;
}

/* Greedy wrap on spaces; words wider than the line are hard-broken. */
function wrap(str, maxW, size, bold){
  const out = [];
  clean(str).split('\n').forEach(para=>{
    const words = para.split(/ +/); let line = '';
    words.forEach(wd=>{
      if(!wd) return;
      const tryL = line ? line+' '+wd : wd;
      if(width(tryL,size,bold) <= maxW){ line = tryL; return; }
      if(line) out.push(line);
      line = '';
      while(width(wd,size,bold) > maxW){
        let k = wd.length;
        while(k>1 && width(wd.slice(0,k),size,bold) > maxW) k--;
        out.push(wd.slice(0,k)); wd = wd.slice(k);
      }
      line = wd;
    });
    out.push(line);
  });
  return out.length ? out : [''];
}

function create(opt){
  opt = opt || {};
  const PW = opt.landscape ? 841.89 : 595.28, PH = opt.landscape ? 595.28 : 841.89;
  const pages = []; let cur = null;
  const Y = y => n2(PH - y);

  const doc = {
    W: PW, H: PH,
    width, wrap, clean,
    get pageCount(){ return pages.length; },
    get pageIndex(){ return pages.indexOf(cur); },
    addPage(){ cur = []; pages.push(cur); return doc; },
    setPage(i){ cur = pages[i]; return doc; },

    /* y is the TOP of the text line; the baseline sits ~0.78em below it */
    text(str, x, y, o){
      o = o || {};
      const size = o.size || 10, bold = !!o.bold, s = clean(str);
      if(!s) return doc;
      let tx = x;
      if(o.align==='right') tx = x - width(s,size,bold);
      else if(o.align==='center') tx = x - width(s,size,bold)/2;
      const [r,g,b] = rgb(o.color || '#111827');
      cur.push(`BT /${bold?'F2':'F1'} ${n2(size)} Tf ${n2(r)} ${n2(g)} ${n2(b)} rg ${n2(tx)} ${Y(y+size*0.78)} Td (${esc(s)}) Tj ET`);
      return doc;
    },
    rect(x, y, w, h, o){
      o = o || {};
      const ops = [];
      if(o.fill){ const [r,g,b]=rgb(o.fill); ops.push(`${n2(r)} ${n2(g)} ${n2(b)} rg`); }
      if(o.stroke){ const [r,g,b]=rgb(o.stroke); ops.push(`${n2(r)} ${n2(g)} ${n2(b)} RG ${n2(o.lw||0.6)} w`); }
      ops.push(`${n2(x)} ${Y(y+h)} ${n2(w)} ${n2(h)} re ${o.fill&&o.stroke?'B':o.fill?'f':'S'}`);
      cur.push('q '+ops.join(' ')+' Q');
      return doc;
    },
    line(x1, y1, x2, y2, o){
      o = o || {};
      const [r,g,b] = rgb(o.color || '#d1d5db');
      cur.push(`q ${n2(r)} ${n2(g)} ${n2(b)} RG ${n2(o.lw||0.6)} w ${n2(x1)} ${Y(y1)} m ${n2(x2)} ${Y(y2)} l S Q`);
      return doc;
    },

    /* Assemble the file. Every byte is ASCII, so string length == byte
       length and the xref offsets can be taken straight from .length. */
    output(meta){
      meta = meta || {};
      const objs = [];
      const add = s => { objs.push(s); return objs.length; };
      const catalog = add(null), pagesObj = add(null);
      const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const kids = [];
      pages.forEach(ops=>{
        const body = ops.join('\n');
        const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
        kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n2(PW)} ${n2(PH)}] `+
          `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
      });
      objs[catalog-1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
      objs[pagesObj-1] = `<< /Type /Pages /Kids [${kids.map(k=>k+' 0 R').join(' ')}] /Count ${kids.length} >>`;
      const d = new Date(), p2 = v=>String(v).padStart(2,'0');
      const stamp = `D:${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
      const info = add(`<< /Title (${esc(clean(meta.title||'Report'))}) /Author (${esc(clean(meta.author||''))}) `+
        `/Creator (${esc(clean(meta.creator||'Oakcraft CRR Tracker'))}) /CreationDate (${stamp}) >>`);

      let out = '%PDF-1.4\n';
      const offs = [];
      objs.forEach((o,i)=>{ offs.push(out.length); out += `${i+1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${objs.length+1}\n0000000000 65535 f \n` +
        offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('') +
        `trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
      return new Blob([out], {type:'application/pdf'});
    }
  };
  doc.addPage();
  return doc;
}

O.PDF = { create, width, wrap, clean };
})(window.OAK);
