import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERR', String(e)));
await page.goto('http://localhost:8735/?env=night&cam=hero&world=1&shot=1', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__READY_DONE === true', { timeout: 15000 });

const out = await page.evaluate(async () => {
  const THREE = await import('./node_modules/three/build/three.module.js');
  const { scene, camera } = window.app;
  const rc = new THREE.Raycaster();
  rc.far = 1e6;
  const probe = (x, y) => {
    rc.setFromCamera(new THREE.Vector2(x, y), camera);
    const hits = rc.intersectObjects(scene.children, true);
    return hits.slice(0, 4).map((h) => ({
      t: h.object.type,
      n: h.object.name || '(anon)',
      d: Math.round(h.distance),
      mat: h.object.material?.type,
      col: h.object.material?.color ? h.object.material.color.getHexString() : null,
      blend: h.object.material?.blending,
      vis: h.object.visible,
    }));
  };
  // NDC: x -1 left .. +1 right ; y -1 bottom .. +1 top
  const list = {};
  for (const [lbl, x, y] of [
    ['upperLeft', -0.55, 0.55],
    ['upperMid', -0.1, 0.6],
    ['upperRight', 0.6, 0.6],
    ['leftEdge', -0.9, 0.2],
  ]) list[lbl] = probe(x, y);
  const roots = scene.children.map((o) => `${o.type}:${o.name || ''}:vis=${o.visible}:ro=${o.renderOrder}`);
  return { list, roots };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
