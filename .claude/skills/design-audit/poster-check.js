/* poster-check.js  (Charlie, 2026-11-20)
   For posters / graphics / art-heavy pages, where audit.js is blind (SVG, gradients, textures behind text).
   Paste into javascript_tool with the poster page open at its design size (e.g. 1080x1350 iframe, ?still=x).
   Set window.PC = {root:'.art', minMargin:65, gap:32, skip:'[data-audit-skip]'} before eval, or use defaults.
   Returns JSON: {issues:[...], rects:[{n,l,t,r,b,fs,c}]}  (rects feed px_contrast.py).
   Checks: 1 edge margin >= 6% of width  2 text inside its container (no overflow past the box / divider / film edge)
           3 gap text <-> filled artwork shapes >= gap (soft light beams excluded: filter id soft)  4 text <-> text overlap. */
(()=>{
const o=Object.assign({root:'.art',minMargin:null,gap:32,skip:'[data-audit-skip],.bad,.fail'},window.PC||{});
const root=document.querySelector(o.root),B=root.getBoundingClientRect(),minM=o.minMargin??Math.round(B.width*.06);
const isSvg=e=>e instanceof SVGElement;
const els=[...root.querySelectorAll('*')].filter(e=>!isSvg(e)&&!e.closest(o.skip)&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
const T=els.map(e=>{const cs=getComputedStyle(e),rg=document.createRange();rg.selectNodeContents(e);const rs=[...rg.getClientRects()].filter(r=>r.width>2&&r.height>2);if(!rs.length)return null;
 return {e,n:e.textContent.trim().slice(0,14).replace(/\s+/g,' '),l:Math.min(...rs.map(r=>r.left))-B.left,t:Math.min(...rs.map(r=>r.top))-B.top,r:Math.max(...rs.map(r=>r.right))-B.left,b:Math.max(...rs.map(r=>r.bottom))-B.top,fs:Math.round(parseFloat(cs.fontSize)),c:cs.color.match(/\d+/g).slice(0,3).join(',')}}).filter(Boolean);
const issues=[];
for(const x of T){
 const m=Math.min(x.l,x.t,B.width-x.r,B.height-x.b);if(m<minM)issues.push(`MARGIN ${x.n}: ${Math.round(m)}px to the poster edge (need ${minM})`);
 // container overflow: nearest block ancestor content box
 let p=x.e.parentElement;while(p&&p!==root&&getComputedStyle(p).display==='inline')p=p.parentElement;
 if(p&&p!==root){const pr=p.getBoundingClientRect(),cs=getComputedStyle(p),right=pr.right-parseFloat(cs.paddingRight)-B.left,left=pr.left+parseFloat(cs.paddingLeft)-B.left;
  if(x.r>right+1)issues.push(`OVERFLOW ${x.n}: text runs ${Math.round(x.r-right)}px past the right of its box`);
  if(x.l<left-1)issues.push(`OVERFLOW ${x.n}: text runs ${Math.round(left-x.l)}px past the left of its box`)}
}
// gaps to artwork
const shapes=[...root.querySelectorAll('svg path,svg circle,svg polygon,svg ellipse,svg rect')].filter(e=>{if(e.closest('defs')||e.closest('.tex')||e.closest('[filter="url(#soft)"]')||e.closest(o.skip))return false;const f=e.getAttribute('fill')||'';if(f.startsWith('url(')||(f==='none'&&!e.getAttribute('stroke')))return false;const r=e.getBoundingClientRect();return r.width*r.height>1500&&r.width<B.width*.95}).map(e=>({e,r:e.getBoundingClientRect()}));
for(const x of T)for(const {e,r} of shapes){const L=r.left-B.left,Tp=r.top-B.top,dx=Math.max(L-x.r,x.l-(L+r.width),0),dy=Math.max(Tp-x.b,x.t-(Tp+r.height),0),d=Math.hypot(dx,dy);
 if(d<o.gap)issues.push(`GAP ${x.n} ~ ${e.tagName}[${Math.round(L)},${Math.round(Tp)} ${Math.round(r.width)}x${Math.round(r.height)}] ${dx===0&&dy===0?'OVERLAPS':Math.round(d)+'px'} (need ${o.gap}; script fonts have tall boxes, judge by eye)`)}
// text vs text
for(let i=0;i<T.length;i++)for(let j=i+1;j<T.length;j++){const a=T[i],b=T[j];if(a.e.contains(b.e)||b.e.contains(a.e))continue;
 const ox=Math.min(a.r,b.r)-Math.max(a.l,b.l),oy=Math.min(a.b,b.b)-Math.max(a.t,b.t);if(ox>8&&oy>8)issues.push(`TEXT-ON-TEXT ${a.n} x ${b.n}: boxes overlap ${Math.round(ox)}x${Math.round(oy)}px (script/italic boxes can overlap legitimately, check by eye)`)}
return JSON.stringify({issues:[...new Set(issues)],rects:T.map(x=>({n:x.n,l:Math.round(x.l),t:Math.round(x.t),r:Math.round(x.r),b:Math.round(x.b),fs:x.fs,c:x.c}))});
})()
