/**
 * Every visible line of text in the chrome, against the background it sits on.
 *
 * The theme swept the components it knew about and missed `rigs.css`, which
 * predates all of it and writes white text directly. On a white surface that is
 * not "a bit off" — the signed-in rig sheet rendered as a column of ghost
 * outlines with two words in it. This walks the whole interface instead of the
 * parts someone remembered.
 *
 * 3:1 is the floor here rather than WCAG's 4.5, because a lot of this is large
 * or secondary text where 3:1 is the standard's own bar — the point is to catch
 * INVISIBLE, not to grade the palette.
 */
import puppeteer from 'puppeteer-core';
const [,,URL,W='1440',H='900'] = process.argv;
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.setViewport({width:+W,height:+H});
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:60000}).catch(()=>{});
const w=(ms=800)=>new Promise(r=>setTimeout(r,ms)); await w(1200);
const fail=[]; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail.push(m)};

const audit = () => p.evaluate(() => {
  const lum=(c)=>{const m=(c.match(/[\d.]+/g)||[0,0,0]).map(Number);const f=m.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*f[0]+.7152*f[1]+.0722*f[2]};
  const bgOf=(n)=>{let e=n;while(e){const c=getComputedStyle(e).backgroundColor;if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c))return c;e=e.parentElement}return null};
  const roots=[...document.querySelectorAll('.panel,.topbar,.sheet:not([hidden]),.home,.gal,.toast,.aero-panel')];
  const bad=[];
  for(const root of roots){
    if(getComputedStyle(root).display==='none') continue;
    for(const n of root.querySelectorAll('*')){
      if(!n.textContent?.trim()||n.children.length) continue;
      const cs=getComputedStyle(n);
      if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<.15) continue;
      const r=n.getBoundingClientRect(); if(r.width<3||r.height<3) continue;
      const bg=bgOf(n); if(!bg) continue;           // over the 3D scene: not ours to judge
      const a=lum(cs.color), c=lum(bg);
      const ratio=(Math.max(a,c)+.05)/(Math.min(a,c)+.05);
      if(ratio<3) bad.push(`${(n.className||n.tagName).toString().split(' ')[0]} "${n.textContent.trim().slice(0,20)}" ${ratio.toFixed(1)}:1`);
    }
  }
  return [...new Set(bad)];
});

const steps = [
  ['the builder', async()=>{ await p.evaluate(()=>document.querySelector('.home-btn.is-primary')?.click()); await w(); await p.evaluate(()=>document.querySelector('.btn.quiet')?.click()); await w(1100); }],
  ['the bag sheet', async()=>{ await p.evaluate(()=>document.querySelector('.bag-card:not(.unfit)')?.click()); await w(900); }],
  ['the catalogue', async()=>{ await p.evaluate(()=>document.querySelector('.sheet-close')?.click()); await w(); await p.evaluate(()=>document.querySelector('.add-bag')?.click()); await w(900); await p.evaluate(()=>[...document.querySelectorAll('.mount-btn')][0]?.click()); await w(1000); }],
  ['your rigs', async()=>{ await p.evaluate(()=>document.querySelector('.sheet-close')?.click()); await w(); await p.evaluate(()=>{const a=window.app;a.rigs.save('Summer rig');a.ui.sync()}); await p.evaluate(()=>document.querySelector('.rn-back')?.click()); await w(900); }],
  ['the account sheet', async()=>{ await p.evaluate(()=>window.app.openRigs?.('list')); await w(1200); }],
  ['the root menu', async()=>{ await p.evaluate(()=>document.querySelector('.sheet-close')?.click()); await w(); await p.evaluate(()=>window.app.home?.open?.()); await w(900); }],
  ['the gallery', async()=>{ await p.evaluate(()=>document.querySelector('.home-btn:not(.is-primary)')?.click()); await w(1400); }],
];
for (const [name, go] of steps) {
  await go();
  const bad = await audit();
  ok(bad.length===0, `${name}: every line is legible ${bad.slice(0,4).join(' | ')}`);
}
await b.close();
console.log(fail.length?`\nFAILED ${fail.length}`:'\nALL PASS');
process.exit(fail.length?1:0);
