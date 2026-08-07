import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://localhost:8735/?kit=seatpack:0:2,barroll:0:3', { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__READY_DONE === true').catch(()=>{});
await new Promise(r=>setTimeout(r,400));

// find a screen point that lands on the seat pack
const pt = await p.evaluate(() => {
  const THREE = window.__THREE, app = window.app;
  const m = app.bags.equipped.seatpack.mesh;
  const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
  c.project(app.camera);
  return { x: (c.x * 0.5 + 0.5) * window.innerWidth, y: (-c.y * 0.5 + 0.5) * window.innerHeight };
});
console.log('seatpack at screen', Math.round(pt.x), Math.round(pt.y));

await p.mouse.move(pt.x, pt.y); await new Promise(r=>setTimeout(r,200));
console.log('after hover:', await p.evaluate(() => JSON.stringify({
  cursor: document.getElementById('scene').style.cursor,
  emissive: (() => { let v=null; window.app.bags.equipped.seatpack.mesh.traverse(o=>{ if(!v&&o.isMesh&&o.material?.emissive) v=o.material.emissive.getHexString(); }); return v; })(),
})));

const before = await p.evaluate(() => window.app.controls.target.toArray().map(n=>+n.toFixed(3)));
await p.mouse.down(); await p.mouse.up();
await new Promise(r=>setTimeout(r,700));
console.log('target before click', before);
console.log('after click:', await p.evaluate(() => JSON.stringify({
  selected: window.app.focus.selected,
  camDist: +window.app.camera.position.distanceTo(window.app.controls.target).toFixed(3),
  panelSelected: [...document.querySelectorAll('.bag-card.sel')].map(c=>c.dataset.slot),
  panelHovered: [...document.querySelectorAll('.bag-card.hov')].map(c=>c.dataset.slot),
})));
await p.screenshot({ path: '/private/tmp/claude-502/-Users-johnbrophy-bikes/264b8cd3-eb74-4b3a-b755-d7b8ba76cd90/scratchpad/focus-sel.png' });
// clicking the same bag again should release and pull back to the whole bike
await p.mouse.down(); await p.mouse.up();
await new Promise(r=>setTimeout(r,700));
console.log('after 2nd click:', await p.evaluate(() => JSON.stringify({
  selected: window.app.focus.selected,
  camDist: +window.app.camera.position.distanceTo(window.app.controls.target).toFixed(3),
})));
await b.close();
