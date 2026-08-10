// Builds the shareable review page: reference photo | baseline | v2, with the
// gate numbers. Images are inlined as data URIs because the artifact host
// blocks every external request.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const A = '2026-08-09T03-13-21-baseline';
const B = '2026-08-09T04-16-01-panels-v2';
const out = process.argv[2];

const set = JSON.parse(readFileSync(join(root, 'evals/sets/apidura-v1.json')));
const rep = (r) => Object.fromEntries(JSON.parse(readFileSync(join(root, 'evals/runs', r, 'shots/report.json'))).map((x) => [x.slug, x]));
const gat = (r) => Object.fromEntries(JSON.parse(readFileSync(join(root, 'evals/runs', r, 'auto.json'))).gates.map((x) => [x.slug, x]));
const RA = rep(A), RB = rep(B), GA = gat(A), GB = gat(B);

const b64 = (p) => {
  const f = join(root, p);
  if (!existsSync(f)) return null;
  const ext = p.endsWith('.png') ? 'png' : 'jpeg';
  return `data:image/${ext};base64,${readFileSync(f).toString('base64')}`;
};
const shot = (run, slug, cam = 'side') => b64(`evals/runs/${run}/shots/${slug}/${cam}.jpg`);

const SPECIMENS = [
  { slug: 'apidura-expedition-saddle-pack-9l', changed: true,
    note: 'The bag John scored. Was a lathe-turned barrel; the record said <code>tapered_wedge</code> / <code>rounded_rect</code> all along. The depth profile also ran backwards — it swelled toward the tail where the record says it blades to a point.' },
  { slug: 'apidura-backcountry-saddle-pack-6l', changed: true,
    note: 'Same builder, a product nobody looked at. This is the blast radius: one edit moved all 78 seat packs in the catalogue.' },
  { slug: 'apidura-expedition-downtube-pack-1-5l', changed: true,
    note: 'Three bugs. Height and width were collapsed into a single capsule radius using the larger of the two, and the bag was centred <em>on</em> the down tube rather than slung under it — 23 mm inside the frame and 9 mm inside the front tyre.' },
  { slug: 'apidura-expedition-handlebar-pack-14l', changed: false,
    note: 'Untouched, and representative of what is left: bar rolls, bar bags, stem bags, fork bags and saddlebags are all still solids of revolution.' },
];

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function sizeLine(it, m) {
  if (!m) return '—';
  const bb = m.bbox_body_mm || m.bbox_mm;
  const axes = it.record?.mount?.axes || {};
  const rd = it.record?.render || {};
  const d = it.dims_cm || {};
  const spec = [['len', rd.len_cm ?? d.len], ['wid', rd.wid_cm ?? d.wid], ['hgt', rd.hgt_cm ?? d.hgt]];
  return spec.map(([k, w]) => {
    const a = String(axes[k] || '').replace('-', '');
    if (!['x', 'y', 'z'].includes(a)) return `<span class="na">${k} n/a</span>`;
    const v = bb[a] / 10;
    const p = w ? Math.round((v - w) / w * 100) : null;
    const cls = p == null ? '' : Math.abs(p) > 25 ? 'bad' : Math.abs(p) > 12 ? 'warn' : 'good';
    return `<span class="${cls}">${v.toFixed(1)}<i>${p == null ? '' : ` ${p > 0 ? '+' : ''}${p}%`}</i></span>`;
  }).join('<b>×</b>');
}

const verdict = (slug) => {
  const a = GA[slug], b = GB[slug];
  const k = ['placed', 'no_clash', 'tyre', 'attached'];
  const fa = k.filter((x) => a?.[x] === false), fb = k.filter((x) => b?.[x] === false);
  if (!fa.length && !fb.length) return { cls: 'ok', txt: 'clean in both' };
  if (fa.length && !fb.length) return { cls: 'fixed', txt: `fixed: ${fa.join(', ')}` };
  if (!fa.length && fb.length) return { cls: 'broke', txt: `broke: ${fb.join(', ')}` };
  return { cls: 'part', txt: `was ${fa.join(', ')} → now ${fb.join(', ')}` };
};

const rows = SPECIMENS.map((s) => {
  const it = set.items.find((i) => i.slug === s.slug);
  const photo = b64(it.refs[0].path);
  const ia = shot(A, s.slug), ib = shot(B, s.slug);
  const v = verdict(s.slug);
  const title = [it.line, it.name, it.size].filter(Boolean).join(' ');
  return `
  <article class="spec${s.changed ? '' : ' untouched'}">
    <header class="spec-head">
      <h3>${esc(title)}</h3>
      <span class="slot">${it.slot}</span>
      <span class="badge ${v.cls}">${v.txt}</span>
    </header>
    <div class="triptych">
      <figure><div class="frame photo"><img src="${photo}" alt="${esc(title)} product photograph"></div><figcaption>the product</figcaption></figure>
      <figure><div class="frame"><img src="${ia}" alt="baseline render"></div><figcaption>baseline</figcaption></figure>
      <figure><div class="frame"><img src="${ib}" alt="panels-v2 render"></div><figcaption class="now">panels&#8209;v2${s.changed ? '' : ' <em>(identical)</em>'}</figcaption></figure>
    </div>
    <div class="readout">
      <div class="dims"><span class="lab">rendered</span> ${sizeLine(it, RB[s.slug])} <span class="unit">cm, body only</span></div>
      <div class="dims"><span class="lab">recorded</span> <code>${esc(it.record?.geometry?.form || '—')}</code> · <code>${esc(it.record?.geometry?.crossSection || '—')}</code></div>
    </div>
    <p class="note">${s.note}</p>
  </article>`;
}).join('\n');

const GATES = [
  ['placed', 70, 70], ['no clash', 64, 66], ['tyre clearance', 66, 69],
  ['attached', 66, 66], ['size', 4, 13],
];
const gateRows = GATES.map(([k, a, b]) => {
  const d = b - a;
  return `<tr><th>${k}</th><td class="num">${a}<i>/70</i></td><td class="num">${b}<i>/70</i></td>
   <td class="num delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' : ''}${d || '—'}</td></tr>`;
}).join('');

writeFileSync(out, `<title>Bag model review — baseline vs panels-v2</title>
<style>
:root{
  --ground:#EDEDE7; --surface:#F7F7F2; --sunk:#E3E4DC;
  --ink:#191D1B; --dim:#6C716A; --line:#D2D3C9;
  --accent:#2C6B78; --good:#4C7A42; --warn:#9A6B1A; --bad:#A33A2E;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,"Cascadia Mono",monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#121513; --surface:#1A1E1C; --sunk:#0D100E;
  --ink:#E7E9E3; --dim:#8B918A; --line:#2C312E;
  --accent:#5FA8B5; --good:#7FB06C; --warn:#D0A047; --bad:#D9695C;
}}
:root[data-theme="dark"]{
  --ground:#121513; --surface:#1A1E1C; --sunk:#0D100E;
  --ink:#E7E9E3; --dim:#8B918A; --line:#2C312E;
  --accent:#5FA8B5; --good:#7FB06C; --warn:#D0A047; --bad:#D9695C;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:clamp(28px,5vw,64px) clamp(18px,4vw,40px) 96px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--dim);margin:0 0 14px}
h1{font-size:clamp(30px,4.4vw,46px);line-height:1.08;letter-spacing:-.022em;margin:0 0 18px;
  text-wrap:balance;font-weight:640}
.standfirst{font-family:var(--serif);font-size:clamp(17px,2vw,20px);line-height:1.5;
  max-width:62ch;color:var(--ink);margin:0 0 6px}
.standfirst + .standfirst{margin-top:14px;color:var(--dim)}
.rule{height:1px;background:var(--line);margin:38px 0 30px;border:0}
h2{font-size:13px;font-family:var(--mono);letter-spacing:.12em;text-transform:uppercase;
  color:var(--dim);font-weight:600;margin:0 0 16px}
p{max-width:64ch}
.prose{font-family:var(--serif);font-size:17px;line-height:1.62;max-width:64ch}
code{font-family:var(--mono);font-size:.88em;background:var(--sunk);padding:1px 5px;border-radius:3px}

/* summary */
.summary{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,380px);
  gap:clamp(24px,4vw,48px);align-items:start}
@media(max-width:760px){.summary{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
caption{text-align:left;font-family:var(--mono);font-size:11px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--dim);padding-bottom:10px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;font-weight:400}
thead th{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--dim);
  text-transform:uppercase}
tbody th{font-size:14px}
.num{font-family:var(--mono);font-size:14px;text-align:right}
.num i{font-style:normal;color:var(--dim);font-size:11px}
.delta.up{color:var(--good)}.delta.down{color:var(--bad)}.delta.flat{color:var(--dim)}

/* specimens */
.spec{margin:0 0 clamp(40px,6vw,68px);padding-top:26px;border-top:1px solid var(--line)}
.spec-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.spec-head h3{font-size:20px;letter-spacing:-.01em;margin:0;font-weight:620}
.slot{font-family:var(--mono);font-size:11px;color:var(--dim);letter-spacing:.06em}
.badge{margin-left:auto;font-family:var(--mono);font-size:11px;letter-spacing:.04em;
  padding:3px 9px;border-radius:2px;border:1px solid currentColor}
.badge.fixed{color:var(--good)}.badge.ok{color:var(--dim)}
.badge.broke{color:var(--bad)}.badge.part{color:var(--warn)}
.triptych{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:700px){.triptych{grid-template-columns:1fr}}
figure{margin:0}
.frame{background:var(--sunk);border:1px solid var(--line);overflow:hidden;aspect-ratio:4/3}
.frame img{width:100%;height:100%;object-fit:cover;object-position:center 42%;display:block}
.frame.photo img{object-fit:contain;background:#fff}
figcaption{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--dim);
  padding-top:7px;text-transform:uppercase}
figcaption.now{color:var(--accent)}
figcaption em{font-style:normal;text-transform:none;letter-spacing:0;color:var(--dim)}
.untouched .frame{opacity:.72}
.readout{display:flex;gap:26px;flex-wrap:wrap;margin:16px 0 10px;font-family:var(--mono);font-size:13px}
.readout .lab{color:var(--dim);font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  margin-right:8px}
.dims b{color:var(--dim);font-weight:400;padding:0 6px}
.dims i{font-style:normal;font-size:11px;opacity:.8}
.dims .good{color:var(--good)}.dims .warn{color:var(--warn)}.dims .bad{color:var(--bad)}
.dims .na{color:var(--dim);opacity:.6}
.unit{color:var(--dim);font-size:11px}
.note{font-family:var(--serif);font-size:16px;line-height:1.55;color:var(--dim);
  max-width:70ch;margin:0}
.note code{font-size:.85em}

.caveat{border-left:2px solid var(--warn);padding:2px 0 2px 16px;margin:34px 0 0}
.caveat p{margin:0;font-family:var(--serif);color:var(--dim)}
.caveat strong{color:var(--ink);font-weight:600}
footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);
  font-family:var(--mono);font-size:11px;color:var(--dim);letter-spacing:.05em;
  display:flex;gap:20px;flex-wrap:wrap}
</style>

<div class="wrap">
  <p class="eyebrow">Packrig · eval run 2 · Apidura, 70 products</p>
  <h1>Every bag was round. Almost none of them are.</h1>
  <p class="standfirst">The first human review of a single bag — the Apidura Expedition Saddle Pack — came back
  <em>“it sort of looks like the bag but not really. It's not really cylindrical. It's not flat bits sewn together.”</em></p>
  <p class="standfirst">That one sentence held a catalogue-wide bug. Of the 699 product records carrying a
  <code>geometry.crossSection</code>, only <strong>97</strong> say <code>round</code>. The other 602 say
  rounded&nbsp;rect, flat&nbsp;back, d&nbsp;shape, flat&nbsp;bottom, oval or teardrop — and every one of them was
  being drawn with <code>LatheGeometry</code>, a solid of revolution. The field was recorded from the maker's own
  photographs and the geometry never read it.</p>

  <hr class="rule">

  <div class="summary">
    <div>
      <h2>What changed</h2>
      <p class="prose">A shared lofted-panel body now sweeps the <em>recorded</em> cross-section along the bag,
      with straight panel runs, tight corners and piping down each seam. Two builders adopted it: the seat pack
      (78 products catalogue-wide) and the down tube pack (12). The remaining eleven are unchanged, which is why
      most of this run is byte-identical to the baseline.</p>
      <p class="prose">Gate checks are programmatic and free — does the bag intersect the frame, does it clear
      the tyre, does it actually touch what it mounts to, is it the size its maker publishes. They run on all 70
      products every time.</p>
    </div>
    <table>
      <caption>Gates passed, 70 items</caption>
      <thead><tr><th>check</th><th class="num">baseline</th><th class="num">panels-v2</th><th class="num">Δ</th></tr></thead>
      <tbody>${gateRows}</tbody>
    </table>
  </div>

  <hr class="rule">
  <h2>Specimens</h2>
${rows}

  <div class="caveat">
    <p><strong>One regression, caused deliberately.</strong> Seat packs got the shape right and the size slightly
    wrong: mean height error moved from +7% to +26%. Making the bag deepest at the nose, as the record describes it,
    overshoots the published 16 cm. Shape was the larger error, so the trade stands — but it needs tightening, and
    it is recorded here rather than averaged away.</p>
  </div>

  <footer>
    <span>set apidura-v1 · frozen · 70 items · 116 reference photographs</span>
    <span>baseline 13m06s · panels-v2 09m51s</span>
    <span>1 of 70 human-scored</span>
  </footer>
</div>`);

console.log('wrote', out, (readFileSync(out).length / 1048576).toFixed(1), 'MB');
