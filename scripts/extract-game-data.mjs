// Builds src/data/game-data.json and src/data/icons.json from the
// Anno1800Calculator params file (MIT, see THIRD_PARTY_NOTICES.md).
// Scope: base game only — every entity tagged with a DLC is dropped.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC_DIR = path.join(ROOT, '.data-src');
const PARAMS = path.join(SRC_DIR, 'params.js');
const PARAMS_URL = 'https://raw.githubusercontent.com/NiHoel/Anno1800Calculator/master/js/params.js';
const OUT_DIR = path.join(ROOT, 'src', 'data');

const OLD_WORLD = 5000000;
const NEW_WORLD = 5000001;
const REGIONS = new Set([OLD_WORLD, NEW_WORLD]);

// The High Life skyscraper services and their supply goods carry no DLC tag
// in the source, so they are identified by their guid range instead.
const isHighLifeNeed = (guid) => guid >= 135000 && guid < 136000;

async function loadParams() {
  if (!fs.existsSync(PARAMS)) {
    fs.mkdirSync(SRC_DIR, { recursive: true });
    const res = await fetch(PARAMS_URL);
    if (!res.ok) throw new Error(`fetch ${PARAMS_URL}: ${res.status}`);
    fs.writeFileSync(PARAMS, await res.text());
  }
  const window = {};
  new Function('window', fs.readFileSync(PARAMS, 'utf8'))(window);
  return window.params;
}

const en = (x) => x?.locaText?.english ?? x?.name;
const hasDlc = (x) => Array.isArray(x?.dlcs) && x.dlcs.length > 0;

const p = await loadParams();
const productById = new Map(p.products.map((x) => [x.guid, x]));
const usedProducts = new Set();
const usedIcons = new Set();
const icon = (x) => {
  if (x?.iconPath && p.icons[x.iconPath]) usedIcons.add(x.iconPath);
  return x?.iconPath ?? null;
};

const workforceTypes = p.workforce.filter((w) => !hasDlc(w)).map((w) => w.guid);
const workforceSet = new Set(workforceTypes);

const factories = p.factories
  .filter((f) => !hasDlc(f) && REGIONS.has(f.region) && f.tpmin > 0)
  .filter((f) => (f.outputs ?? []).length > 0)
  .filter((f) => (f.outputs ?? []).every((o) => !hasDlc(productById.get(o.Product))))
  // Base-game production buildings all employ a workforce; the unflagged
  // DLC buildings (e.g. powered pastures) do not.
  .filter((f) => (f.maintenances ?? []).some((m) => workforceSet.has(m.Product)))
  .map((f) => {
    const inputs = (f.inputs ?? [])
      .filter((i) => i.Amount > 0 && !productById.get(i.Product)?.isAbstract)
      .map((i) => ({ product: i.Product, amount: i.Amount }));
    const outputs = f.outputs.map((o) => ({ product: o.Product, amount: o.Amount }));
    const wf = f.maintenances.find((m) => workforceSet.has(m.Product));
    [...inputs, ...outputs].forEach((x) => usedProducts.add(x.product));
    return {
      id: f.guid,
      name: en(f),
      region: f.region,
      icon: icon(f),
      tpmin: f.tpmin,
      inputs,
      outputs,
      workforce: { type: wf.Product, amount: wf.Amount },
    };
  });

const populationLevels = p.populationLevels
  .filter((l) => !hasDlc(l) && REGIONS.has(l.region))
  .map((l) => {
    const needs = l.needs
      .filter((n) => !hasDlc(n) && !hasDlc(productById.get(n.guid)) && !isHighLifeNeed(n.guid))
      .map((n) => {
        usedProducts.add(n.guid);
        const unlock = n.unlockCondition;
        return {
          product: n.guid,
          tpmin: n.tpmin > 0 ? n.tpmin : null,
          residents: n.residents ?? 0,
          unlockAt: unlock && unlock.populationLevel === l.guid ? unlock.amount : null,
          bonus: n.isBonusNeed === 1,
        };
      });
    return { id: l.guid, name: en(l), region: l.region, icon: icon(l), fullHouse: l.fullHouse, needs };
  });

const levelByWorkforceName = (w) =>
  populationLevels.find((l) => en(w).startsWith(l.name.replace(/s$/, '')));
const workforce = p.workforce
  .filter((w) => workforceSet.has(w.guid))
  .map((w) => ({ id: w.guid, name: en(w), icon: icon(w), populationLevel: levelByWorkforceName(w)?.id ?? null }))
  .filter((w) => w.populationLevel !== null);

const products = [...usedProducts]
  .map((id) => productById.get(id))
  .map((x) => ({ id: x.guid, name: en(x), icon: icon(x) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const regions = p.regions.filter((r) => REGIONS.has(r.guid)).map((r) => ({ id: r.guid, name: en(r), icon: icon(r) }));
const sessions = p.sessions
  .filter((s) => !hasDlc(s) && REGIONS.has(s.region))
  .map((s) => ({ id: s.guid, name: en(s), region: s.region, icon: icon(s) }));

const data = { regions, sessions, workforce, populationLevels, factories, products };
const icons = Object.fromEntries([...usedIcons].sort().map((k) => [k, p.icons[k]]));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'game-data.json'), JSON.stringify(data, null, 1) + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'icons.json'), JSON.stringify(icons) + '\n');
console.log(
  `regions ${regions.length}, sessions ${sessions.length}, levels ${populationLevels.length}, ` +
    `factories ${factories.length}, products ${products.length}, workforce ${workforce.length}, icons ${usedIcons.size}`,
);
