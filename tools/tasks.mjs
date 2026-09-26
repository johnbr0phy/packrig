/**
 * Walk the app as a stranger: real tasks, by real taps, counted.
 *
 *   node tools/tasks.mjs [--flows after|before] [--only firsttimer,build] [--device phone]
 *
 * Every flow starts from a fresh, signed-out browser at the front door and
 * uses only what is on screen: `tap` finds a visible control by its text or
 * label and clicks it like a finger would. Each tap is counted; typing or
 * pasting into a field counts as one. When the control is not on screen
 * without scrolling, the run notes it as a hesitation: a stranger would have
 * had to look for it. The flows themselves live in tools/lib/flows-<set>.mjs,
 * so the "before" set (the UI as it was) is kept beside the current one.
 *
 * Output: a table of taps and hesitations per flow and device, screenshots
 * in shots/tasks/<set>/, and shots/tasks/<set>/report.json.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';

const argv = process.argv.slice(2);
const set = argv.includes('--flows') ? argv[argv.indexOf('--flows') + 1] : 'after';
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const onlyDevice = argv.includes('--device') ? argv[argv.indexOf('--device') + 1] : null;
const root = new URL('../', import.meta.url).pathname;
const OUT = `${root}shots/tasks/${set}/`;
mkdirSync(OUT, { recursive: true });
const { FLOWS } = await import(`./lib/flows-${set}.mjs`);
const SHEET = readFileSync(root + 'data/seed/megafuck.tsv', 'utf8');
await takeRenderLock('tasks');

const DEVICES = {
  phone: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const report = [];
let fails = 0;

for (const [name, flow] of Object.entries(FLOWS)) {
  if (only && !only.includes(name)) continue;
  for (const [device, vp] of Object.entries(DEVICES)) {
    if (onlyDevice && device !== onlyDevice) continue;
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport(vp);
    await ctx.overridePermissions('http://localhost:8735', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']).catch(() => {});
    let taps = 0;
    const hes = [];
    const steps = [];
    const find = async (sel, text, { timeout = 30000 } = {}) => p.waitForFunction((s, t) => {
      const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !n.closest('[inert]') && +cs.opacity > 0.1; };
      const txt = (n) => `${n.getAttribute('aria-label') || ''} ${n.textContent || ''}`;
      return [...document.querySelectorAll(s)].find((n) => vis(n) && (!t || txt(n).includes(t)));
    }, { timeout, polling: 200 }, sel, text).then((h) => h.asElement());
    const ctl = {
      page: p, device, sheet: SHEET,
      async tap(sel, text, note) {
        const h = await find(sel, text);
        // a person scrolls the list until the control is in view: if that
        // took a scroll, it is a hesitation (they had to look for it)
        const moved = await h.evaluate((n) => { const a = n.getBoundingClientRect().top; n.scrollIntoView({ block: 'nearest' }); return Math.abs(n.getBoundingClientRect().top - a) > 4; });
        if (moved) { hes.push(`scroll to find "${text || sel}"`); await new Promise((r) => setTimeout(r, 300)); }
        // a finger lands on the middle of the control; if something else is on top, it hits that
        // a person waits for a sheet to finish arriving: give it 2.5 s to be on top
        let hit = false;
        for (let i = 0; i < 25 && !hit; i++) {
          hit = await h.evaluate((n) => { const r = n.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y); return !top || n === top || n.contains(top); });
          if (!hit) await new Promise((r) => setTimeout(r, 100));
        }
        if (!hit) {
          const by = await h.evaluate((n) => { const r = n.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : 'nothing'; });
          hes.push(`"${text || sel}" was covered by ${by}`);
        }
        await h.click();
        taps++;
        steps.push(`${taps}. ${note || text || sel}`);
        await new Promise((r) => setTimeout(r, 350));
      },
      async type(sel, value, note) {
        const h = await find(sel);
        await h.evaluate((n, v) => { n.focus(); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); }, value);
        taps++;
        steps.push(`${taps}. ${note || 'type'}`);
        await new Promise((r) => setTimeout(r, 350));
      },
      async key(k) { await p.keyboard.press(k); },
      hesitate(why) { hes.push(why); },
      async wait(fn, arg, timeout = 60000) { return p.waitForFunction(fn, { timeout, polling: 250 }, arg); },
      async eval(fn, arg) { return p.evaluate(fn, arg); },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    };
    const t0 = Date.now();
    let res = null, ok = true, why = '';
    try {
      if (flow.url) await p.goto(await flow.url(ctl), { waitUntil: 'load', timeout: 120000 });
      else await p.goto('http://localhost:8735/', { waitUntil: 'load', timeout: 120000 });
      await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
      await new Promise((r) => setTimeout(r, 800));
      res = await flow.run(ctl);
      if (res && res.ok === false) { ok = false; why = res.why || ''; }
    } catch (e) { ok = false; why = e.message.split('\n')[0]; }
    if (errs.length) { ok = false; why += ` page errors: ${errs.join(' | ')}`; }
    if (!ok) fails++;
    await p.screenshot({ path: `${OUT}${name}-${device}.png` }).catch(() => {});
    const row = { flow: name, device, ok, taps, hesitations: hes, steps, result: res, why, seconds: Math.round((Date.now() - t0) / 1000) };
    report.push(row);
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(11)} ${device.padEnd(8)} ${String(taps).padStart(3)} taps${hes.length ? `, ${hes.length} hesitation${hes.length === 1 ? '' : 's'}` : ''}${why ? `  ${why}` : ''}`);
    for (const h of hes) console.log(`      hesitated: ${h}`);
    if (res?.summary) console.log(`      ${res.summary}`);
    await ctx.close();
  }
}
await b.close();
writeFileSync(OUT + (only || onlyDevice ? 'report-partial.json' : 'report.json'), JSON.stringify(report, null, 1));
console.log(fails ? `\n${fails} problems` : '\nall clean');
process.exit(fails ? 1 : 0);
