# Roadmap

Things we'd like eventually, but not yet.

## Live sync between devices during prep

Prep mode keeps each device's progress (steps in progress and done, ticked checklists, the pack
list) in that browser only. GitHub Pages is static, and browsers on the same Wi-Fi can't talk to
each other directly without a server to introduce them, so today devices sync by hand: "Share
progress" sends a link carrying one device's progress, and opening it merges it in.

If that gets to be a pain, build a small sync server:

- A tiny service (a Cloudflare Worker with a Durable Object, or a small Node server on the home
  network) holding one document per prep day: `{ steps: {id: state, by}, ticks: {...} }`.
- Prep mode connects over a WebSocket (or polls every few seconds) and merges updates, using the same
  merge rule as the share link: done beats working beats nothing; ticks are a union.
- With live sync, steps can be **claimed by a person**: "B is on step 4", so parallel tracks (a grown-up
  on the Instant Pot, a kid on egg bites) show up on everyone's screen, and each device can filter to "my steps".
- Keep it household-only: a shared secret in the URL fragment is enough. No accounts, no names (members are A–D).

The client side is already shaped for this: progress is one small JSON object per week
(`prep:<week>` in localStorage), and the merge logic lives in `site/assets/js/prep-mode.js`.

## Other ideas

- Timers on steps ("start an 18-minute timer") that keep running when the screen locks.
- A per-person view for multiple prep tracks, once live sync exists.
