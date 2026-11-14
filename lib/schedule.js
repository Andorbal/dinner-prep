// Drafts a prep-day timeline from component steps. Hands-off steps (pressure
// cooking, baking) run alongside hands-on ones; gear has limited capacity.
// The output is a starting point the planner (or the Thursday agent) edits.

const pad = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export function draftTimeline(data, batches) {
  const cap = { oven: 2, stove: 3, 'instant-pot': 1, 'crock-pot': 1, 'air-fryer': 1, microwave: 1, ...(data.household.gear_capacity || {}) };
  const jobs = batches.map((b) => {
    const c = data.components[b.component];
    const scale = b.times > 1 ? 1 + 0.4 * (b.times - 1) : 1; // bigger batches take longer by hand
    return {
      id: b.component,
      name: c.name,
      times: b.times,
      deps: (c.uses || []).map((u) => u.component).filter((d) => batches.some((x) => x.component === d)),
      steps: c.steps.map((s) => ({ ...s, minutes: Math.round((s.minutes || 0) * (s.active ? scale : 1)) })),
      next: 0,
      readyAt: 0,
      done: false,
    };
  });
  const remaining = (j) => j.steps.slice(j.next).reduce((a, s) => a + s.minutes, 0);
  const inUse = {}; // gear -> [endTimes]
  let oven = { temp: null, until: 0 }; // the oven holds one temperature at a time
  // Oven temperatures only (ignore "165°F inside").
  const tempOf = (step) => [...step.text.matchAll(/(\d{3})°F/g)].map((m) => Number(m[1])).find((n) => n >= 250) || null;
  let handsFreeAt = 0;
  const events = [];
  let t = 0;
  for (let guard = 0; guard < 2000 && jobs.some((j) => !j.done); guard++) {
    const ready = jobs
      .filter((j) => !j.done && j.readyAt <= t && j.deps.every((d) => jobs.find((x) => x.id === d)?.done))
      .sort((a, b) => remaining(b) - remaining(a));
    let started = false;
    for (const j of ready) {
      const s = j.steps[j.next];
      if (s.active && handsFreeAt > t) continue;
      const gear = s.gear || [];
      if (gear.some((g) => (inUse[g] || []).filter((e) => e > t).length >= (cap[g] ?? 1))) continue;
      const temp = gear.includes('oven') ? tempOf(s) || j.ovenTemp || null : null;
      if (temp) j.ovenTemp = temp;
      if (temp && oven.temp && oven.temp !== temp && oven.until > t) continue;
      // A job keeps its own gear between consecutive steps.
      const end = t + s.minutes;
      for (const g of gear) inUse[g] = [...(inUse[g] || []).filter((e) => e > t), end];
      if (s.active) handsFreeAt = end;
      if (gear.includes('oven')) {
        // Preheating holds the oven (and its temperature) through the job's last bake.
        let last = j.next;
        j.steps.forEach((x, i) => { if (x.gear?.includes('oven')) last = i; });
        const holdUntil = end + j.steps.slice(j.next + 1, last + 1).reduce((a, x) => a + x.minutes, 0);
        oven = { temp: temp || oven.temp, until: Math.max(oven.until, holdUntil) };
      }
      events.push({ at: t, job: j, step: s });
      j.next += 1;
      j.readyAt = end;
      if (j.next >= j.steps.length) {
        j.done = true;
        j.doneAt = end;
      }
      started = true;
      break;
    }
    if (!started) {
      const times = [handsFreeAt, ...jobs.filter((j) => !j.done).map((j) => j.readyAt), ...Object.values(inUse).flat()].filter((x) => x > t);
      if (!times.length) {
        // Blocked on a dependency that never finishes: bail out.
        break;
      }
      t = Math.min(...times);
    }
  }
  // Mark when dependency jobs finished (so dependents could start).
  for (const j of jobs) if (!j.done) j.doneAt = j.readyAt;
  const total = Math.max(0, ...jobs.map((j) => j.doneAt || 0));
  const timeline = events.map((e) => ({
    at: pad(e.at),
    title: `${e.job.name}${e.job.times > 1 ? ` ×${e.job.times}` : ''}`,
    text: e.step.text,
  }));
  return { timeline, minutes: total };
}
