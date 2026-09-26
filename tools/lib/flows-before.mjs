// The four tasks, walked through the UI as it was before the redesign
// (commit 26e6f3e). Kept so the tap counts in UX-WRITEUP.md can be re-run.
const WANT = ['Tent', 'Sleeping mat', 'Stove & gas', 'Rain jacket'];

async function placed(c) {
  return c.eval(() => {
    const st = app.pack.state;
    return st.locker.items.map((i) => [st.resolved.get(i.uid)?.name, st.loadout.place[i.uid] || 'home']);
  });
}

async function addBag(c, mount, first) {
  if (!first) await c.tap('.sheet-back', null, 'back to the mount list');
  await c.tap('.mount-btn', mount, `mount: ${mount}`);
  await c.tap('.card:not(.is-unfit)', null, `a ${mount.toLowerCase()}`);
}

export const FLOWS = {
  firsttimer: {
    async run(c) {
      await c.tap('.pr-item', 'Build a rig');
      await c.tap('.pr-setup-go', 'Start building');
      await addBag(c, 'Seat pack', true);
      await addBag(c, 'Handlebar roll');
      await addBag(c, 'Half frame bag');
      await c.tap('.sheet-close', null, 'close the catalogue');
      await c.tap('.pkg-tab', 'Gear');
      await c.tap('button', 'What are you bringing?');
      for (const w of WANT) await c.tap('.pkg-tile', w);
      await c.tap('.bs-btn.is-primary', 'Pack these');
      await c.wait(() => app.pack.state.locker.items.length >= 4);
      await c.sleep(1200);
      await c.tap('.pkg-share', 'Share this setup');
      const p = await placed(c);
      const home = p.filter(([, at]) => at === 'home');
      const shared = await c.eval(() => document.querySelector('.pkg-share')?.textContent);
      return { ok: !home.length && /copied/i.test(shared || ''), summary: p.map(([n, at]) => `${n} → ${at}`).join(', ') };
    },
  },
  build: {
    async run(c) {
      await c.tap('.pr-item', 'Build a rig');
      await c.tap('.pr-setup-go', 'Start building');
      await addBag(c, 'Seat pack', true);
      await addBag(c, 'Handlebar roll');
      await addBag(c, 'Half frame bag');
      await addBag(c, 'Top tube bag');
      await c.tap('.sheet-close', null, 'close the catalogue');
      await c.tap('.rn-title', null, 'the rig name, to rename it');
      await c.type('.rn-rename', 'Highland overnighter', 'type a name');
      await c.key('Enter');
      const r = await c.eval(() => ({ bags: Object.keys(app.bags.equipped), name: document.querySelector('.rn-title')?.textContent }));
      return { ok: r.bags.length === 4 && r.name === 'Highland overnighter', summary: `${r.bags.join(', ')} · "${r.name}"` };
    },
  },
  import: {
    async run(c) {
      await c.tap('.pr-item', 'Build a rig');
      await c.tap('.pr-setup-go', 'Start building');
      await c.tap('.sheet-close', null, 'close the mount list');
      await c.tap('.pkg-tab', 'Gear');
      await c.tap('button', 'Paste a spreadsheet');
      await c.type('textarea', c.sheet, 'paste the spreadsheet');
      await c.tap('button', 'Import');
      await c.sleep(1500);
      // The heaviest bag: read off what the panel shows per bag
      const r = await c.eval(() => {
        const st = app.pack.state;
        const orphans = st.warnings.filter((w) => w.kind === 'nobag').length;
        const bags = Object.keys(app.bags.equipped).length;
        return { orphans, bags, items: st.locker.items.length };
      });
      c.hesitate(`no bags on the bike: ${r.orphans} of ${r.items} things say their bag isn't there, and nothing offers to fit them`);
      return { ok: false, why: 'heaviest bag not findable: the sheet\'s bags are not on the bike', summary: `${r.items} items imported, ${r.bags} bags on the bike` };
    },
  },
  shared: {
    async url() {
      return 'http://localhost:8735/?r=2.' + (await (await import('node:fs')).promises.readFile(new URL('./shared-link.txt', import.meta.url), 'utf8')).trim().split('?r=2.')[1];
    },
    async run(c) {
      await c.tap('.pkg-tab', 'Gear');
      await c.tap('button', 'Copy to my locker');
      const r = await c.eval(() => ({ mine: app.pack.state.mine, n: app.pack.lib.locker.items.length }));
      return { ok: r.mine && r.n > 60, summary: `${r.n} items in my kit` };
    },
  },
};
