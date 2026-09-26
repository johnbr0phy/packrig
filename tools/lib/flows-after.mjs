// The four tasks, walked through the redesigned UI. Same tasks, same checks
// as flows-before.mjs, so the tap counts compare like for like.
const WANT = ['Tent', 'Sleeping mat', 'Stove & gas', 'Rain jacket'];

async function placed(c) {
  return c.eval(() => {
    const st = app.pack.state;
    return st.locker.items.map((i) => [st.resolved.get(i.uid)?.name, st.loadout.place[i.uid] || 'home']);
  });
}

/** Tap the best-fitting bag in the catalogue that is open. */
const firstBag = (c, what) => c.tap('.cat-row:not(.is-unfit)', null, `a ${what}`);

export const FLOWS = {
  // Pick a bike, three bags, tent + mat + stove + jacket, see where each
  // went and whether it fits, share it.
  firsttimer: {
    async run(c) {
      await c.tap('.pr-item', 'Build a rig');
      await c.tap('.mount-ring', 'Seat pack', 'the seat pack ring on the bike');
      await firstBag(c, 'seat pack');                 // moves on to the handlebar
      await firstBag(c, 'handlebar bag');             // moves on to the frame
      await firstBag(c, 'frame bag');
      await c.tap('.sheet-close', 'Done');
      for (const w of WANT) await c.tap('.rg-tile', w);
      await c.wait(() => app.pack.state.locker.items.length >= 6);
      await c.sleep(1200);
      // where each went, and whether it fits: on the bag rows and the tiles
      const seen = await c.eval(() => ({
        tiles: [...document.querySelectorAll('.rg-tile.on .rg-tile-at')].map((n) => n.textContent),
        wont: app.pack.state.warnings.filter((w) => w.kind === 'overflow' || w.kind === 'nobag').length,
        rows: [...document.querySelectorAll('.rg-bag')].map((r) => r.querySelector('.rg-bag-fill')?.textContent || ''),
      }));
      await c.tap('.rg-share', 'Share');
      await c.tap('.sheet-foot button', 'Copy link');
      const p = await placed(c);
      const home = p.filter(([, at]) => at === 'home');
      const bags = await c.eval(() => Object.keys(app.bags.equipped).length);
      const copied = await c.eval(() => document.querySelector('.sheet-foot button')?.textContent);
      return {
        ok: !home.length && !seen.wont && bags >= 3 && /copied/i.test(copied || ''),
        summary: `${bags} bags; ${p.map(([n, at]) => `${n} → ${at}`).join(', ')}; tiles say: ${seen.tiles.join(' / ')}`,
      };
    },
  },
  // Build a rig from nothing: four bags, then name it.
  build: {
    async run(c) {
      await c.tap('.pr-item', 'Build a rig');
      await c.tap('.mount-ring', 'Seat pack', 'the seat pack ring');
      await firstBag(c, 'seat pack');
      await firstBag(c, 'handlebar bag');
      await firstBag(c, 'frame bag');
      await firstBag(c, 'top tube bag');
      await c.tap('.sheet-close', 'Done');
      await c.tap('.rg-name', null, 'the rig name, to rename it');
      await c.type('.rg-name-in', 'Highland overnighter', 'type a name');
      await c.key('Enter');
      const r = await c.eval(() => ({ bags: Object.keys(app.bags.equipped), name: document.querySelector('.rg-name')?.textContent }));
      return { ok: r.bags.length === 4 && r.name === 'Highland overnighter', summary: `${r.bags.join(', ')} · "${r.name}"` };
    },
  },
  // Import my spreadsheet and find the heaviest bag.
  import: {
    async run(c) {
      await c.tap('.pr-item', 'Pack my kit');
      await c.tap('.sheet button', 'Paste a spreadsheet');
      await c.type('textarea', c.sheet, 'paste the spreadsheet');
      await c.tap('.sheet-foot button, .pkg-import button', 'Import');
      await c.sleep(1500);
      await c.tap('.panel button', 'your list uses', 'fit the bags the sheet names');
      await c.sleep(2500);
      // the heaviest bag, read off the rows the way a person would
      const r = await c.eval(() => {
        const rows = [...document.querySelectorAll('.rg-bag')].map((row) => {
          const t = row.querySelector('.rg-bag-fill')?.textContent || '';
          const m = /([\d.]+)\s*(kg|g)/.exec(t);
          const g = m ? parseFloat(m[1]) * (m[2] === 'kg' ? 1000 : 1) : 0;
          return { slot: row.dataset.slot, g };
        }).sort((a, b) => b.g - a.g);
        const st = app.pack.state;
        const truth = Object.entries(st.results).map(([s, x]) => [s, x.fill.kg]).sort((a, b) => b[1] - a[1])[0];
        return { top: rows[0], truth, n: rows.length, orphans: st.warnings.filter((w) => w.kind === 'nobag').length, items: st.locker.items.length };
      });
      return { ok: r.top?.slot === r.truth?.[0] && !r.orphans, summary: `${r.items} items, ${r.n} bags; heaviest on screen: ${r.top?.slot} (${r.top?.g} g); solver says ${r.truth?.[0]}` };
    },
  },
  // Open a shared link signed out, copy the kit.
  shared: {
    async url() {
      const fs = await import('node:fs');
      return 'http://localhost:8735/?r=2.' + fs.readFileSync(new URL('./shared-link.txt', import.meta.url), 'utf8').trim().split('?r=2.')[1];
    },
    async run(c) {
      await c.tap('.rg-body button', 'Copy to my kit');
      const r = await c.eval(() => ({ mine: app.pack.state.mine, n: app.pack.lib.locker.items.length }));
      return { ok: r.mine && r.n > 60, summary: `${r.n} items in my kit` };
    },
  },
  // Keyboard only: Tab, Enter, Escape. Build, a ring, fit a bag, open it.
  keyboard: {
    devices: ['desktop'],
    async run(c) {
      // the focused control (not the page) says this, in its text or its label
      const txt = () => ((a) => { const e = document.activeElement; if (!e || e === document.body || e.id === 'scene') return false; return e.textContent.trim().startsWith(a) || (e.getAttribute('aria-label') || '').startsWith(a) || (e.matches('button') && e.textContent.includes(a)); });
      await c.tabTo(txt(), 'Build a rig', 'Build a rig');
      const ring = await c.focusVisible();
      await c.key('Enter');
      await c.sleep(800);
      await c.tabTo(txt(), 'Seat pack:', 'the seat pack ring');
      await c.key('Enter');
      await c.sleep(1500);
      await c.tabTo(() => document.activeElement?.classList.contains('cat-row') && !document.activeElement.classList.contains('is-unfit'), null, 'a seat pack');
      await c.key('Enter', 'fit it');
      await c.sleep(800);
      await c.key('Escape', 'done adding');
      await c.sleep(800);
      await c.tabTo(() => document.activeElement?.classList.contains('rg-bag'), null, 'the seat pack row');
      await c.key('Enter', 'open it');
      await c.sleep(1200);
      const r = await c.eval(() => ({ bags: Object.keys(app.bags.equipped), open: app.sheets.isOpen, title: document.getElementById('sheet-title')?.textContent, focus: document.activeElement?.className }));
      await c.key('Escape', 'close it');
      const back = await c.eval(() => document.activeElement?.className || '');
      return { ok: r.bags.includes('seatpack') && r.open && ring, summary: `${r.bags.join(', ')}; sheet "${r.title}" opened with focus on .${r.focus}; after Escape focus is on .${back}; focus ring visible: ${ring}` };
    },
  },
};
