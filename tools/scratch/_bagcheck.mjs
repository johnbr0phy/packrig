// Do the bags another session is mid-way through actually mount and draw?
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 p.on('console',m=>{const t=m.text(); if(m.type()==='error' && !/ERR_BLOCKED|Failed to load resource/.test(t)) errs.push(t);});
 await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1500);
 // Every loadout, every bag: does each one mount and produce geometry?
 const res = await p.evaluate(async ()=>{
   const out=[];
   const rigs = await fetch('./data/loadouts.json').then(r=>r.json());
   for (const l of rigs){
     window.app.__applyRig(l.rig);
     const eq = window.app.bags.equipped;
     const unfit = Object.keys(window.app.bags.unfitted||{});
     let empty = 0;
     for (const [slot,e] of Object.entries(eq)){
       const g = e.group || e.mesh;
       if (!g) { empty++; continue; }
       const box = new window.__THREE.Box3().setFromObject(g);
       if (box.isEmpty()) empty++;
     }
     out.push({name:l.name, want:l.rig.bags.length, got:Object.keys(eq).length, unfit:unfit.length, empty});
   }
   return out;
 });
 for (const r of res){
   const ok = r.got===r.want && r.empty===0;
   console.log(`${ok?'ok  ':'FAIL'} ${r.name.padEnd(17)} ${r.got}/${r.want} mounted, ${r.empty} without geometry, ${r.unfit} unfitted`);
 }
 // A barroll and a half frame bag specifically — the two builders being edited.
 await p.evaluate(()=>{ window.app.clearAll();
   const cat=window.app.catalog;
   const find=(b,n)=>{const br=cat.find(x=>x.name===b); return {brand:br,product:br.products.find(p=>p.name.includes(n))};};
   const a=find('Tailfin','Bar Bag System - Drop Bar'); window.app.bags.equip('barroll',a.brand,a.product,0);
   const c=find('Tailfin','Half Frame Bag'); window.app.bags.equip('framebag_half',c.brand,c.product,0);
   window.app.ui?.sync?.(); });
 await w(1200);
 await p.screenshot({path:process.argv[2]});
 console.log(errs.length?'ERRORS: '+errs.slice(0,4).join(' | '):'no console errors');
} finally { await b.close(); }
