// Writes plan files in the same hand-friendly style as the seed plans.
const plain = (v) => typeof v === 'string' && /^[A-Za-z0-9][\w .\/'()-]*$/.test(v) && !/^(true|false|null|yes|no|on|off)$/i.test(v) && !/: /.test(v);
const scalar = (v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : plain(v) ? v : JSON.stringify(v));
const flow = (o) => `{ ${Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${typeof v === 'object' ? flow(v) : scalar(v)}`).join(', ')} }`;

export function planToYaml(plan, header = []) {
  const L = [...header.map((h) => `# ${h}`), `week_of: ${plan.week_of}`, `cycle: ${plan.cycle}`, '', 'prep:', '  batches:'];
  for (const b of plan.prep.batches) L.push(`    - ${flow(b)}`);
  if (plan.prep.timeline?.length) {
    L.push('  timeline:');
    for (const t of plan.prep.timeline) {
      L.push(`    - at: ${JSON.stringify(t.at)}`);
      if (t.title) L.push(`      title: ${scalar(t.title)}`);
      L.push(`      text: ${scalar(t.text)}`);
    }
  }
  L.push('', 'dinners:');
  for (const [d, v] of Object.entries(plan.dinners)) L.push(`  ${d}: ${flow(v)}`);
  if (plan.extras?.length) {
    L.push('', 'extras:');
    for (const e of plan.extras) L.push(`  - ${flow(e)}`);
  }
  if (plan.notes?.length) {
    L.push('', 'notes:');
    for (const n of plan.notes) L.push(`  - ${scalar(n)}`);
  }
  return `${L.join('\n')}\n`;
}
