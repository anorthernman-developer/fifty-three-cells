/* Fifty-Three Cells: the instrument (Manifesto Machines tool 79, live edition).
   live-visuals hooks: the sequencer logs what it schedules so the visuals land on time.
   p = pulse, n = a player's note [player, semitones, seconds], b = bar (8 eighths), c = cell change [player, cell], u = unison, x = the ending starts, f = finished */
const EFX = { q: [], ev(type, T, x) { this.q.push([type, T, x]); if (this.q.length > 600) this.q.splice(0, 300); } };
const st = MMX.bind({ pulseLvl: 0.5, players: 8, stayMin: 3, stayMax: 9, spread: 3, dropout: 0.12, shift: 0.15, augment: 0.06, octaves: 0.5, dyn: 0.5, pulse: true, seed: 1964, enter: 2 });
let cells = [], P = [], cv, edit = 0, ending = 0, endT = 0, unisonFlash = 0, hits = [], count = 0, finished = false;
const TAU = Math.PI * 2;
/* ---------- 53 cells written by this tool, on In C's broad harmonic path ---------- */
function writeCells(seed) { const r = MM.rng(seed), out = [];
  const pools = [[0, 4, 7, 5, 2], [0, 4, 5, 7, 2, 9], [7, 6, 4, 2, 11, 9, 12], [7, 11, 2, 6, 9, 12, 14], [0, 4, 7, 12, 9, 5], [5, 10, 7, 0, 3, 12, 8], [7, 10, 5, 12, 3, 2]];
  for (let k = 0; k < 53; k++) { const area = k < 8 ? 0 : k < 14 ? 1 : k < 22 ? 2 : k < 30 ? 3 : k < 38 ? 4 : k < 47 ? 5 : 6, pool = pools[area], n = 1 + Math.floor(r() * (area === 4 ? 3 : 5)), long = area === 4 || area === 2 && r() < 0.3, c = [];
    if (r() < 0.25) c.push([null, 1 + Math.floor(r() * 3)]);
    for (let j = 0; j < n; j++) c.push([pool[Math.floor(r() * pool.length)], long ? 2 + Math.floor(r() * 6) : r() < 0.6 ? 1 : 2]);
    if (r() < 0.2) c.push([null, 1 + Math.floor(r() * 2)]); if (k === 52) { c.length = 0; c.push([10, 1], [7, 1], [10, 1], [7, 1]); } out.push(c); }
  out[0] = [[0, 1], [4, 3]].slice(0); return out; }
const cellLen = (c) => c.reduce((s, x) => s + x[1], 0);
function cellText(c) { return c.map(([p, d]) => (p == null ? '-' : p) + ':' + d).join(' '); }
function parseCell(s) { const c = []; s.trim().split(/\s+/).forEach((w) => { const m = w.match(/^(-|[+-]?\d+)(?::(\d+))?$/); if (m) c.push([m[1] === '-' ? null : MM.clamp(+m[1], -24, 24), MM.clamp(+(m[2] || 1), 1, 16)]); }); return c.length ? c : null; }
/* ---------- players ---------- */
function makePlayers() { const r = MM.rng(st.seed + 7); P = Array.from({ length: 12 }, (_, k) => ({ k, slot: 1 + (k % 7), cell: 0, idx: 0, wait: 0, reps: 0, target: 2, out: 0, aug: 1, oct: 0, pan: (r() * 2 - 1) * 0.8, ph: r() * TAU, rate: 0.03 + r() * 0.05, enter: k * st.enter * 8 + Math.floor(r() * 6), done: false, lit: 0 })); P.forEach(setOct); count = 0; ending = 0; finished = false; }
function setOct(p) { const r = Math.random(); p.oct = r < st.octaves * 0.3 ? -12 : r > 1 - st.octaves * 0.3 ? 12 : 0; }
const live = () => P.slice(0, st.players);
function step(i, t, sd) { if (count % 8 === 0) EFX.ev('b', t, Math.floor(count / 8)); count++; const T0 = t;
  if (st.pulse && !(finished && ending > 2)) { if (st.pulseLvl > 0.01) { MMX.fire(0, t, { semis: 12, gain: st.pulseLvl * (i % 2 ? 0.75 : 1), dur: sd * 0.8, pan: i % 2 ? 0.15 : -0.15 }); EFX.ev('p', t); hits.push({ k: -1, t: performance.now() + (t - MM.now) * 1000 }); } }
  const L = live(), minCell = Math.min(...L.filter((p) => !p.done).map((p) => p.cell).concat([52]));
  for (const p of L) { if (p.done || count < p.enter) continue; if (p.wait > 0) { p.wait--; continue; }
    const c = cells[p.cell];
    if (p.idx >= c.length) { p.idx = 0; p.reps++; // end of one repeat: decide what to do next
      if (ending && p.cell === 52 && p.reps > p.target + 2 && Math.random() < 0.25) { p.done = true; continue; }
      if (Math.random() < st.dropout && !ending) { p.out = 1 + Math.floor(Math.random() * 3); }
      if (p.reps >= p.target && p.cell < 52 && (p.cell + 1 - minCell) <= st.spread) { p.cell++; EFX.ev('c', T0, [p.k, p.cell]); p.reps = 0; p.target = st.stayMin + Math.floor(Math.random() * Math.max(1, st.stayMax - st.stayMin + 1)); p.aug = Math.random() < st.augment ? 2 : 1; if (Math.random() < 0.15) setOct(p); if (Math.random() < st.shift) { p.wait = 1 + Math.floor(Math.random() * 3); continue; } }
      if (p.out > 0) { p.out--; p.wait = cellLen(cells[p.cell]) * p.aug - 1; continue; } }
    const [pitch, d] = cells[p.cell][p.idx]; p.idx++; const dur = d * p.aug; p.wait = dur - 1; if (pitch == null) continue;
    const sw = Math.sin(performance.now() / 1000 * p.rate * TAU + p.ph), dynG = 1 - st.dyn * 0.45 + sw * st.dyn * 0.45, endG = ending ? Math.min(1.5, 1 + (MM.now - endT) / 30) : 1;
    MMX.fire(p.slot, T0, { semis: pitch + p.oct, dur: Math.min(sd * dur * 0.95, 3), gain: 0.45 * dynG * endG, pan: p.pan, fadeOut: 0.06 }); EFX.ev('n', T0, [p.k, pitch + p.oct, sd * dur]); p.lit = performance.now() + (T0 - MM.now) * 1000; }
  if (ending && L.every((p) => p.done)) { if (!finished) { finished = true; endT = MM.now; EFX.ev('f', MM.now); MM.toast('All players have stopped. The pulse ends last. Press 0 to begin again.'); } if (MM.now - endT > 4) { ending = 3; } }
  hits = hits.filter((h) => performance.now() - h.t < 400); }
function unison() { const L = live().filter((p) => !p.done), lead = Math.max(...L.map((p) => p.cell)); L.forEach((p) => { p.cell = lead; p.idx = 0; p.wait = 0; p.reps = 0; p.out = 0; p.aug = 1; p.enter = 0; }); unisonFlash = performance.now(); EFX.ev('u', MM.now, lead); MM.toast('Unison on cell ' + (lead + 1)); }
function end() { if (ending) return; ending = 1; endT = MM.now; EFX.ev('x', MM.now); live().forEach((p) => { p.enter = Math.min(p.enter, count); }); MM.toast('Ending: everyone moves on towards cell 53'); }
function restart() { makePlayers(); EFX.ev('u', MM.now, 0); MM.toast('From the top: cell 1'); }
function newCells() { MMX.setParam('seed', Math.floor(Math.random() * 99999)); cells = writeCells(st.seed); bumpCells(); syncEdit(); MM.toast('A new set of 53 cells from seed ' + st.seed); }
function syncEdit() { const e = MM.$('#cell'); if (e) e.value = cellText(cells[edit]); const n = MM.$('#cellno'); if (n) n.textContent = 'CELL ' + (edit + 1); }
// during the ending, the minimum spread pull is replaced by a push to 53
function endPush() { if (!ending) return; live().forEach((p) => { if (p.target > 2) p.target = 2; }); }
/* ---------- built-in timbres, all on C4 ---------- */
function mk(len, fn) { const c = MM.ctx, sr = c.sampleRate, B = c.createBuffer(1, (sr * len) | 0, sr), d = B.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) { d[i] = fn(i / sr); pk = Math.max(pk, Math.abs(d[i])); } for (let i = 0; i < d.length; i++) d[i] *= 0.8 / (pk || 1); return B; }
const C4 = 261.63, add = (pr, dk, len = 1.5, att = 300) => mk(len, (t) => pr.reduce((s, [h, g, k]) => s + Math.sin(TAU * C4 * h * t) * g * Math.exp(-t * (dk + (k || 0))), 0) * Math.min(1, t * att));
function wind(odd, br) { return mk(1.5, (t) => { let s = 0; for (let h = 1; h < 12; h++) if (!odd || h % 2) s += Math.sin(TAU * C4 * h * t * (1 + 0.003 * Math.sin(TAU * 5 * t))) / Math.pow(h, br); return (s + (Math.random() - 0.5) * 0.04) * Math.min(1, t * 25) * Math.min(1, (1.5 - t) * 6); }); }
/* ---------- drawing: jazz-sleeve style, type as the picture ---------- */
function draw() { if (!cv.cv.offsetParent) return; cv.fit(); const g = cv.g, W = cv.w, H = cv.h, pn = performance.now(), L = live();
  g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, W, H);
  const fs = Math.min(H * 0.5, W * 0.42); g.font = `700 ${fs}px 'Oswald'`; g.fillStyle = pn - unisonFlash < 800 ? '#f29d1f' : '#f4f1ea'; g.textBaseline = 'alphabetic'; g.fillText('53', W - g.measureText('53').width * 0.82, fs * 0.84);
  g.fillStyle = '#2f6bff'; g.fillRect(0, fs * 0.9, W * 0.62, 6);
  g.font = "900 13px 'Libre Franklin'"; g.fillStyle = '#f4f1ea'; g.fillText(`FIFTY-THREE CELLS · THE RULES · ${L.length} PLAYERS · ${MM.bpm} BPM · SPREAD ${st.spread} · SEED ${st.seed}`, 18, 26);
  g.font = "400 11px 'Libre Franklin'"; g.fillStyle = 'rgba(244,241,234,.6)'; g.fillText(ending ? (finished ? 'THE PULSE ENDS LAST' : 'THE ENDING · TOWARDS 53') : 'DON’T HURRY · STAY WITHIN ' + st.spread + ' · DROP OUT AND LISTEN · MEET IN UNISON', 18, 42);
  // the strip of 53 cells
  const sy = fs * 0.9 + 22, sw = (W - 36) / 53; for (let k = 0; k < 53; k++) { const n = L.filter((p) => !p.done && p.cell === k && count >= p.enter).length; g.fillStyle = k === edit ? '#f29d1f' : n ? '#2f6bff' : 'rgba(244,241,234,.12)'; g.fillRect(18 + k * sw, sy, sw - 2, 18 + n * 5); if (k % 4 === 0 || k === 52) { g.fillStyle = 'rgba(244,241,234,.6)'; g.font = "400 9px 'Libre Franklin'"; g.fillText(k + 1, 18 + k * sw, sy - 4); } }
  // players: one bar each, a giant cropped cell number, and the cell as blocks
  const top = sy + 52, rh = Math.max(14, (H - top - 14) / Math.max(1, L.length));
  L.forEach((p, r) => { const y = top + r * rh, on = pn - p.lit < 160 && pn >= p.lit, c = cells[p.cell], len = cellLen(c) * p.aug, waiting = count < p.enter;
    g.fillStyle = on ? '#f29d1f' : p.done || waiting ? '#1a1a1a' : p.out ? '#141c33' : '#f4f1ea'; g.fillRect(18, y, 120, rh - 3);
    g.fillStyle = on ? '#0b0b0b' : p.done || waiting ? '#444' : '#0b0b0b'; g.font = `700 ${Math.min(rh * 0.95, 60)}px 'Oswald'`; g.fillText(String(p.cell + 1).padStart(2, '0'), 24, y + rh - 6);
    g.font = "600 10px 'Libre Franklin'"; g.fillStyle = '#f4f1ea'; const nm = MMX.isUser(p.slot) ? MMX.S.slots[p.slot].name.slice(0, 16) : MMX.S.slots[p.slot]?.label || ''; g.fillText(`${(p.k + 1 + '').padStart(2, '0')} · ${nm.toUpperCase()} ${p.oct ? (p.oct > 0 ? '+8VA' : '-8VA') : ''}${p.aug > 1 ? ' · AUG' : ''}${p.out ? ' · RESTING' : ''}${waiting ? ' · WAITING TO ENTER' : ''}${p.done ? ' · FINISHED' : ''}  ×${p.reps}`, 148, y + 11);
    let x = 148; const u = Math.min(22, (W - 170) / Math.max(8, len)); c.forEach(([pt, d], j) => { const w = d * p.aug * u - 2; if (pt != null) { g.fillStyle = j === p.idx - 1 && on ? '#f29d1f' : '#2f6bff'; g.fillRect(x, y + rh - 6 - ((pt + 12) / 40) * (rh - 18), w, Math.max(3, rh * 0.18)); } x += d * p.aug * u; }); }); }
/* ---------- for the live visuals ---------- */
let cellsVer = 0; const bumpCells = () => { cellsVer++; };
function secName() { if (!MM.playing) return 'stopped'; if (ending) return finished ? 'finished' : 'ending'; if (performance.now() - unisonFlash < 4000) return 'unison'; return live().some((p) => count < p.enter) ? 'entering' : 'playing'; }
/* ---------- setup ---------- */
const cfg = { bpm: 112, div: 2, step, draw, tick: endPush, start: () => { makePlayers(); }, onSamples: (list) => MMX.assign(list),
  key: (e) => { if (MMX.key(e)) return; const k = e.key.toLowerCase(); if (k === 'u') unison(); else if (k === 'e') end(); else if (k === 'n') newCells(); else if (k === '0') restart(); else if (k === 'p') MMX.setParam('pulse', !st.pulse); else if (k === '+' || k === '=') MMX.setParam('players', Math.min(12, st.players + 1)); else if (k === '-') MMX.setParam('players', Math.max(2, st.players - 1)); else if (k === 'arrowright') { edit = Math.min(52, edit + 1); syncEdit(); } else if (k === 'arrowleft') { edit = Math.max(0, edit - 1); syncEdit(); } },
  setup() { MM.ensure(); cv = MM.canvas('#cv'); cells = writeCells(st.seed); makePlayers();
    Object.assign(MM.fb, { pulseC: add([[1, 1, 0], [2, 0.5, 2], [3, 0.25, 4], [4, 0.2, 6]], 5, 0.6, 600), marimba: add([[1, 1, 0], [4, 0.35, 8], [9.9, 0.08, 20]], 4, 1.2, 800), vibes: mk(2, (t) => (Math.sin(TAU * C4 * t) + 0.3 * Math.sin(TAU * C4 * 4 * t) * Math.exp(-t * 4)) * Math.exp(-t * 1.6) * (1 + 0.35 * Math.sin(TAU * 5.5 * t)) * Math.min(1, t * 500)), organ: mk(1.5, (t) => [1, 2, 3, 4, 8].reduce((s, h, j) => s + Math.sin(TAU * C4 * h * t) / (j + 1), 0) * Math.min(1, t * 60) * Math.min(1, (1.5 - t) * 8)), reed: wind(true, 1), flute: mk(1.5, (t) => (Math.sin(TAU * C4 * 2 * t) + 0.15 * Math.sin(TAU * C4 * 4 * t) + (Math.random() - 0.5) * 0.08) * Math.min(1, t * 18) * Math.min(1, (1.5 - t) * 6)), bowed: wind(false, 1.3), epiano: add([[1, 1, 0], [2, 0.3, 1], [7, 0.15, 12], [1.005, 0.4, 0]], 1.7, 2, 700) });
    MMX.init({ state: st, slots: [{ label: 'Pulse (high C)', kind: 'pulseC', rv: 0.08 }, { label: 'Player timbre 1 (C4)', kind: 'marimba', rv: 0.15 }, { label: 'Timbre 2', kind: 'vibes', rv: 0.2 }, { label: 'Timbre 3', kind: 'organ', rv: 0.15, gain: 0.7 }, { label: 'Timbre 4', kind: 'reed', rv: 0.15, gain: 0.7 }, { label: 'Timbre 5', kind: 'flute', rv: 0.2, gain: 0.8 }, { label: 'Timbre 6', kind: 'bowed', rv: 0.2, gain: 0.6, pitch: -12 }, { label: 'Timbre 7', kind: 'epiano', rv: 0.15 }],
      onSlot: (i) => { if (i === 0 && MM.playing) return; MMX.fire(i, MM.now + 0.03, { maxDur: 2 }); }, onPreset: () => { cells = writeCells(st.seed); bumpCells(); syncEdit(); }, factory: fac(),
      extra: { get: () => ({ cells }), set: (x) => { if (x && Array.isArray(x.cells) && x.cells.length === 53) { cells = x.cells; bumpCells(); syncEdit(); } } },
      keys: [['U', 'unison on the leading cell'], ['E', 'the ending'], ['N', 'write 53 new cells'], ['0', 'restart from cell 1'], ['P', 'pulse on or off'], ['+ / -', 'more or fewer players'], ['← →', 'choose a cell to edit'], ['Shift+1 to 8', 'visuals: choose a scene'], ['[ and ]', 'visuals: previous / next scene'], ['C', 'visuals: auto-cycle scenes on or off'], ['T', 'visuals: next theme'], ['J', 'visuals: next message'], ['K', 'visuals: blackout'], ['F', 'visuals: freeze'], ['O', 'open the output window (projector)'], ['G', 'layout: studio, split, visuals only'], ['Esc', 'leave visuals-only view']],
      midiHelp: 'Any note from C3 up plays along on the pulse sound (C4 = the pulse C). C2 (36) = unison, C#2 (37) = ending, D2 (38) = everyone moves on one cell.',
      midi: (n, v, on) => { if (window.EFL_midi && window.EFL_midi(n, v, on)) return; if (!on) return; if (n === 36) unison(); else if (n === 37) end(); else if (n === 38) { const lead = Math.max(...live().map((p) => p.cell)); live().forEach((p) => { if (p.cell < 52 && p.cell < lead + 1) { p.cell++; p.idx = 0; p.reps = 0; EFX.ev('c', MM.now, [p.k, p.cell]); } }); MM.toast('Everyone moves on one cell'); } else MMX.fire(0, MM.now + 0.005, { semis: n - 60, gain: v, dur: 0.6 }); } });
    const C = (id) => MM.$(id); MMX.ctl(C('#c0'), 'pulseLvl', { label: 'Pulse level', min: 0, max: 1.2 }); MMX.ctl(C('#c0'), 'pulse', { type: 'check', label: 'Pulse (P)' }); MMX.ctl(C('#c0'), 'players', { label: 'Players', min: 2, max: 12, step: 1 }); MMX.ctl(C('#c0'), 'enter', { label: 'Entries every', min: 0, max: 8, step: 1, fmt: (v) => v + ' bars' });
    MMX.ctl(C('#c1'), 'stayMin', { label: 'Stay at least', min: 1, max: 16, step: 1, fmt: (v) => v + '×' }); MMX.ctl(C('#c1'), 'stayMax', { label: 'Stay at most', min: 1, max: 32, step: 1, fmt: (v) => v + '×' }); MMX.ctl(C('#c1'), 'spread', { label: 'Spread', min: 1, max: 6, step: 1, hint: 'How many cells ahead of the slowest player anyone may go' }); MMX.ctl(C('#c1'), 'dropout', { label: 'Drop out', min: 0, max: 0.6 }); MMX.ctl(C('#c1'), 'shift', { label: 'Shift', min: 0, max: 0.8 }); MMX.ctl(C('#c1'), 'augment', { label: 'Augment', min: 0, max: 0.6 });
    MMX.ctl(C('#c2'), 'octaves', { label: 'Octave spread', min: 0, max: 1 }); MMX.ctl(C('#c2'), 'dyn', { label: 'Dynamics', min: 0, max: 1 }); MMX.ctl(C('#c2'), 'seed', { type: 'number', label: 'Cell seed', fmt: (v) => v, on: () => { cells = writeCells(st.seed); bumpCells(); syncEdit(); } });
    MM.$('#b-u').onclick = unison; MM.$('#b-e').onclick = end; MM.$('#b-n').onclick = newCells; MM.$('#b-r').onclick = restart; MM.$('#b-p').onclick = () => MMX.setParam('pulse', !st.pulse);
    MM.$('#cell').onchange = (e) => { const c = parseCell(e.target.value); if (c) { cells[edit] = c; bumpCells(); MM.toast('Cell ' + (edit + 1) + ' rewritten'); } else syncEdit(); }; MM.$('#b-prev').onclick = () => { edit = Math.max(0, edit - 1); syncEdit(); }; MM.$('#b-next').onclick = () => { edit = Math.min(52, edit + 1); syncEdit(); };
    MM.$('#b-hear').onclick = () => { MM.ensure(); let t = MM.now + 0.05; const sd = 30 / MM.bpm; cells[edit].forEach(([p, d]) => { if (p != null) MMX.fire(1, t, { semis: p, dur: sd * d * 0.95 }); t += sd * d; }); };
    MM.$('#cv').addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, fs = Math.min(cv.h * 0.5, cv.w * 0.42), sy = fs * 0.9 + 22; if (y > sy - 10 && y < sy + 80) { edit = MM.clamp(Math.floor((x - 18) / ((cv.w - 36) / 53)), 0, 52); syncEdit(); } });
    syncEdit(); } };
function fac() { const base = JSON.parse(JSON.stringify(st)), F = (o) => ({ full: { params: Object.assign({}, base, o) } });
  return { 'Eight players (default)': {}, 'Twelve, tightly together': F({ players: 12, spread: 2, stayMin: 4, stayMax: 8, enter: 1 }), 'Three, long stays': F({ players: 3, stayMin: 8, stayMax: 16, dropout: 0.05, pulseLvl: 0.8 }), 'Loose and shifting': F({ spread: 5, shift: 0.5, augment: 0.3, dropout: 0.25 }), 'No pulse': F({ pulse: false, dyn: 0.8, octaves: 0.8 }), 'Fast through': F({ stayMin: 1, stayMax: 3, enter: 0, players: 10 }) }; }
MM.init(cfg);

