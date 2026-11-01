/* Fifty-Three Cells: the visuals engine.
   Used twice: by the controller (split-screen preview, visuals-only view) and by output.html (the projector window).
   It only draws. The controller owns the settings (V) and sends audio + ensemble frames (A); every renderer draws the same thing. */
(function () {
  const EV = ['p', 'n', 'b', 'c', 'u', 'x', 'f'], TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;

  const FONTS = [
    ['theme', 'Theme font'], ["'Oswald'", 'Oswald (condensed sleeve caps)'], ["'Libre Franklin'", 'Libre Franklin (grotesque)'], ["'Archivo'", 'Archivo (heavy grotesque)'], ["'Archivo Narrow'", 'Archivo Narrow (condensed)'], ["'Bebas Neue'", 'Bebas Neue (poster caps)'],
    ["'Space Grotesk'", 'Space Grotesk (techno)'], ["'Inter'", 'Inter (Swiss neutral)'], ["'Playfair Display'", 'Playfair Display (editorial serif)'],
    ["'IBM Plex Mono'", 'IBM Plex Mono (typewriter)'], ["'Space Mono'", 'Space Mono (retro mono)'], ['Georgia', 'Georgia (system serif)'], ['system-ui', 'System sans'], ['Impact', 'Impact (system poster)']];

  /* palettes + typography: each one a graphic design style, not a person */
  const THEMES = {
    sleeve: { name: 'Jazz sleeve (1950s–60s)', homage: 'Mid-century jazz record sleeves: huge cropped condensed type, black and white with one flat blue, orange for what sounds now', bg: '#0b0b0b', fg: '#f4f1ea', acc: '#f29d1f', acc2: '#2f6bff', acc3: '#f4f1ea', head: "'Oswald'", headW: 700, mono: "'Libre Franklin'", monoW: 600, upper: true },
    swiss: { name: 'Swiss grid', homage: 'Swiss International Style: the grid, objective sans-serif type, one red', bg: '#f4f1ea', fg: '#111111', acc: '#e30613', acc2: '#111111', acc3: '#9a9a9a', head: "'Inter'", headW: 800, mono: "'IBM Plex Mono'", upper: false },
    bauhaus: { name: 'Bauhaus primaries', homage: 'Bauhaus teaching: primary colours, circle, square and triangle', bg: '#efe6d2', fg: '#151515', acc: '#d6281b', acc2: '#1d4fa3', acc3: '#f2b705', head: "'Archivo'", headW: 800, mono: "'Space Mono'", upper: true },
    opart: { name: 'Op art', homage: '1960s optical art: black and white stripes and rings that seem to move, one red', bg: '#ffffff', fg: '#000000', acc: '#e4002b', acc2: '#000000', acc3: '#777777', head: "'Archivo'", headW: 900, mono: "'Space Mono'", upper: true },
    psych: { name: 'Psychedelic poster (1960s)', homage: '1960s concert posters: hot complementary colours, swelling lettering, light-show glow', bg: '#2a0f3d', fg: '#ffe066', acc: '#ff5ea8', acc2: '#4de1c1', acc3: '#ff8a3d', head: "'Bebas Neue'", headW: 400, mono: "'Space Mono'", upper: true },
    score: { name: 'Graphic score', homage: 'Graphic scores and process music: cream paper, ink, pencil red, everything plotted', bg: '#f2ecdc', fg: '#1d1a16', acc: '#c0392b', acc2: '#3d5a80', acc3: '#8c8273', head: "'Playfair Display'", headW: 900, mono: "'IBM Plex Mono'", upper: false },
    acid: { name: 'Acid rave', homage: '1990s rave flyers and techno sleeves: acid yellow, magenta, cyan, corporate parody', bg: '#0e0e0e', fg: '#e9ff2a', acc: '#ff2a8a', acc2: '#00e5ff', acc3: '#ffffff', head: "'Space Grotesk'", headW: 700, mono: "'Space Mono'", upper: true },
    minimal: { name: 'Monochrome minimal', homage: 'Post-punk sleeve minimalism: black, white, restraint, data as image', bg: '#000000', fg: '#ffffff', acc: '#ffffff', acc2: '#8a8a8a', acc3: '#444444', head: "'Archivo Narrow'", headW: 400, mono: "'IBM Plex Mono'", upper: false },
    grunge: { name: 'Grunge type', homage: '1990s magazine grunge: broken grids, torn type that refuses to sit still', bg: '#e9e4d8', fg: '#222222', acc: '#c1272d', acc2: '#555555', acc3: '#222222', head: "'Playfair Display'", headW: 900, mono: "'Space Mono'", upper: false, rough: true },
    brand: { name: 'Your brand', homage: 'Your own colours, font and logo (set them under BRAND)', bg: '#000000', fg: '#ffffff', acc: '#f29d1f', acc2: '#2f6bff', acc3: '#888888', head: "'Oswald'", headW: 700, mono: "'IBM Plex Mono'", upper: true }
  };
  /* harmonic-area moods: as the leading player moves through the 53 cells, the look moves with the harmony */
  const AREAS = ['C', 'C (wider)', 'towards G (F sharp)', 'G', 'long notes', 'B flat', 'the end'];
  const MOODS = ['sleeve', 'swiss', 'psych', 'opart', 'score', 'acid', 'minimal'];
  const areaOf = (k) => (k < 8 ? 0 : k < 14 ? 1 : k < 22 ? 2 : k < 30 ? 3 : k < 38 ? 4 : k < 47 ? 5 : 6);

  const SCENES = [
    { id: 'lanes', name: 'Player Lanes', homage: 'a scrolling roll for every player' },
    { id: 'strip', name: 'Cell Strip', homage: 'all 53 cells, players sitting on them', own: { head: true } },
    { id: 'pulse', name: 'Pulse', homage: 'op-art rings on the eighth notes', own: { plate: true } },
    { id: 'phase', name: 'Phase Wheel', homage: 'each player a ring, overlaps light up' },
    { id: 'score', name: 'Overlap Score', homage: 'a graphic score of who was where' },
    { id: 'bigtype', name: 'Big Type', homage: 'the leading cell, cropped like a sleeve', own: { head: true, msgs: true } },
    { id: 'signage', name: 'Signage', homage: 'station boards', own: { head: true, msgs: true } },
    { id: 'scope', name: 'Sample Scope', homage: 'your sample, start to end' }];

  function defaults() {
    return {
      scene: 'lanes', cycle: 'off', cycleSecs: 20, cycleBars: 16, cycleList: SCENES.map((s) => s.id), transition: 'fade',
      theme: 'sleeve', areaMoods: false, font: 'theme', caps: true, scopeSlot: 1,
      intensity: 0.8, speed: 1, react: 1, trails: 0.1, flash: 0.5, glitch: 0.15, grain: 0.1, textScale: 1,
      headline: 'CELL {cell}', showHead: true,
      artist: 'YOUR NAME', track: 'Fifty-Three Cells · {players} players · seed {seed}', showLower: true,
      ticker: 'FIFTY-THREE CELLS  ·  ONE PULSE  ·  {players} PLAYERS  ·  LEADING CELL {cell} OF 53  ·  {bpm} BPM IN {key}  ·  ', tickerSpeed: 1, showTicker: true,
      messages: "don't hurry\nstay close: within {spread} cells\ndrop out and listen\nmeet in unison\nthe pulse ends last", msgSecs: 6, msgOffset: 0, showMsgs: true,
      brandName: 'FIFTY-THREE CELLS', logo: '', logoPos: 'tr', showLogo: true, logoSize: 1, brandBg: '#000000', brandFg: '#ffffff', brandAcc: '#f29d1f', brandFont: "'Oswald'",
      blackout: false, freeze: false
    };
  }
  const emptyFrame = () => ({ e: 0, lo: 0, mid: 0, hi: 0, spec: new Array(48).fill(0), wave: new Array(96).fill(0), bar: 0, step: 0, sec: 'stopped', lead: 1, min: 1, spread: 3, players: 8, seed: 1964, bpm: 112, key: 'C', playing: false,
    n: { p: 0, n: 0, b: 0, c: 0, u: 0, x: 0, f: 0 }, np: new Array(12).fill(0), pc: new Array(12).fill(0), ps: new Array(12).fill(2), pr: new Array(12).fill(0), pa: new Array(12).fill(1), po: new Array(12).fill(0), pl: new Array(12).fill(''), nn: [], log: [], rs: 0, re: 1, smp: 'built-in', slot: 1 });

  function fillTokens(str, A, V) {
    const now = new Date();
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => {
      switch (k) {
        case 'cell': return String(A.lead); case 'min': return String(A.min); case 'cells': return '53'; case 'players': return String(A.players); case 'spread': return String(A.spread); case 'seed': return String(A.seed);
        case 'bpm': return String(Math.round(A.bpm)); case 'key': return A.key; case 'area': return AREAS[areaOf(A.lead - 1)];
        case 'section': return A.sec; case 'bar': return String(A.bar + 1);
        case 'time': return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); case 'date': return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        case 'artist': return V.artist; case 'brand': return V.brandName; case 'sample': return A.smp; default: return m;
      }
    });
  }

  function create(canvas, opts = {}) {
    const g = canvas.getContext('2d');
    const r = { cv: canvas, g, W: 1, H: 1, A: emptyFrame(), V: defaults(), t: 0, last: 0, env: { p: 0, n: 0, b: 0, c: 0, u: 0, x: 0, f: 0 }, pe: new Array(12).fill(0), cnt: null, pcnt: null, sceneId: null, trans: 0, snap: document.createElement('canvas'), frozen: false, bo: 0, logoImg: null, logoSrc: '', st: {}, ePeak: 0.15, peaks: [], cells: [], hist: [], track: [], trackT: 0 };
    const grain = document.createElement('canvas'); grain.width = grain.height = 192; { const gg = grain.getContext('2d'), id = gg.createImageData(192, 192); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } gg.putImageData(id, 0, 0); }

    r.setFrame = (A) => { if (A.nn && A.nn.length) { const t = performance.now(); A.nn.forEach(([k, s, d]) => r.hist.push({ k, s, d, t })); if (r.hist.length > 1500) r.hist.splice(0, r.hist.length - 1200); } r.A = Object.assign(r.A, A); r.A.nn = []; };
    r.setSettings = (V) => { const logo = r.V.logo; r.V = Object.assign(defaults(), V); if (V.logo === undefined) r.V.logo = logo; r.setLogo(r.V.logo); };
    r.setLogo = (src) => { r.V.logo = src || ''; if (src === r.logoSrc) return; r.logoSrc = src || ''; if (!src) { r.logoImg = null; return; } const im = new Image(); im.onload = () => (r.logoImg = im); im.src = src; };
    r.setPeaks = (p) => { r.peaks = p || []; };
    r.setCells = (c) => { if (Array.isArray(c)) r.cells = c; };

    function theme() {
      const V = r.V, A = r.A; let id = V.theme; if (V.areaMoods) id = MOODS[areaOf((A.lead || 1) - 1)];
      let T = Object.assign({}, THEMES[id] || THEMES.sleeve); if (id === 'brand') Object.assign(T, { bg: V.brandBg, fg: V.brandFg, acc: V.brandAcc, head: V.brandFont || T.head });
      if (V.font && V.font !== 'theme') T.head = V.font; T.id = id; return T;
    }
    const up = (T, s) => (T.upper && r.V.caps ? String(s).toUpperCase() : String(s));
    const font = (T, px, kind = 'head', w) => kind === 'mono' ? `${w || T.monoW || 500} ${px}px ${T.mono}, ui-monospace, monospace` : `${w || T.headW} ${px}px ${T.head}, system-ui, sans-serif`;
    function fitText(T, text, maxW, maxPx, w) { g.font = font(T, 100, 'head', w); const m = g.measureText(text).width || 1; return Math.max(8, Math.min(maxPx, 100 * maxW / m)); }
    function wrap(text, maxW) { const words = String(text).split(/\s+/), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
    function msgs() { return String(r.V.messages || '').split('\n').map((s) => s.trim()).filter(Boolean); }
    function msgIndex(n) { const secs = Math.max(1, +r.V.msgSecs || 6); const raw = Math.floor(Date.now() / 1000 / secs) + (r.V.msgOffset | 0); return { i: n ? ((raw % n) + n) % n : 0, p: (Date.now() / 1000 / secs) % 1, secs }; }
    function alpha(hex, a) { if (!hex || hex[0] !== '#') return hex; let h = hex.slice(1); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`; }
    const rnd = (seed) => { let a = (seed * 2654435761) >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; };
    const active = (A) => { const out = []; for (let k = 0; k < Math.min(12, A.players); k++) out.push(k); return out; };
    const pcol = (T, k) => [T.fg, T.acc2, T.acc, T.acc3][k % 4];
    const cellLen = (c) => (c || []).reduce((s, x) => s + x[1], 0) || 1;
    const stateTxt = (A, k) => ['', 'RESTING', 'WAITING', 'FINISHED'][A.ps[k]] || '';

    /* ---------------- scenes ---------------- */
    const D = {};
    // 1. one lane per player: notes scroll right to left like a piano roll, the cell number big at the left
    D.lanes = (T, A, V, E) => {
      const { W, H } = r, L = active(A), top = H * 0.16, bot = H * 0.05 + (V.showTicker ? H * 0.06 : 0) + (V.showLower ? H * 0.13 : 0), lh = (H - top - bot) / Math.max(1, L.length), gut = Math.min(W * 0.14, lh * 2.4 + 40), secs = 8 / Math.max(0.2, V.speed), now = performance.now(), pxs = (W - gut - 20) / secs;
      L.forEach((k, i) => { const y = top + i * lh, st = A.ps[k], lit = r.pe[k];
        g.fillStyle = st >= 2 ? alpha(T.fg, 0.06) : lit > 0.5 ? T.acc : st === 1 ? alpha(T.acc2, 0.35) : T.fg; g.fillRect(14, y + 1, gut - 22, lh - 3);
        g.fillStyle = lit > 0.5 ? T.bg : st >= 2 ? alpha(T.fg, 0.35) : T.bg; g.font = font(T, Math.min(lh * 0.92, 80)); g.textBaseline = 'alphabetic'; g.fillText(st === 2 ? '··' : String((A.pc[k] || 0) + 1).padStart(2, '0'), 20, y + lh - lh * 0.12);
        g.strokeStyle = alpha(T.fg, 0.12); g.lineWidth = 1; g.beginPath(); g.moveTo(gut, y + lh - 1); g.lineTo(W - 10, y + lh - 1); g.stroke();
        g.font = font(T, Math.max(9, Math.min(13, lh * 0.22)), 'mono'); g.fillStyle = alpha(T.fg, 0.6); g.fillText(up(T, `${String(k + 1).padStart(2, '0')} · ${A.pl[k] || ''}${A.po[k] ? (A.po[k] > 0 ? ' · +8VA' : ' · -8VA') : ''}${A.pa[k] > 1 ? ' · AUG' : ''} ${stateTxt(A, k)} ×${A.pr[k] || 0}`), gut + 6, y + Math.max(11, lh * 0.24)); });
      r.hist.forEach((nt) => { const i = L.indexOf(nt.k); if (i < 0) return; const age = (now - nt.t) / 1000, x = W - 14 - age * pxs, w = Math.max(3, nt.d * pxs - 2); if (x + w < gut) return; const y = top + i * lh, py = y + lh * 0.82 - ((nt.s + 24) / 60) * lh * 0.62, fresh = age < 0.15;
        g.fillStyle = fresh ? T.acc : pcol(T, nt.k); g.globalAlpha = fresh ? 1 : clamp(0.95 - age / secs * 0.5, 0.2, 1); g.fillRect(Math.max(gut, x), py, w - Math.max(0, gut - x), Math.max(3, lh * 0.14 * (1 + (fresh ? E.n * 0.5 * V.react : 0)))); }); g.globalAlpha = 1;
      g.fillStyle = T.acc; g.fillRect(W - 16, top, 3, H - top - bot);
      // pulse dots across the top
      for (let s = 0; s < 8; s++) { g.fillStyle = A.playing && s === A.step ? T.acc : alpha(T.fg, 0.25); g.fillRect(gut + s * (W - gut - 14) / 8, top - 12, (W - gut - 14) / 8 - 4, 4 + (s === A.step ? E.p * 6 * V.intensity : 0)); }
    };
    // 2. the 53 cells as tiles; the players sit on them, the spread band glows
    D.strip = (T, A, V, E) => {
      const { W, H } = r, cols = 11, rows = 5, x0 = W * 0.04, y0 = H * 0.2, tw = (W * 0.92) / cols, th = (H * (V.showTicker ? 0.66 : 0.72)) / rows, L = active(A), occ = new Array(53).fill(0).map(() => []);
      L.forEach((k) => { if (A.ps[k] !== 2 && A.ps[k] !== 3) occ[A.pc[k] || 0].push(k); });
      g.font = font(T, Math.min(H * 0.1, W * 0.06)); g.fillStyle = T.fg; g.textBaseline = 'alphabetic'; g.fillText(up(T, fillTokens(V.headline, A, V)), x0, H * 0.13); g.font = font(T, Math.max(10, H * 0.02), 'mono'); g.fillStyle = alpha(T.fg, 0.7); const cap = up(T, `${A.players} PLAYERS · SPREAD ${A.spread} · CELLS ${A.min} TO ${A.lead} · ${A.sec} · AREA: ${AREAS[areaOf(A.lead - 1)]}`); g.fillText(cap, W - x0 - g.measureText(cap).width, H * 0.13);
      for (let c = 0; c < 53; c++) { const i = c % cols, j = Math.floor(c / cols), x = x0 + i * tw, y = y0 + j * th, band = c >= A.min - 1 && c <= A.lead - 1, n = occ[c].length, hot = occ[c].some((k) => r.pe[k] > 0.5);
        g.fillStyle = n ? (hot ? T.acc : T.acc2) : band ? alpha(T.fg, 0.14) : alpha(T.fg, 0.05); g.fillRect(x + 2, y + 2, tw - 4, th - 4);
        g.fillStyle = n ? T.bg : alpha(T.fg, band ? 0.8 : 0.35); g.font = font(T, th * 0.36); g.fillText(String(c + 1), x + 8, y + th * 0.42);
        // the cell's figure, drawn small
        const cell = r.cells[c]; if (cell) { const len = cellLen(cell), u = (tw - 16) / Math.max(4, len); let xx = x + 8; cell.forEach(([p, d]) => { if (p != null) { g.fillStyle = n ? T.bg : alpha(T.fg, 0.55); g.fillRect(xx, y + th * 0.86 - ((p + 4) / 26) * th * 0.36, Math.max(2, d * u - 2), Math.max(2, th * 0.05)); } xx += d * u; }); }
        // player dots
        occ[c].forEach((k, q) => { const dx = x + tw - 12 - (q % 4) * 10, dy = y + 12 + Math.floor(q / 4) * 10, rr = 3.5 + r.pe[k] * 3 * V.react; g.fillStyle = r.pe[k] > 0.5 ? T.fg : T.bg; g.beginPath(); g.arc(dx, dy, rr, 0, TAU); g.fill(); }); }
    };
    // 3. op-art rings, one per pulse, with the players orbiting
    D.pulse = (T, A, V, E) => {
      const { W, H } = r, cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2, s = r.st.pu || (r.st.pu = { rings: [], last: -1 });
      if (r.pcnt && A.n.p !== s.last) { s.last = A.n.p; s.rings.push({ t: 0, id: (s.id = (s.id || 0) + 1), strong: A.step % 2 === 0 }); } if (!A.playing && Math.random() < r.dt * 2 * V.speed) s.rings.push({ t: 0, id: (s.id = (s.id || 0) + 1), strong: false });
      const sp = (0.18 + 0.12 * V.speed) * (A.bpm / 112); s.rings.forEach((q) => (q.t += r.dt * sp)); s.rings = s.rings.filter((q) => q.t < 1.05);
      // stripes: alternate fills between rings
      for (let i = 0; i < s.rings.length; i++) { const q = s.rings[i], rr = Math.pow(q.t, 0.8) * R; g.fillStyle = q.id % 2 ? T.bg : (q.strong ? T.fg : alpha(T.fg, 0.75)); g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill(); }
      const core = Math.min(W, H) * (0.06 + E.p * 0.05 * V.intensity + E.lo * 0.06 * V.react); g.fillStyle = T.acc; g.beginPath(); g.arc(cx, cy, core, 0, TAU); g.fill();
      const L = active(A), orb = Math.min(W, H) * 0.36; L.forEach((k, i) => { const a = -Math.PI / 2 + (i / L.length) * TAU + r.t * 0.15, x = cx + Math.cos(a) * orb, y = cy + Math.sin(a) * orb, rr = Math.min(W, H) * (0.018 + r.pe[k] * 0.03 * V.react); g.fillStyle = A.ps[k] >= 2 ? alpha(T.acc3, 0.4) : r.pe[k] > 0.3 ? T.acc : T.acc2; g.strokeStyle = T.bg; g.lineWidth = 3; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.stroke(); g.font = font(T, Math.max(10, rr * 0.9), 'mono', 700); g.fillStyle = T.bg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String((A.pc[k] || 0) + 1), x, y + 1); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; });
    };
    // 4. each player a ring carrying its cell; the "now" line is at the top; when players sound together the chord lights up
    D.phase = (T, A, V, E) => {
      const { W, H } = r, cx = W * 0.5, cy = H * 0.52, L = active(A), R1 = Math.min(W, H) * 0.42, R0 = Math.min(W, H) * 0.1, step = (R1 - R0) / Math.max(1, L.length), eps = (A.bpm / 60) * 2;
      const s = r.st.ph || (r.st.ph = { pos: new Array(12).fill(0) }); L.forEach((k) => { if (A.playing && !V.freeze) s.pos[k] += r.dt * eps; });
      const lit = [];
      L.forEach((k, i) => { const rad = R0 + (i + 0.5) * step, cell = r.cells[A.pc[k] || 0] || [[0, 1]], len = cellLen(cell) * (A.pa[k] || 1), rot = -Math.PI / 2 - (s.pos[k] % len) / len * TAU; let acc = 0;
        g.strokeStyle = alpha(T.fg, 0.12); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke();
        cell.forEach(([p, d]) => { const a0 = rot + (acc / len) * TAU, a1 = rot + ((acc + d * (A.pa[k] || 1)) / len) * TAU; if (p != null && A.ps[k] < 2) { g.strokeStyle = r.pe[k] > 0.5 ? T.acc : pcol(T, k); g.lineWidth = Math.max(2, step * (0.35 + ((p + 12) / 40) * 0.4)); g.beginPath(); g.arc(cx, cy, rad, a0 + 0.02, a1 - 0.02); g.stroke(); } acc += d * (A.pa[k] || 1); });
        if (r.pe[k] > 0.4) lit.push([cx, cy - rad]); });
      g.strokeStyle = T.acc; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - R0 * 0.6); g.lineTo(cx, cy - R1 - 14); g.stroke();
      if (lit.length > 1) { g.fillStyle = alpha(T.acc, 0.25 + 0.05 * lit.length); g.fillRect(cx - 8 - lit.length * 2 * V.react, cy - R1 - 10, 16 + lit.length * 4 * V.react, R1 - R0 + 10); }
      lit.forEach(([x, y]) => { g.fillStyle = T.acc; g.beginPath(); g.arc(x, y, 5 + lit.length * 0.8 * V.react, 0, TAU); g.fill(); });
      g.fillStyle = T.fg; g.font = font(T, R0 * 0.9); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(A.lead), cx, cy + 2); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = font(T, Math.max(10, H * 0.02), 'mono'); g.fillStyle = alpha(T.fg, 0.7); g.fillText(up(T, `${lit.length} SOUNDING TOGETHER · ${A.players} RINGS · ${A.sec}`), W * 0.04, H * 0.92 - (V.showTicker ? H * 0.06 : 0));
    };
    // 5. a graphic score: time across, cell number up; every player a line; the spread is a band
    D.score = (T, A, V, E) => {
      const { W, H } = r, x0 = W * 0.06, x1 = W * 0.96, y0 = H * 0.2, y1 = H * (V.showTicker ? 0.84 : 0.9), span = 90 / Math.max(0.3, V.speed), now = performance.now(), tr = r.track;
      g.strokeStyle = alpha(T.fg, 0.1); g.lineWidth = 1; for (let c = 0; c <= 53; c += 4) { const y = y1 - (c / 53) * (y1 - y0); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.fillStyle = alpha(T.fg, 0.5); g.font = font(T, Math.max(9, H * 0.015), 'mono'); g.fillText(String(c || 1), x0 - 28, y + 4); }
      const X = (t) => x1 - ((now - t) / 1000 / span) * (x1 - x0), Y = (c) => y1 - ((c + 0.5) / 53) * (y1 - y0);
      if (tr.length > 1) { g.fillStyle = alpha(T.acc2, 0.16); g.beginPath(); tr.forEach((q, i) => { const x = X(q.t), y = Y(q.hi); i ? g.lineTo(x, y) : g.moveTo(x, y); }); for (let i = tr.length - 1; i >= 0; i--) g.lineTo(X(tr[i].t), Y(tr[i].lo)); g.closePath(); g.fill();
        for (let k = 0; k < 12; k++) { if (k >= A.players) break; g.strokeStyle = r.pe[k] > 0.5 ? T.acc : pcol(T, k); g.lineWidth = 2 + (r.pe[k] > 0.5 ? 2 : 0); g.beginPath(); let started = false; tr.forEach((q) => { if (q.c[k] < 0) { started = false; return; } const x = X(q.t), y = Y(q.c[k]) + (k - 6) * 1.2; if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }); g.stroke(); } }
      // the note "rain" at the right edge
      r.hist.forEach((nt) => { const age = (now - nt.t) / 1000; if (age > 2) return; const y = Y(A.pc[nt.k] || 0); g.fillStyle = alpha(T.acc, 1 - age / 2); g.fillRect(x1 - age * 40 * V.speed, y - 2, 4, 4); });
      g.font = font(T, Math.max(10, H * 0.018), 'mono'); g.fillStyle = alpha(T.fg, 0.7); g.fillText(up(T, `WHO WAS WHERE · LAST ${Math.round(span)} SECONDS · BAND = THE SPREAD (CELLS ${A.min} TO ${A.lead})`), x0, H * 0.175);
    };
    // 6. the leading cell number, huge and cropped; the slowest cell outlined behind; words on the notes
    D.bigtype = (T, A, V, E) => {
      const { W, H } = r, s = r.st.bt || (r.st.bt = { lastC: -1, flip: 0, wi: 0, lastN: -1 }); if (A.n.c !== s.lastC) { s.lastC = A.n.c; s.flip = 1; } s.flip = Math.max(0, s.flip - r.dt * 2);
      const num = String(A.lead).padStart(2, '0'), fs = H * 1.05 * V.textScale; g.font = font(T, fs); g.textBaseline = 'alphabetic';
      g.lineWidth = Math.max(2, fs / 160); g.strokeStyle = alpha(T.fg, 0.35); g.strokeText(String(A.min).padStart(2, '0'), W * 0.02 - fs * 0.05, H * 0.95);
      const nw = g.measureText(num).width; g.fillStyle = s.flip > 0.5 || E.u > 0.3 ? T.acc : T.fg; g.fillText(num, W - nw * 0.86 + Math.sin(r.t * 2) * 4 * V.intensity, H * 0.86 + s.flip * H * 0.05);
      g.fillStyle = T.acc2; g.fillRect(0, H * 0.62, W * (0.4 + E.p * 0.1 * V.intensity), Math.max(8, H * 0.02));
      const words = [...msgs().map((m) => fillTokens(m, A, V))].join(' ').split(/\s+/).filter(Boolean); if (A.n.n !== s.lastN && A.n.n % 6 === 0) s.wi = (s.wi + 1) % Math.max(1, words.length); s.lastN = A.n.n;
      g.font = font(T, Math.min(H * 0.1, fitText(T, up(T, words[s.wi] || ''), W * 0.42, H * 0.1)) * V.textScale); g.fillStyle = T.fg; g.fillText(up(T, words[s.wi] || ''), W * 0.04, H * 0.56);
      g.font = font(T, Math.max(10, H * 0.02), 'mono', 700); g.fillStyle = T.fg; g.fillText(up(T, `FIFTY-THREE CELLS · ${A.players} PLAYERS · ${Math.round(A.bpm)} BPM · SEED ${A.seed}`), W * 0.04, H * 0.08); g.fillStyle = alpha(T.fg, 0.65); g.fillText(up(T, `${A.sec} · SLOWEST ${A.min} · LEADING ${A.lead}`), W * 0.04, H * 0.115);
    };
    // 7. digital signage
    D.signage = (T, A, V, E) => {
      const { W, H } = r, m = msgs(), mi = msgIndex(m.length), pad = W * 0.03, top = H * 0.11, colW = W * 0.3;
      g.fillStyle = T.fg; g.fillRect(0, 0, W, top); g.fillStyle = T.bg; g.font = font(T, top * 0.5); g.textBaseline = 'middle'; g.fillText(up(T, V.brandName || ''), pad, top / 2);
      const clock = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); g.font = font(T, top * 0.42, 'mono', 700); const cw = g.measureText(clock).width; g.fillText(clock, W - pad - cw, top / 2); g.textBaseline = 'alphabetic';
      const bx = pad, by = top + pad, bw = W - colW - pad * 3, bh = H * 0.56; g.strokeStyle = T.fg; g.lineWidth = 3; g.strokeRect(bx, by, bw, bh);
      const msg = up(T, fillTokens(m[mi.i] || V.headline, A, V)), flip = clamp(mi.p * mi.secs / 0.5, 0, 1);
      g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip(); let fs = Math.min(bh * 0.3, W * 0.09) * V.textScale; g.font = font(T, fs); let lines = wrap(msg, bw - pad * 2); while (lines.length * fs * 1.05 > bh - pad * 2 && fs > 14) { fs *= 0.9; g.font = font(T, fs); lines = wrap(msg, bw - pad * 2); }
      const ty = by + bh - pad - (lines.length - 1) * fs * 1.02 + (1 - flip) * bh; g.fillStyle = T.fg; lines.forEach((l, k) => g.fillText(l, bx + pad, ty + k * fs * 1.02 - fs * 0.15)); g.restore();
      g.fillStyle = T.acc; g.fillRect(bx, by + bh - 6, bw * mi.p, 6);
      const rx = W - colW - pad, lab = (y, t) => { g.fillStyle = T.acc; g.font = font(T, Math.max(10, H * 0.02), 'mono', 700); g.fillText(t, rx, y); };
      lab(by + H * 0.025, 'NOW'); g.fillStyle = T.fg; const nowT = up(T, fillTokens(V.headline, A, V)); g.font = font(T, Math.min(H * 0.07, fitText(T, nowT, colW, H * 0.07))); g.fillText(nowT, rx, by + H * 0.095);
      g.font = font(T, Math.max(11, H * 0.022), 'mono'); g.fillText(up(T, fillTokens(V.track, A, V)).slice(0, 42), rx, by + H * 0.135);
      lab(by + H * 0.2, 'NEXT'); g.fillStyle = alpha(T.fg, 0.75); g.font = font(T, Math.max(11, H * 0.026)); wrap(up(T, fillTokens(m[(mi.i + 1) % Math.max(1, m.length)] || '', A, V)), colW).slice(0, 3).forEach((l, k) => g.fillText(l, rx, by + H * 0.25 + k * H * 0.032));
      lab(by + H * 0.39, 'TEMPO · PULSE'); g.fillStyle = E.p > 0.5 ? T.acc : T.fg; g.font = font(T, H * 0.1 * (1 + E.p * 0.05 * V.intensity), 'head'); g.fillText(String(Math.round(A.bpm)), rx, by + H * 0.5);
      // the journey: 53 cells, filled up to the slowest player, outlined to the leader
      const my = by + bh + pad * 0.7, mh = Math.max(8, H - my - H * 0.16 - (V.showTicker ? 0 : -H * 0.05)), cw2 = (W - pad * 2) / 53; if (mh > 8) for (let c = 0; c < 53; c++) { g.fillStyle = c < A.min - 1 ? T.fg : c <= A.lead - 1 ? T.acc : alpha(T.fg, 0.12); g.fillRect(pad + c * cw2, my, cw2 - 2, mh * (c <= A.lead - 1 && c >= A.min - 1 ? 1 : 0.6)); }
    };
    // 8. any slot's waveform, its START and END, and a playhead on every note
    D.scope = (T, A, V, E) => {
      const { W, H } = r, x0 = W * 0.05, w = W * 0.9, y0 = H * 0.42, amp = H * 0.22, p = r.peaks, hit = A.slot === 0 ? E.p : Math.max(0, ...active(A).filter((k) => 1 + (k % 7) === A.slot).map((k) => r.pe[k]));
      g.font = font(T, Math.max(11, H * 0.022), 'mono', 600); g.fillStyle = T.fg; { const lb = up(T, `SLOT ${A.slot + 1} · ${A.smp}`); g.fillText(lb, x0 + w - g.measureText(lb).width, H * 0.155); }
      if (p && p.length) { const n = p.length, a = A.rs * w, z = A.re * w;
        g.fillStyle = alpha(T.fg, 0.08); g.fillRect(x0 + a, y0 - amp - 10, z - a, amp * 2 + 20);
        for (let i = 0; i < n; i++) { const x = x0 + (i / n) * w, inR = i / n >= A.rs && i / n <= A.re, h = p[i] * amp * (inR ? 1 + hit * 0.5 * V.react : 0.6); g.fillStyle = inR ? (hit > 0.3 ? T.acc : T.fg) : alpha(T.fg, 0.25); g.fillRect(x, y0 - h, Math.max(1, w / n - 0.5), h * 2); }
        [[a, 'START'], [z, 'END']].forEach(([x, l]) => { g.fillStyle = T.acc3 === T.bg ? T.acc : T.acc3; g.fillRect(x0 + x - 2, y0 - amp - 30, 4, amp * 2 + 60); g.font = font(T, Math.max(10, H * 0.018), 'mono', 700); g.fillText(l, x0 + x + (l === 'END' ? -g.measureText(l).width - 8 : 8), y0 - amp - 18); });
        if (hit > 0.02) { const ph = x0 + a + (z - a) * (1 - hit); g.fillStyle = T.acc2; g.fillRect(ph - 1.5, y0 - amp - 10, 3, amp * 2 + 20); } }
      g.strokeStyle = T.acc2; g.lineWidth = 2; g.beginPath(); A.wave.forEach((v, i) => { const x = x0 + (i / (A.wave.length - 1)) * w, y = H * 0.8 + (v / 128) * H * 0.08 * (0.5 + V.react); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      g.fillStyle = alpha(T.fg, 0.6); g.font = font(T, Math.max(10, H * 0.016), 'mono'); g.fillText(up(T, `START ${A.rs.toFixed(3)} · END ${A.re.toFixed(3)} · ${A.sec}`), x0, H * 0.7);
    };

    /* ---------------- overlays: headline, message card, lower third, logo, ticker ---------------- */
    function overlays(T, A, V, E, own) {
      const { W, H } = r, tickH = V.showTicker ? Math.max(24, H * 0.055) * V.textScale : 0, pad = W * 0.03;
      if (V.showHead && !own.head) { const t = up(T, fillTokens(V.headline, A, V)), fs = Math.min(H * 0.1, fitText(T, t, W * 0.5, H * 0.1)) * V.textScale; g.font = font(T, fs); if (own.plate) { g.fillStyle = T.bg; g.fillRect(pad - fs * 0.2, pad - fs * 0.05, g.measureText(t).width + fs * 0.4, fs * 1.15); } g.fillStyle = T.fg; g.globalAlpha = 0.92; g.fillText(t, pad, pad + fs * 0.85); g.globalAlpha = 1; g.fillStyle = T.acc; g.fillRect(pad, pad + fs + 6, Math.min(W * 0.3, fs * 2) * (0.4 + E.c * 0.6), Math.max(3, fs * 0.06)); }
      const m = msgs(); if (V.showMsgs && !own.msgs && m.length) { const mi = msgIndex(m.length), t = up(T, fillTokens(m[mi.i], A, V)), fs = Math.max(12, H * 0.028) * V.textScale, bw = W * 0.32; g.font = font(T, fs); const lines = wrap(t, bw - fs).slice(0, 4), bh = lines.length * fs * 1.25 + fs, bx = W - pad - bw, by = H - tickH - pad - bh; const a = clamp(Math.min(mi.p * mi.secs / 0.4, (1 - mi.p) * mi.secs / 0.4), 0, 1);
        g.globalAlpha = a; g.fillStyle = alpha(T.bg, 0.8); g.fillRect(bx, by, bw, bh); g.fillStyle = T.acc; g.fillRect(bx, by, 6, bh); g.fillStyle = T.fg; lines.forEach((l, k) => g.fillText(l, bx + fs * 0.8, by + fs * 1.15 + k * fs * 1.25)); g.globalAlpha = 1; }
      if (V.showLower) { const a1 = up(T, fillTokens(V.artist, A, V)), a2 = up(T, fillTokens(V.track, A, V)), f1 = Math.max(14, H * 0.045) * V.textScale, f2 = Math.max(10, H * 0.022) * V.textScale, y = H - tickH - pad; g.font = font(T, f1); const w1 = g.measureText(a1).width; g.font = font(T, f2, 'mono', 600); const w2 = g.measureText(a2).width, bw = Math.max(w1, w2) + pad;
        g.fillStyle = alpha(T.bg, 0.75); g.fillRect(pad - 10, y - f1 - f2 - 18, bw, f1 + f2 + 26); g.fillStyle = T.acc; g.fillRect(pad - 10, y - f1 - f2 - 18, 6, f1 + f2 + 26); g.fillStyle = T.fg; g.font = font(T, f1); g.fillText(a1, pad + 4, y - f2 - 10); g.font = font(T, f2, 'mono', 600); g.fillStyle = alpha(T.fg, 0.8); g.fillText(a2, pad + 4, y + 2); }
      if (V.showLogo) { const sz = Math.min(W, H) * 0.12 * V.logoSize, pos = V.logoPos || 'tr'; let x = pos[1] === 'l' ? pad : W - pad - sz, y = pos[0] === 't' ? pad : H - tickH - pad - sz; if (r.logoImg) { const im = r.logoImg, ar = im.width / im.height, w = ar >= 1 ? sz : sz * ar, h = ar >= 1 ? sz / ar : sz; if (pos[1] !== 'l') x = W - pad - w; if (pos[0] !== 't') y = H - tickH - pad - h; g.globalAlpha = 0.95; g.drawImage(im, x, y, w, h); g.globalAlpha = 1; } else if (V.brandName) { const t = up(T, V.brandName), fs = Math.max(11, H * 0.022); g.font = font(T, fs, 'head'); const w = g.measureText(t).width + fs; x = pos[1] === 'l' ? pad : W - pad - w; y = pos[0] === 't' ? pad : H - tickH - pad - fs * 1.8; if (!(r.sceneId === 'signage' && pos[0] === 't')) { g.fillStyle = alpha(T.bg, 0.7); g.fillRect(x, y, w, fs * 1.8); g.strokeStyle = T.fg; g.lineWidth = 2; g.strokeRect(x, y, w, fs * 1.8); g.fillStyle = T.fg; g.fillText(t, x + fs / 2, y + fs * 1.25); } } }
      if (V.showTicker) { const y = H - tickH; g.fillStyle = T.acc; g.fillRect(0, y, W, tickH); const t = up(T, fillTokens(V.ticker, A, V)) + '   '; g.font = font(T, tickH * 0.62); g.fillStyle = T.bg; const tw = Math.max(50, g.measureText(t).width), off = ((Date.now() / 1000) * 90 * V.tickerSpeed * (tickH / 40)) % tw; g.textBaseline = 'middle'; for (let x = -off; x < W; x += tw) g.fillText(t, x, y + tickH / 2 + 1); g.textBaseline = 'alphabetic'; }
    }

    /* ---------------- frame ---------------- */
    r.resize = () => { const rc = canvas.getBoundingClientRect(), d = Math.min(opts.maxDpr || 1.5, devicePixelRatio || 1), w = Math.max(1, Math.round(rc.width * d)), h = Math.max(1, Math.round(rc.height * d)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } r.W = rc.width || 1; r.H = rc.height || 1; g.setTransform(d, 0, 0, d, 0, 0); r.d = d; };
    r.render = (now) => {
      now = now || performance.now(); r.dt = clamp((now - (r.last || now)) / 1000, 0, 0.1); r.last = now; r.resize();
      const A = r.A, V = r.V, T = theme(), E = r.env, n = A.n || {}, np = A.np || [];
      if (!r.cnt) r.cnt = Object.assign({}, n); for (const k of EV) { if ((n[k] || 0) !== (r.cnt[k] || 0)) { E[k] = 1; r.cnt[k] = n[k] || 0; } }
      if (!r.pcnt) r.pcnt = np.slice(); for (let k = 0; k < 12; k++) { if ((np[k] || 0) !== (r.pcnt[k] || 0)) { r.pe[k] = 1; r.pcnt[k] = np[k] || 0; } r.pe[k] = Math.max(0, r.pe[k] - r.pe[k] * 8 * r.dt); }
      const dec = { p: 10, n: 8, b: 3, c: 2, u: 0.9, x: 0.6, f: 0.5 }; for (const k in dec) E[k] = Math.max(0, E[k] - E[k] * dec[k] * r.dt);
      r.ePeak = Math.max(0.06, r.ePeak * 0.995, A.e); E.e = clamp(A.e / r.ePeak, 0, 1); E.lo = A.lo; E.mid = A.mid; E.hi = A.hi;
      // the graphic-score track: who was on which cell, four times a second
      if (now - r.trackT > 250 && A.playing) { r.trackT = now; const c = []; let lo = 99, hi = -1; for (let k = 0; k < 12; k++) { const ok = k < A.players && A.ps[k] !== 2 && A.ps[k] !== 3; c.push(ok ? A.pc[k] : -1); if (ok) { lo = Math.min(lo, A.pc[k]); hi = Math.max(hi, A.pc[k]); } } r.track.push({ t: performance.now(), c, lo: lo > 52 ? 0 : lo, hi: hi < 0 ? 0 : hi }); if (r.track.length > 2400) r.track.splice(0, 400); }
      if (!V.freeze) r.t += r.dt * V.speed;
      r.bo = lerp(r.bo, V.blackout ? 1 : 0, clamp(r.dt * 6, 0, 1));
      const W = r.W, H = r.H;
      if (V.freeze && r.frozen) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(r.frozenCv, 0, 0); g.setTransform(r.d, 0, 0, r.d, 0, 0); }
      else {
        const sc = SCENES.find((s) => s.id === V.scene) || SCENES[0];
        if (r.sceneId !== sc.id) { if (r.sceneId && V.transition !== 'cut') { r.snap.width = canvas.width; r.snap.height = canvas.height; r.snap.getContext('2d').drawImage(canvas, 0, 0); r.trans = 1; } r.sceneId = sc.id; }
        g.globalAlpha = 1; g.fillStyle = alpha(T.bg, sc.id === 'bigtype' || sc.id === 'signage' || sc.id === 'pulse' ? 1 : 1 - V.trails * 0.85); g.fillRect(0, 0, W, H);
        g.save(); try { D[sc.id](T, A, V, E); } catch (e) { console.error(e); } g.restore();
        if (T.rough && V.glitch > 0) { const R = rnd(Math.floor(r.t * 12)); for (let k = 0; k < 3 * V.glitch * (1 + E.p * 3); k++) { const y = R() * H, h = 4 + R() * 30, dx = (R() - 0.5) * 60 * V.glitch; g.drawImage(canvas, 0, y * r.d, canvas.width, h * r.d, dx, y, W, h); } }
        else if (V.glitch > 0 && (E.u > 0.5 || E.c > 0.8 && E.n > 0.6)) { const R = rnd(A.n.c + A.n.u); for (let k = 0; k < 4 * V.glitch; k++) { const y = R() * H, h = 6 + R() * 26; g.drawImage(canvas, 0, y * r.d, canvas.width, h * r.d, (R() - 0.5) * 50 * V.glitch, y, W, h); } }
        overlays(T, A, V, E, sc.own || {});
        if (r.trans > 0) { const p = r.trans; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); if (V.transition === 'fade') { g.globalAlpha = p; g.drawImage(r.snap, 0, 0); } else if (V.transition === 'wipe') { const x = (1 - p) * canvas.width; g.drawImage(r.snap, x, 0, canvas.width - x, canvas.height, x, 0, canvas.width - x, canvas.height); g.fillStyle = T.acc; g.fillRect(x - 6, 0, 12, canvas.height); } else if (V.transition === 'flash') { g.globalAlpha = p; g.fillStyle = T.acc; g.fillRect(0, 0, canvas.width, canvas.height); } g.restore(); r.trans = Math.max(0, r.trans - r.dt / 0.8); }
        // unison and the ending flash the screen
        const fl = Math.max(E.u, E.x * 0.7); if (V.flash > 0 && fl > 0.01) { g.fillStyle = alpha(T.acc, fl * fl * V.flash * 0.75); g.fillRect(0, 0, W, H); }
        if (V.grain > 0) { g.save(); g.globalAlpha = V.grain * 0.35; g.globalCompositeOperation = 'overlay'; const ox = Math.random() * 192, oy = Math.random() * 192; g.translate(-ox, -oy); g.fillStyle = g.createPattern(grain, 'repeat'); g.fillRect(0, 0, W + 192, H + 192); g.restore(); }
        if (V.freeze) { r.frozenCv = r.frozenCv || document.createElement('canvas'); r.frozenCv.width = canvas.width; r.frozenCv.height = canvas.height; r.frozenCv.getContext('2d').drawImage(canvas, 0, 0); r.frozen = true; } else r.frozen = false;
      }
      if (r.bo > 0.003) { g.fillStyle = `rgba(0,0,0,${r.bo})`; g.fillRect(0, 0, W, H); }
    };
    return r;
  }
  window.VJ = { THEMES, SCENES, FONTS, MOODS, AREAS, areaOf, defaults, emptyFrame, fillTokens, create };
})();
