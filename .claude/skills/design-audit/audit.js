/* design-audit: paste into javascript_tool on the page (or an iframe's contentWindow via audit(doc)).
   Returns a compact JSON string: contrast, size scale, spacing unit, overflow, centering.
   Intentional failing demos: mark them with class "bad", "fail" or data-audit-skip and they are skipped. */
(() => {
const SKIP = '.bad,.fail,[data-audit-skip]';
const parse = c => { const m = (c||'').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
const over = (f,b) => ({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
const L = c => { const v=[c.r,c.g,c.b].map(x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)}); return .2126*v[0]+.7152*v[1]+.0722*v[2]; };
const ratio = (a,b) => { const x=L(a), y=L(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
const hex = c => '#'+[c.r,c.g,c.b].map(x=>Math.round(x).toString(16).padStart(2,'0')).join('').toUpperCase();
const bgOf = el => { const l=[]; let n=el, img=false; while(n&&n.nodeType===1){ const cs=getComputedStyle(n); if(cs.backgroundImage!=='none') img=true; const c=parse(cs.backgroundColor); if(c&&c.a>0){l.push(c); if(c.a>=1) break;} n=n.parentElement; } let b={r:255,g:255,b:255,a:1}; for(let i=l.length-1;i>=0;i--) b=over(l[i],b); return {c:b,img}; };
const sec = el => (el.closest('section,header,nav,footer')||{}).id || (el.closest('section,header,nav,footer')||{}).tagName?.toLowerCase() || 'page';
const bucket = {}; const add = (type, key) => { (bucket[type] = bucket[type] || {})[key] = (bucket[type][key]||0) + 1; };
const SCALE = [9.9,16,25.9,41.9,67.8,109.7, 14,23,38,61,99,160, 14.6,23.6,38.2,61.8,100]; // x1.618 web rem steps + slide px steps
const onScale = v => SCALE.some(s => Math.abs(s - v) <= 0.7);
const RADII = [0,2,4,8,13,21,34];
const UNIT = 8;
const SP = ['paddingTop','paddingRight','paddingBottom','paddingLeft','rowGap','columnGap','marginTop','marginBottom'];
const vw = document.documentElement.clientWidth;
let textEls = 0;
document.querySelectorAll('body *').forEach(el => {
  const tag = el.tagName.toUpperCase(); if (['SCRIPT','STYLE','SVG','PATH','NOSCRIPT','BR'].includes(tag)) return;
  if (el.closest(SKIP)) return;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if (!r.width || !r.height || cs.visibility==='hidden' || cs.display==='none') return;
  const where = sec(el), name = tag.toLowerCase()+(typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/)[0]:'');
  const own = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim());
  if (own) {
    textEls++;
    const f = parse(cs.color), {c:bg,img} = bgOf(el); let op=1,n=el; while(n&&n.nodeType===1){op*=parseFloat(getComputedStyle(n).opacity);n=n.parentElement;}
    const fg = over({...f,a:f.a*op},bg); const size=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight)>=700;
    const need=(size>=24||(bold&&size>=18.66))?3:4.5, rt=ratio(fg,bg);
    if (rt < need) add('CONTRAST', `${where} ${hex(fg)} on ${hex(bg)} ${rt.toFixed(2)}:1 need ${need} ${Math.round(size)}px ${name}${img?' (bg image: verify by eye)':''}`);
    else if (img) add('CHECK-BY-EYE (bg image)', `${where} ${name}`);
    if (!onScale(size)) add('SIZE off x1.618 scale', `${Math.round(size*10)/10}px`);
  }
  for (const p of SP) { const v = parseFloat(cs[p]); if (v > 0 && v % UNIT !== 0 && !(v < 3)) add('SPACING off 8px unit', `${p.replace(/Top|Right|Bottom|Left/,'')} ${Math.round(v*10)/10}px`); }
  const rad = parseFloat(cs.borderTopLeftRadius); if (rad > 0 && rad < 500 && !RADII.includes(Math.round(rad))) add('RADIUS off scale', `${Math.round(rad*10)/10}px`);
  const inScroller = (() => { let n=el.parentElement; while(n&&n!==document.body){ const o=getComputedStyle(n).overflowX; if(o==='auto'||o==='scroll'||o==='hidden') return true; n=n.parentElement;} return false; })();
  if (r.right > vw + 1 && cs.position !== 'fixed' && !inScroller) add('OVERFLOW (wider than viewport)', `${where} ${name} right=${Math.round(r.right)} vw=${vw}`);
  // centred text in pills / buttons / circles: text range vs box
  if (own && (cs.borderRadius !== '0px') && (cs.display.includes('flex')||cs.display.includes('grid')||tag==='BUTTON'||(cs.textAlign==='center'))) {
    const rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect();
    if (t.width && Math.abs((t.left+t.width/2)-(r.left+r.width/2)) > 2 && cs.textAlign==='center') add('NOT CENTRED horizontally', `${where} ${name} off by ${Math.round((t.left+t.width/2)-(r.left+r.width/2))}px`);
  }
});
const summary = {};
for (const [t,o] of Object.entries(bucket)) summary[t] = Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,n])=>k+(n>1?' x'+n:''));
return JSON.stringify({textElements:textEls, viewport:vw, issueTypes:Object.keys(summary).length, ...summary}, null, 0);
})()
