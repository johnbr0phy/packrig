/**
 * Every top-tube and rear-top-tube product, checked for seating.
 *
 * A pack in this slot should stand ON the crown of the top tube. The failure
 * we are hunting is one that sinks into the frame triangle instead, which reads
 * as a bag floating in the middle of the bike.
 *
 * Measures the BODY, not the straps: straps legitimately wrap below the tube,
 * so the test takes the 20th-percentile lowest vertex per slice rather than the
 * absolute minimum, and compares it with the crown line through both anchors.
 */
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1000,height:700});
await p.goto(process.argv[2],{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:60000}).catch(()=>{});
await new Promise(r=>setTimeout(r,900));
const res = await p.evaluate(async ()=>{
  const app=window.app, THREE=window.__THREE;
  app.home?.close?.();
  const jobs=[];
  for (const br of app.catalog) for (const pr of br.products)
    if (pr.slot==='toptube'||pr.slot==='toptube_rear') jobs.push({br,pr,ui:pr.slot});
  const aF=new THREE.Vector3(), aR=new THREE.Vector3();
  app.bike.anchors.toptube.getWorldPosition(aF);
  app.bike.anchors.toptubeRear.getWorldPosition(aR);
  const crownAt=x=>aR.y+(aF.y-aR.y)*((x-aR.x)/(aF.x-aR.x));
  const out=[];
  const v=new THREE.Vector3();
  for (const j of jobs) {
    app.clearAll();
    app.bags.equip(j.ui,j.br,j.pr,0);
    await new Promise(r=>setTimeout(r,60));
    const rec=app.bags.equipped[j.ui];
    if(!rec?.mesh){ out.push({b:j.br.short,n:j.pr.name,slot:j.ui,err:'did not mount'}); continue; }
    const bb=new THREE.Box3().setFromObject(rec.mesh);
    const ys=[];
    rec.mesh.traverse(o=>{
      if(!o.isMesh||!o.geometry?.attributes?.position) return;
      const pos=o.geometry.attributes.position;
      for(let i=0;i<pos.count;i+=3){ v.fromBufferAttribute(pos,i); o.localToWorld(v); ys.push([v.x,v.y]); }
    });
    if(!ys.length) continue;
    // 20th percentile of (y - crown) across the sampled surface
    const d=ys.map(([x,y])=>(y-crownAt(x))*1000).sort((a,b)=>a-b);
    const p20=d[Math.floor(d.length*0.20)];
    const cx=(bb.min.x+bb.max.x)/2;
    out.push({b:j.br.short,n:j.pr.name,slot:j.ui,
      seatMM:+p20.toFixed(1),
      cxMM:+((cx-aR.x)*1000).toFixed(0),
      lenMM:+((bb.max.x-bb.min.x)*1000).toFixed(0)});
  }
  app.clearAll();
  return out;
});
await b.close();
const bad = res.filter(r=>r.err || r.seatMM < -45 || r.seatMM > 25);
console.log(`checked ${res.length} products`);
console.log(`suspect: ${bad.length}`);
for (const r of bad.slice(0,25)) console.log(`  ${r.slot.padEnd(13)} ${(r.b+' '+r.n).slice(0,44).padEnd(45)} seat=${r.err||r.seatMM+'mm'}`);
const ok = res.filter(r=>!bad.includes(r)).map(r=>r.seatMM).sort((a,b)=>a-b);
if (ok.length) console.log(`well-seated range: ${ok[0]}mm .. ${ok[ok.length-1]}mm (median ${ok[Math.floor(ok.length/2)]}mm)`);
process.exit(bad.length?1:0);
