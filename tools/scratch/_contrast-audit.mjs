/**
 * Walk every visible text node in a built state and compute its real contrast
 * against the background actually painted behind it, by compositing every
 * ancestor's background-color down to the page. Catches the whole class of
 * "invisible text" bugs a re-skin leaves behind — in either direction.
 *
 *   node tools/_contrast-audit.mjs
 */
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000});
const w=(ms)=>new Promise(r=>setTimeout(r,ms)); await w(1300);
await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1700);
await p.evaluate(()=>document.querySelector('.pr-btn.is-primary').click()); await w(1400);

const AUDIT = `(() => {
  const parse = (c) => { const m = c.match(/[\\d.]+/g); if(!m) return null;
    return [ +m[0], +m[1], +m[2], m[3]===undefined?1:+m[3] ]; };
  const lin = (v) => { v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  const L = ([r,g,bb]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(bb);
  const over = (fg, bg) => { const a=fg[3];
    return [fg[0]*a+bg[0]*(1-a), fg[1]*a+bg[1]*(1-a), fg[2]*a+bg[2]*(1-a), 1]; };
  const ratio = (a,b2)=>{ const la=L(a), lb=L(b2); const hi=Math.max(la,lb), lo=Math.min(la,lb);
    return (hi+0.05)/(lo+0.05); };
  // The page's own ground, under everything.
  const groundOf = (el) => {
    let bg = [18,19,22,1];               // the canvas is a dark 3D scene
    const chain = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) chain.push(n);
    for (const n of chain.reverse()) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) bg = over(c, bg);
    }
    return bg;
  };
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const txt = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('').trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fg = parse(cs.color); if (!fg) continue;
    // Include the element's OWN background: a bone-filled button carries its
    // ground with it, and scoring its dark label against the dark panel behind
    // it reports 1.03:1 for the most legible control on the screen.
    const bg = groundOf(el);
    const eff = over(fg, bg);
    const rr = ratio(eff, bg);
    const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    out.push({ sel: el.tagName.toLowerCase()+(el.className && typeof el.className==='string' ? '.'+el.className.trim().split(/\\s+/).join('.') : ''),
               txt: txt.slice(0,42), ratio: +rr.toFixed(2), size, floor: large?3:4.5 });
  }
  return out;
})()`;

const surfaces = [
  ['rig panel',   null],
  ['mount picker',".add-bag"],
  ['catalogue',   ".add-bag|.mount-btn"],
  ['bag sheet',   ".bag-card"],
  ['saved rigs',  "js:window.app.openRigs('list')"],
];
let worst = [];
for (const [name, script] of surfaces) {
  await p.evaluate(()=>document.querySelector('.sheet-close')?.click()); await w(700);
  if (script) for (const step of script.split('|')) {
    if (step.startsWith('js:')) await p.evaluate(s=>eval(s), step.slice(3));
    else await p.evaluate(s=>document.querySelector(s)?.click(), step);
    await w(1200);
  }
  const rows = await p.evaluate(AUDIT);
  const bad = rows.filter(r=>r.ratio < r.floor).sort((a,b)=>a.ratio-b.ratio);
  console.log(`\n${name}: ${rows.length} text nodes, ${bad.length} below floor`);
  for (const r of bad.slice(0,10)) console.log(`   ${String(r.ratio).padStart(5)}:1  (floor ${r.floor})  ${r.sel}  "${r.txt}"`);
  worst.push(...bad.map(r=>({...r,surface:name})));
}
await b.close();
console.log(`\nTOTAL below floor: ${worst.length}`);
