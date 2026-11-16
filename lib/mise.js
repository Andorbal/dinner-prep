// Mise en place: everything to pull out and measure before prep starts.
// Ingredients are listed per recipe (two recipes that both need chili powder
// get two lines, so each can be measured into its own bowl), then the gear,
// then the containers, bags and labels from the pack list.
import { ingredientText, componentQtyText, componentFactor, cap } from './text.js';
import { packingNeeds } from './portions.js';

function scaleLine(l, f) {
  return { ...l, qty: l.qty * f, alt: l.alt && { ...l.alt, qty: l.alt.qty * f } };
}

const toolRef = (t) => (typeof t === 'string' ? { item: t } : t);

export function buildMise(data, plan, sheet, ledgerWeek) {
  const C = data.components;
  const E = data.equipment || {};
  const groups = [];
  const gear = new Map();
  const addGear = (t, times, forName) => {
    const e = E[t.item];
    if (!e || e.fixed) return;
    const qty = (t.qty || 1) * (t.per_batch ? times : 1);
    const g = gear.get(t.item) || { id: t.item, name: e.name, kind: e.kind, qty: 0, for: [] };
    // Pans and bowls are busy at the same time, so they add up; a whisk can be rinsed.
    g.qty = e.kind === 'cookware' || e.kind === 'storage' ? g.qty + qty : Math.max(g.qty, qty);
    g.for.push(forName);
    if (t.note) g.note = t.note;
    gear.set(t.item, g);
  };

  // Batches in the order the timeline first mentions them, then any others.
  const order = [];
  for (const t of plan.prep?.timeline || []) {
    const text = `${t.text || ''} ${(t.steps || []).join(' ')}`;
    const refs = [...(t.makes || []), ...[...text.matchAll(/\{([a-z0-9-]+)/g)].map((x) => x[1])];
    for (const m of refs) if (C[m] && !order.includes(m)) order.push(m);
  }
  const batches = [...(plan.prep?.batches || [])].sort((a, b) => {
    const ia = order.indexOf(a.component);
    const ib = order.indexOf(b.component);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  for (const b of batches) {
    const c = C[b.component];
    const items = [];
    for (const u of c.uses || []) {
      const sub = C[u.component];
      const q = componentFactor(sub, u.qty, u.unit) * sub.yield.qty * b.times;
      const thawed = (ledgerWeek?.thaw || []).some((t) => t.component === u.component);
      items.push({ kind: 'component', text: `${componentQtyText(sub, q)}${thawed ? ' (thawed from the freezer)' : ' (made earlier today)'}` });
    }
    for (const l of c.ingredients || []) items.push({ kind: 'ingredient', item: l.item, text: ingredientText(scaleLine(l, b.times), data.ingredients) });
    for (const t of c.tools || []) addGear(toolRef(t), b.times, c.name);
    groups.push({
      key: b.component,
      title: c.name,
      sub: `${b.times > 1 ? `${b.times} batches · ` : ''}makes ${componentQtyText(c, c.yield.qty * b.times)}`,
      items,
    });
  }

  // Produce to wash and cut.
  const produce = sheet.groups.filter((g) => g.kind === 'produce');
  if (produce.length) {
    groups.push({
      key: 'produce',
      title: 'Fruit and vegetables',
      sub: 'Washed and cut on prep day, one container per dinner',
      items: produce.map((g) => ({ kind: 'ingredient', item: g.id, text: `${g.name}: ${g.totalText}, for ${g.portions.length} ${g.portions.length === 1 ? 'dinner' : 'dinners'}` })),
    });
    for (const id of ['cutting-board', 'chef-knife', 'colander']) addGear({ item: id }, 1, 'Fruit and vegetables');
    if (produce.some((g) => g.portions.some((p) => /lb/.test(p.amount)))) addGear({ item: 'kitchen-scale' }, 1, 'Fruit and vegetables');
  }

  // Storage, from the pack list.
  const pack = packingNeeds(sheet);
  const storage = pack.map((p) => ({ kind: 'storage', text: `${p.n} × ${p.what}` }));
  if (pack.some((p) => /vacuum/.test(p.what))) addGear({ item: 'vacuum-sealer' }, 1, 'Freezer portions');
  storage.push({ kind: 'storage', text: cap(E.labels?.name || 'masking tape and a marker') });

  const kindOrder = { appliance: 0, cookware: 1, utensil: 2, storage: 3 };
  const gearList = [...gear.values()].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name));
  return {
    groups,
    gear: gearList.map((g) => ({ kind: 'tool', id: g.id, text: `${g.qty > 1 ? `${g.qty} × ` : ''}${g.name}${g.note ? ` (${g.note})` : ''}`, for: [...new Set(g.for)], note: g.note || null, gearKind: g.kind })),
    storage,
  };
}
