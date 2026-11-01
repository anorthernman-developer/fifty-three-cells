/* Fifty-Three Cells: the controller side of performance mode.
   - listens to the master output (AnalyserNode) and to what the ensemble schedules (EFX events: pulse, notes, cells, unison, ending)
   - owns the visuals settings (V), the preview renderer, auto-cycle, presets, MIDI learn for visuals and keys
   - syncs every output window over BroadcastChannel, and by postMessage to windows it opened (so file:// works too) */
(function () {
  const { h, $, $$ } = MM;
  const LS = { cur: 'ftc.vj.current', presets: 'ftc.vj.presets', notes: 'ftc.vj.notes', layout: 'ftc.layout' };
  const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const V = Object.assign(VJ.defaults(), jget(LS.cur, {}));
  V.blackout = false; V.freeze = false;
  const SID = Math.random().toString(36).slice(2, 9);
  let seq = 0; const outs = new Set(), seen = new Map();
  const BC = 'BroadcastChannel' in window ? new BroadcastChannel('ftc-live') : null;

  /* ---------- sync ---------- */
  function send(msg) { msg.sid = SID; msg.q = ++seq; try { BC && BC.postMessage(msg); } catch (e) {} outs.forEach((w) => { if (w.closed) outs.delete(w); else try { w.postMessage(msg, '*'); } catch (e) {} }); }
  const strip = () => { const o = Object.assign({}, V); delete o.logo; return o; };
  function sendAll() { send({ t: 's', V: strip() }); send({ t: 'logo', src: V.logo || '' }); sendPeaks(true); sendCells(true); }
  function onMsg(m) { if (!m || typeof m !== 'object') return; if (m.t === 'hello') { seen.set(m.id, performance.now()); sendAll(); } else if (m.t === 'ping') { if (!seen.has(m.id)) sendAll(); seen.set(m.id, performance.now()); } else if (m.t === 'bye') seen.delete(m.id); }
  if (BC) BC.onmessage = (e) => onMsg(e.data);
  addEventListener('message', (e) => { if ([...outs].includes(e.source)) onMsg(e.data); });

  let saveT; function changed(opts = {}) { r.setSettings(V); send({ t: 's', V: strip() }); if (opts.logo) send({ t: 'logo', src: V.logo || '' }); sendPeaks(false); clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS.cur, JSON.stringify(V)); } catch (e) { MM.toast('Could not save visuals (logo too big?)'); } }, 300); syncButtons(); }

  /* ---------- the preview renderer ---------- */
  const view = $('#view'), pcv = h('canvas', { id: 'vjcv' }); view.append(pcv);
  const hint = h('div', { id: 'vjhint' }, 'VISUALS ONLY · Esc or G to go back · double-click for full screen · O opens a separate output window'); view.append(hint);
  const r = VJ.create(pcv, { maxDpr: 1.25 }); r.setSettings(V);
  pcv.addEventListener('dblclick', () => { if (document.body.classList.contains('lay-visuals')) { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } });

  /* ---------- analysis ---------- */
  const ctx = MM.ctx, an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.72; MM.post.connect(an);
  const sink = ctx.createGain(); sink.gain.value = 0; an.connect(sink); sink.connect(ctx.destination);
  const fbin = new Uint8Array(an.frequencyBinCount), tbin = new Uint8Array(an.fftSize), NB = 48;
  const band = (f) => Math.min(fbin.length - 1, Math.round(f / (ctx.sampleRate / 2) * fbin.length));
  const edges = Array.from({ length: NB + 1 }, (_, i) => band(30 * Math.pow(16000 / 30, i / NB)));
  const counts = { p: 0, n: 0, b: 0, c: 0, u: 0, x: 0, f: 0 }, np = new Array(12).fill(0), log = []; let barT = 0, barN = 0, peaksKey = null, sentCells = -1, lowPrev = 0, lowAvg = 0;
  function sendPeaks(force) { const i = Math.max(0, Math.min(7, V.scopeSlot | 0)), b = MMX.buf(i), s = MMX.S.slots[i]; if (!b) return; const key = i + ':' + b.length + ':' + (s && s.rev); if (force || key !== peaksKey || b !== sendPeaks.b) { sendPeaks.b = b; peaksKey = key; const peaks = MM.peaks(b, 400).map((x) => +x.toFixed(3)); r.setPeaks(peaks); send({ t: 'p', peaks }); } }
  function sendCells(force) { if (!force && sentCells === cellsVer) return; sentCells = cellsVer; const c = JSON.parse(JSON.stringify(cells)); r.setCells(c); send({ t: 'c', cells: c }); }
  const slotName = (i) => { const s = MMX.S.slots[i]; return !s ? '' : MMX.isUser(i) ? s.name : 'built-in ' + (s.kind || s.label); };
  function frame() {
    an.getByteFrequencyData(fbin); an.getByteTimeDomainData(tbin);
    const spec = new Array(NB); for (let i = 0; i < NB; i++) { let m = 0; for (let k = edges[i]; k <= Math.max(edges[i], edges[i + 1] - 1); k++) m = Math.max(m, fbin[k]); spec[i] = m; }
    const avg = (a, b) => { let s = 0; for (let k = a; k < b; k++) s += fbin[k]; return s / Math.max(1, b - a) / 255; };
    const lo = avg(band(30), band(150)), mid = avg(band(150), band(2000)), hi = avg(band(2000), band(12000));
    let rms = 0; for (let i = 0; i < tbin.length; i++) { const v = (tbin[i] - 128) / 128; rms += v * v; } rms = Math.sqrt(rms / tbin.length);
    const wave = new Array(96); for (let i = 0; i < 96; i++) wave[i] = tbin[Math.floor(i * tbin.length / 96)] - 128;
    // ensemble events that have now sounded
    const now = ctx.currentTime, q = EFX.q, nn = [];
    for (let i = 0; i < q.length;) { const [ty, T, x] = q[i]; if (T <= now) { counts[ty] = (counts[ty] || 0) + 1; if (ty === 'b') { barT = T; barN = x | 0; } else if (ty === 'n') { np[x[0]]++; nn.push([x[0], x[1], +x[2].toFixed(3)]); } else if (ty === 'c') { log.unshift(`PLAYER ${String(x[0] + 1).padStart(2, '0')} → CELL ${x[1] + 1}`); log.length = Math.min(log.length, 20); } else if (ty === 'u') log.unshift(`UNISON ON CELL ${(x | 0) + 1}`); else if (ty === 'x') log.unshift('THE ENDING: TOWARDS CELL 53'); q.splice(i, 1); } else if (T > now + 5) q.splice(i, 1); else i++; }
    // your own loops through the pulse slot, nothing playing: a simple bass onset detector still moves the pulse
    lowAvg = lowAvg * 0.95 + lo * 0.05; if (lo > lowAvg * 1.35 && lo - lowPrev > 0.06 && lo > 0.25 && !MM.playing) counts.p++; lowPrev = lo;
    const sd = 60 / MM.bpm / 2, step = MM.playing ? Math.floor(Math.max(0, now - barT) / sd) % 8 : 0;
    const L = P.slice(0, st.players), act = L.filter((p) => !p.done && count >= p.enter), lead = act.length ? Math.max(...act.map((p) => p.cell)) : 0, min = act.length ? Math.min(...act.map((p) => p.cell)) : 0;
    const ps = P.map((p, k) => (k >= st.players ? 2 : p.done ? 3 : count < p.enter ? 2 : p.out ? 1 : 0));
    const si = Math.max(0, Math.min(7, V.scopeSlot | 0)), sl = MMX.S.slots[si] || { start: 0, end: 1 };
    return { e: rms, lo, mid, hi, spec, wave, bar: barN, step, sec: secName(), lead: lead + 1, min: min + 1, spread: st.spread, players: st.players, seed: st.seed, bpm: MM.bpm, key: 'C', playing: MM.playing,
      n: Object.assign({}, counts), np: np.slice(), nn, pc: P.map((p) => p.cell), ps, pr: P.map((p) => p.reps), pa: P.map((p) => p.aug), po: P.map((p) => p.oct), pl: P.map((p) => slotName(p.slot).slice(0, 18)),
      log: log.slice(0, 14), rs: sl.start, re: sl.end, smp: slotName(si), slot: si };
  }

  /* ---------- scenes, cycling, actions ---------- */
  const ids = VJ.SCENES.map((s) => s.id);
  function setScene(id) { if (!ids.includes(id)) return; V.scene = id; cyc.t = performance.now(); cyc.bar = counts.b; changed(); }
  function nextScene(d = 1) { const list = (V.cycleList && V.cycleList.length ? V.cycleList : ids).filter((x) => ids.includes(x)); const pool = d && list.length ? list : ids; let i = pool.indexOf(V.scene); i = i < 0 ? 0 : (i + d + pool.length) % pool.length; setScene(pool[i]); }
  const cyc = { t: performance.now(), bar: 0, lead: 0, u: 0, last: 'bars' };
  function tickCycle(A) { const mode = V.cycle; let go = false; if (mode === 'time') go = performance.now() - cyc.t > Math.max(2, V.cycleSecs) * 1000; else if (mode === 'bars') go = A.playing && counts.b - cyc.bar >= Math.max(1, V.cycleBars); else if (mode === 'cell') go = A.playing && cyc.lead && A.lead !== cyc.lead; else if (mode === 'unison') go = cyc.u !== counts.u + counts.x; cyc.lead = A.lead; cyc.u = counts.u + counts.x; if (go) nextScene(1); }
  const themeIds = Object.keys(VJ.THEMES);
  const ACT = {
    blackout: () => { V.blackout = !V.blackout; changed(); MM.toast(V.blackout ? 'Blackout' : 'Lights up'); },
    freeze: () => { V.freeze = !V.freeze; changed(); MM.toast(V.freeze ? 'Visuals frozen' : 'Visuals moving'); },
    next: () => nextScene(1), prev: () => nextScene(-1),
    cycle: () => { if (V.cycle === 'off') V.cycle = cyc.last || 'bars'; else { cyc.last = V.cycle; V.cycle = 'off'; } refreshVJ(); changed(); MM.toast('Auto-cycle: ' + V.cycle); },
    theme: () => { V.theme = themeIds[(themeIds.indexOf(V.theme) + 1) % themeIds.length]; refreshVJ(); changed(); MM.toast('Theme: ' + VJ.THEMES[V.theme].name); },
    message: () => { V.msgOffset = (V.msgOffset | 0) + 1; changed(); },
    unison: () => unison(), ending: () => end(), restart: () => restart(),
    output: () => openOutput()
  };
  ids.forEach((id, k) => (ACT['scene' + (k + 1)] = () => setScene(id)));
  const ACT_NAMES = [['blackout', 'Blackout'], ['freeze', 'Freeze'], ['next', 'Next scene'], ['prev', 'Previous scene'], ['cycle', 'Auto-cycle on/off'], ['theme', 'Next theme'], ['message', 'Next message'], ['unison', 'Ensemble: unison'], ['ending', 'Ensemble: the ending'], ['restart', 'Ensemble: restart'], ...ids.map((id, k) => ['scene' + (k + 1), `Scene ${k + 1}: ${VJ.SCENES[k].name}`])];

  /* ---------- output windows ---------- */
  function openOutput(feat) { const w = window.open('output.html', 'ftc-output-' + (outs.size + 1), feat || 'popup=yes,width=1280,height=720'); if (!w) { MM.toast('The browser blocked the pop-up: allow pop-ups for this page, then press OUTPUT again'); return null; } outs.add(w); setTimeout(sendAll, 600); MM.toast('Output window opened: drag it to the projector, click it, press F'); return w; }
  async function toProjector() { try { const sd = await window.getScreenDetails(); const s = sd.screens.find((x) => x !== sd.currentScreen) || sd.currentScreen; openOutput(`popup=yes,left=${s.availLeft},top=${s.availTop},width=${s.availWidth},height=${s.availHeight}`); if (s === sd.currentScreen) MM.toast('Only one screen found: plug in the projector and extend the display'); } catch (e) { MM.toast('Screen placement not allowed: drag the window instead'); openOutput(); } }

  /* ---------- layouts ---------- */
  const LAYS = ['studio', 'split', 'visuals']; let lay = localStorage.getItem(LS.layout) || 'split', prevLay = 'split';
  function setLayout(l) { if (!LAYS.includes(l)) l = 'split'; if (l === 'visuals' && lay !== 'visuals') prevLay = lay; lay = l; LAYS.forEach((x) => document.body.classList.toggle('lay-' + x, x === l)); localStorage.setItem(LS.layout, l); $$('.efl-lay').forEach((b) => b.classList.toggle('on', b.dataset.l === l)); if (l === 'visuals') { hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 3500); } }
  function fitPreview() { const rc = view.getBoundingClientRect(); if (lay === 'split') { const ar = 16 / 9, pad = 12; let w = rc.width - pad * 2, hh = w / ar; if (hh > rc.height - pad * 2) { hh = rc.height - pad * 2; w = hh * ar; } Object.assign(pcv.style, { width: w + 'px', height: hh + 'px', left: (rc.width - w) / 2 + 'px', top: (rc.height - hh) / 2 + 'px' }); } else Object.assign(pcv.style, { width: '100%', height: '100%', left: '0px', top: '0px' }); }

  /* ---------- top bar buttons ---------- */
  const rec = $('#mm-rec'), mkB = (l, t, fn, cls) => h('button', { class: cls || '', title: t, onclick: fn }, l);
  rec.after(mkB('STUDIO', 'G: the instrument on its own', () => setLayout('studio'), 'efl-lay'), mkB('SPLIT', 'G: controls and a live preview side by side', () => setLayout('split'), 'efl-lay'), mkB('VISUALS', 'G: visuals only in this window (Esc to go back)', () => setLayout('visuals'), 'efl-lay'), mkB('OUTPUT ↗', 'O: open the visuals in a new window for the projector', () => openOutput(), 'efl-out'));
  $$('#mm-bar .efl-lay').forEach((b, k) => (b.dataset.l = LAYS[k]));

  /* ---------- the visuals panel ---------- */
  const PNL = h('aside', { id: 'vjp' }); $('#mm-stage').append(PNL);
  const sec_ = (t) => { const d = h('div', { class: 'vjs' }); PNL.append(h('h3', {}, t), d); return d; };
  const ctl = (parent, key, o) => MMX.ctl(parent, key, Object.assign({ state: V, on: () => changed(), cls: 'vjc' }, o));
  // LIVE
  const L1 = sec_('Live · output');
  const st_ = h('div', { class: 'vj-status' }, 'No output window yet.');
  L1.append(h('div', { class: 'vj-row' }, mkB('OPEN OUTPUT ↗', 'O', () => openOutput(), 'vjb big'), 'getScreenDetails' in window ? mkB('ON PROJECTOR', 'Opens the output full size on your second screen (Chrome asks permission once)', toProjector, 'vjb') : null), st_);
  const ensRow = h('div', { class: 'vj-row' }, mkB('UNISON · U', 'Everyone onto the leading cell', ACT.unison, 'vjb'), mkB('ENDING · E', 'Everyone towards cell 53, then out one by one', ACT.ending, 'vjb'), mkB('RESTART · 0', 'From cell 1', ACT.restart, 'vjb'), mkB('NEW CELLS · N', 'Write 53 new cells', () => newCells(), 'vjb'));
  L1.append(h('div', { class: 'vj-lab' }, 'THE ENSEMBLE'), ensRow);
  const scRow = h('div', { class: 'vj-scenes' }); VJ.SCENES.forEach((s, k) => scRow.append(h('button', { class: 'vjb sc', 'data-id': s.id, title: `Shift+${k + 1} · ${s.homage}`, onclick: () => setScene(s.id) }, h('b', {}, String(k + 1)), ' ' + s.name)));
  L1.append(h('div', { class: 'vj-lab' }, 'SCENE (SHIFT+1 to 8, [ and ])'), scRow);
  const bBlack = mkB('BLACKOUT · K', 'K', ACT.blackout, 'vjb warn'), bFreeze = mkB('FREEZE · F', 'F', ACT.freeze, 'vjb');
  L1.append(h('div', { class: 'vj-row' }, bBlack, bFreeze, mkB('NEXT ▸', ']', ACT.next, 'vjb'), mkB('MESSAGE ▸', 'J', ACT.message, 'vjb')));
  // CYCLE
  const C = sec_('Auto-cycle');
  ctl(C, 'cycle', { type: 'select', label: 'Cycle', options: [['off', 'off'], ['time', 'every N seconds'], ['bars', 'every N bars'], ['cell', 'each new leading cell'], ['unison', 'each unison or ending']] });
  ctl(C, 'cycleSecs', { label: 'Seconds', min: 4, max: 120, step: 1 }); ctl(C, 'cycleBars', { label: 'Bars', min: 1, max: 64, step: 1 });
  ctl(C, 'transition', { type: 'select', label: 'Transition', options: [['fade', 'fade'], ['wipe', 'wipe'], ['flash', 'flash'], ['cut', 'cut']] });
  const inc = h('div', { class: 'vj-inc' }); VJ.SCENES.forEach((s) => { const cb = h('input', { type: 'checkbox', 'data-id': s.id }); cb.onchange = () => { const set = new Set(V.cycleList || []); cb.checked ? set.add(s.id) : set.delete(s.id); V.cycleList = ids.filter((x) => set.has(x)); changed(); }; inc.append(h('label', {}, cb, ' ' + s.name)); });
  C.append(h('div', { class: 'vj-lab' }, 'SCENES IN THE CYCLE'), inc);
  // LOOK
  const K = sec_('Look');
  const themeNote = h('div', { class: 'vj-note' }, VJ.THEMES[V.theme] ? VJ.THEMES[V.theme].homage : '');
  ctl(K, 'theme', { type: 'select', label: 'Theme', options: themeIds.map((k) => [k, VJ.THEMES[k].name]), on: () => { changed(); themeNote.textContent = (VJ.THEMES[V.theme] || {}).homage || ''; } }); K.append(themeNote);
  ctl(K, 'areaMoods', { type: 'check', label: 'Harmony moods (the look follows the leading cell through the 7 harmonic areas)' });
  ctl(K, 'font', { type: 'select', label: 'Font', options: VJ.FONTS }); ctl(K, 'caps', { type: 'check', label: 'Capitals' });
  ctl(K, 'scopeSlot', { type: 'select', label: 'Scope slot', options: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i, `${i + 1} · ${i ? 'timbre ' + i : 'pulse'}`]), on: () => { sendPeaks(true); changed(); } });
  ctl(K, 'intensity', { label: 'VJ · Intensity', min: 0, max: 1.5 }); ctl(K, 'speed', { label: 'VJ · Speed', min: 0, max: 3 }); ctl(K, 'react', { label: 'VJ · Reactivity', min: 0, max: 2.5 });
  ctl(K, 'trails', { label: 'VJ · Trails', min: 0, max: 1 }); ctl(K, 'flash', { label: 'VJ · Unison flash', min: 0, max: 1 }); ctl(K, 'glitch', { label: 'VJ · Glitch', min: 0, max: 1 }); ctl(K, 'grain', { label: 'VJ · Grain', min: 0, max: 1 }); ctl(K, 'textScale', { label: 'VJ · Text size', min: 0.4, max: 2 });
  // TEXT
  const X = sec_('Text layers');
  X.append(h('div', { class: 'vj-note' }, 'Tokens: {cell} {min} {players} {spread} {seed} {bpm} {key} {area} {section} {bar} {time} {date} {artist} {brand} {sample}'));
  ctl(X, 'headline', { type: 'text', label: 'Headline' }); ctl(X, 'showHead', { type: 'check', label: 'Show headline' });
  ctl(X, 'artist', { type: 'text', label: 'Artist' }); ctl(X, 'track', { type: 'text', label: 'Track' }); ctl(X, 'showLower', { type: 'check', label: 'Show artist and track' });
  ctl(X, 'ticker', { type: 'text', label: 'Ticker' }); ctl(X, 'tickerSpeed', { label: 'VJ · Ticker speed', min: 0, max: 4 }); ctl(X, 'showTicker', { type: 'check', label: 'Show ticker' });
  ctl(X, 'messages', { type: 'textarea', label: 'Messages (one per line, they rotate like signage)', rows: 5 }); ctl(X, 'msgSecs', { label: 'Seconds each', min: 2, max: 30, step: 1 }); ctl(X, 'showMsgs', { type: 'check', label: 'Show messages' });
  // BRAND
  const B = sec_('Brand');
  ctl(B, 'brandName', { type: 'text', label: 'Brand name' });
  const logoIn = h('input', { type: 'file', accept: 'image/*', hidden: '' }), logoPrev = h('img', { class: 'vj-logo', alt: '' });
  logoIn.onchange = () => { const f = logoIn.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => { const m = 512, s = Math.min(1, m / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); V.logo = c.toDataURL('image/png'); logoPrev.src = V.logo; changed({ logo: true }); MM.toast('Logo loaded'); }; im.onerror = () => MM.toast('Could not read that image'); im.src = fr.result; }; fr.readAsDataURL(f); };
  B.append(h('div', { class: 'vj-row' }, h('label', { class: 'vjb' }, 'LOGO IMAGE', logoIn), mkB('CLEAR LOGO', '', () => { V.logo = ''; logoPrev.removeAttribute('src'); changed({ logo: true }); }, 'vjb'), logoPrev)); if (V.logo) logoPrev.src = V.logo;
  ctl(B, 'logoPos', { type: 'select', label: 'Logo corner', options: [['tr', 'top right'], ['tl', 'top left'], ['br', 'bottom right'], ['bl', 'bottom left']] }); ctl(B, 'logoSize', { label: 'VJ · Logo size', min: 0.3, max: 3 }); ctl(B, 'showLogo', { type: 'check', label: 'Show logo (or brand name)' });
  ctl(B, 'brandBg', { type: 'color', label: 'Background' }); ctl(B, 'brandFg', { type: 'color', label: 'Text' }); ctl(B, 'brandAcc', { type: 'color', label: 'Accent' });
  ctl(B, 'brandFont', { type: 'select', label: 'Brand font', options: VJ.FONTS.filter((f) => f[0] !== 'theme') });
  B.append(h('div', { class: 'vj-row' }, mkB('USE MY BRAND THEME', 'Switches the theme to your brand colours and font', () => { V.theme = 'brand'; V.areaMoods = false; refreshVJ(); changed(); }, 'vjb')));
  // PRESETS
  const PR = sec_('Visuals presets');
  const FACT = { 'Jazz sleeve lanes (default)': {}, 'Swiss signage': { theme: 'swiss', scene: 'signage', cycle: 'off', grain: 0, trails: 0 }, 'Op-art pulse, cycle on each cell': { theme: 'opart', scene: 'pulse', cycle: 'cell', transition: 'cut', cycleList: ['pulse', 'phase', 'bigtype'] }, 'Harmony moods tour': { areaMoods: true, cycle: 'bars', cycleBars: 16, transition: 'wipe' }, 'Graphic score (gallery)': { theme: 'score', scene: 'score', cycle: 'time', cycleSecs: 30, cycleList: ['score', 'strip', 'phase'], showTicker: false, grain: 0.2, caps: false }, 'Brand show (signage + logo)': { theme: 'brand', scene: 'signage', cycle: 'time', cycleSecs: 15, transition: 'wipe' }, 'Acid rave, every 8 bars': { theme: 'acid', cycle: 'bars', cycleBars: 8, transition: 'flash', intensity: 1.1, glitch: 0.45 } };
  const allP = () => { const a = jget(LS.presets, {}); let ch = false; for (const k in FACT) if (!a[k]) { a[k] = Object.assign(VJ.defaults(), FACT[k], { factory: true }); ch = true; } if (ch) localStorage.setItem(LS.presets, JSON.stringify(a)); return a; };
  const pn = h('input', { type: 'text', value: 'my show', placeholder: 'preset name' }), ps = h('select', {}), pimp = h('input', { type: 'file', accept: '.json,application/json', hidden: '' });
  const listP = () => { const cur = ps.value; ps.innerHTML = ''; Object.keys(allP()).forEach((k) => ps.append(new Option(k, k))); if (cur) ps.value = cur; };
  const applyP = (p) => { const keep = { blackout: V.blackout }; Object.assign(V, VJ.defaults(), p, keep); delete V.factory; delete V.name; if (V.logo) logoPrev.src = V.logo; else logoPrev.removeAttribute('src'); refreshVJ(); changed({ logo: true }); };
  const saveP = () => { const a = allP(), nm = (pn.value || 'my show').trim(); a[nm] = Object.assign({}, V, { blackout: false, freeze: false }); try { localStorage.setItem(LS.presets, JSON.stringify(a)); listP(); ps.value = nm; MM.toast('Visuals preset saved: ' + nm); } catch (e) { MM.toast('Could not save: storage full (try a smaller logo)'); } };
  pimp.onchange = async () => { const f = pimp.files[0]; if (!f) return; try { const p = JSON.parse(await f.text()); const body = p.visuals || p; applyP(body); const a = allP(); a[p.name || f.name.replace(/\.json$/, '')] = body; localStorage.setItem(LS.presets, JSON.stringify(a)); listP(); MM.toast('Imported visuals preset'); } catch (e) { MM.toast('Not a visuals preset file'); } pimp.value = ''; };
  const exportP = () => { const nm = ps.value || 'current', body = { app: 'fifty-three-cells', kind: 'visuals', name: nm, saved: new Date().toISOString(), visuals: Object.assign({}, ps.value ? allP()[ps.value] : V, { blackout: false, freeze: false }) }; const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(body, null, 1)], { type: 'application/json' })), download: `ftc-visuals-${nm.replace(/\W+/g, '-')}.json` }); document.body.append(a); a.click(); a.remove(); };
  PR.append(h('div', { class: 'vj-row' }, pn, mkB('SAVE', '', saveP, 'vjb')), h('div', { class: 'vj-row' }, ps, mkB('LOAD', '', () => ps.value && applyP(allP()[ps.value]), 'vjb'), mkB('DELETE', '', () => { const a = allP(); delete a[ps.value]; localStorage.setItem(LS.presets, JSON.stringify(a)); listP(); }, 'vjb')), h('div', { class: 'vj-row' }, mkB('EXPORT JSON', '', exportP, 'vjb'), h('label', { class: 'vjb' }, 'IMPORT JSON', pimp), mkB('RESET LOOK', 'Back to the defaults (keeps nothing)', () => applyP({}), 'vjb')));
  PR.append(h('div', { class: 'vj-note' }, 'Visuals presets are separate from the instrument presets in the DECK, so you can change the show without touching the sound. Logos are saved inside the preset.'));
  listP();
  // MIDI
  const MI = sec_('MIDI for visuals');
  const notes = jget(LS.notes, {}); let learnAct = null; const nsel = h('select', {}), nlist = h('div', { class: 'vj-note' });
  nsel.append(new Option('MIDI learn: pick an action, then hit a pad', '')); ACT_NAMES.forEach(([k, l]) => nsel.append(new Option(l, k)));
  const showNotes = () => { const e = Object.entries(notes); nlist.textContent = e.length ? e.map(([n, a]) => `note ${n} → ${(ACT_NAMES.find((x) => x[0] === a) || [0, a])[1]}`).join(' · ') : 'No pads mapped yet.'; };
  nsel.onchange = () => { learnAct = nsel.value || null; if (learnAct) MM.toast('Hit a pad or key on your controller'); };
  MI.append(h('div', { class: 'vj-note' }, 'Press ENABLE MIDI IN in the DECK (D → MIDI) first. Pads trigger the actions below; every VJ slider (intensity, speed, reactivity…) is in the DECK\'s MIDI learn list too, so a knob can drive it. Mapped pads no longer play notes.'), nsel, h('div', { class: 'vj-row' }, mkB('CLEAR PADS', '', () => { for (const k in notes) delete notes[k]; localStorage.setItem(LS.notes, '{}'); showNotes(); }, 'vjb')), nlist); showNotes();
  window.EFL_midi = (n, v, on) => { if (learnAct && on) { for (const k in notes) if (notes[k] === learnAct) delete notes[k]; notes[n] = learnAct; localStorage.setItem(LS.notes, JSON.stringify(notes)); MM.toast(`Note ${n} → ${nsel.selectedOptions[0].textContent}`); learnAct = null; nsel.value = ''; showNotes(); return true; } if (notes[n]) { if (on) ACT[notes[n]] && ACT[notes[n]](); return true; } return false; };

  function refreshVJ() { MMX.S.ctls.forEach((c) => { if (c.st === V || c.o.state === V) { const o = c.o.on; c.o.on = null; c.set(V[c.key]); c.o.on = o; } }); $$('input[type=checkbox][data-id]', inc).forEach((cb) => (cb.checked = (V.cycleList || []).includes(cb.dataset.id))); themeNote.textContent = (VJ.THEMES[V.theme] || {}).homage || ''; }
  function syncButtons() { $$('.vjb.sc', scRow).forEach((b) => b.classList.toggle('on', b.dataset.id === V.scene)); bBlack.classList.toggle('on', !!V.blackout); bFreeze.classList.toggle('on', !!V.freeze); }
  refreshVJ();

  /* ---------- keys (captured before the instrument's own) ---------- */
  addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey) return; let done = true; const k = e.key.toLowerCase();
    if (e.shiftKey && /^Digit[1-8]$/.test(e.code)) setScene(ids[+e.code.slice(5) - 1]);
    else if (e.key === ']') ACT.next(); else if (e.key === '[') ACT.prev(); else if (k === 'c') ACT.cycle(); else if (k === 't') ACT.theme(); else if (k === 'j') ACT.message(); else if (k === 'k') ACT.blackout(); else if (k === 'f') ACT.freeze(); else if (k === 'o') openOutput();
    else if (k === 'g') setLayout(LAYS[(LAYS.indexOf(lay) + 1) % LAYS.length]); else if (e.key === 'Escape' && lay === 'visuals') setLayout(prevLay === 'visuals' ? 'split' : prevLay); else done = false;
    if (done) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  /* ---------- the loop ---------- */
  const fpsT = { n: 0, t: performance.now(), fps: 0 };
  function loop(ts) {
    try { const A = frame(); sendCells(false); r.setFrame(Object.assign({}, A)); tickCycle(A); sendPeaks(false); send({ t: 'f', A }); if (lay !== 'studio') { fitPreview(); r.render(ts); } MMX.animate();
      fpsT.n++; if (ts - fpsT.t > 1000) { fpsT.fps = fpsT.n; fpsT.n = 0; fpsT.t = ts; const nowp = performance.now(); for (const [id, t] of seen) if (nowp - t > 3500) seen.delete(id); st_.textContent = seen.size ? `OUTPUT: ${seen.size} window${seen.size > 1 ? 's' : ''} connected · ${fpsT.fps} fps here` : 'No output window connected. Press OPEN OUTPUT, drag it to the projector, click it and press F.'; st_.classList.toggle('ok', seen.size > 0); syncButtons(); }
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }
  MMX.S.opts.onRegion = () => {}; // the region is sent every frame (rs/re)
  setLayout(lay); syncButtons(); requestAnimationFrame(loop);
  addEventListener('beforeunload', () => send({ t: 'bye-controller' }));
  window.FTC = { V, r, send, setScene, nextScene, openOutput, setLayout, ACT, counts, outs, get seen() { return seen; }, changed };
  window.EFL = window.FTC;
})();
