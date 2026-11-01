/* MMX deck: the "proper instrument" layer for tools 52 onwards, inlined after the MM kit.
   Adds: sample SLOTS (file or folder per slot, pitch, gain, start/end, reverse, filter, pan, reverb and delay sends),
   bound CONTROLS that presets can save and restore, PRESETS (localStorage + JSON export/import), Web MIDI in,
   an output TAP for resampling, and a keyboard-shortcut sheet (press ?). Everything lives in a DECK drawer (D). */
const MMX = (() => {
  const { h, $, $$, clamp } = MM;
  const S = { slots: [], ctls: [], state: null, keys: [], midiOn: false, midiCb: null, ccMap: {}, learnCC: null, opts: {} };
  const AUDIO_RE = /\.(wav|aiff?|aifc|mp3|ogg|flac|m4a)$/i;
  const fmtN = (v, st) => (st >= 1 ? String(Math.round(v)) : st >= 0.1 ? (+v).toFixed(1) : (+v).toFixed(2));

  /* ---------- drawer ---------- */
  let drawer, tabs = {};
  function makeDrawer() {
    if (drawer) return drawer;
    drawer = h('aside', { id: 'mmx-deck', class: 'mmx-hide' },
      h('div', { class: 'mmx-tabs' }, ...['SOUNDS', 'PRESETS', 'MIDI', 'KEYS'].map((t) => h('button', { class: 'mmx-tab', 'data-t': t, onclick: () => showTab(t) }, t)), h('button', { class: 'mmx-close', onclick: () => deck(false), title: 'D' }, '×')),
      h('div', { class: 'mmx-body' }));
    ['SOUNDS', 'PRESETS', 'MIDI', 'KEYS'].forEach((t) => { tabs[t] = h('div', { class: 'mmx-pane', 'data-t': t }); drawer.querySelector('.mmx-body').append(tabs[t]); });
    document.body.append(drawer);
    const learn = $('#mm-learn'); if (learn) learn.before(h('button', { id: 'mmx-deck-btn', title: 'D: sounds, presets, MIDI, keys', onclick: () => deck() }, 'DECK'));
    showTab('SOUNDS'); return drawer;
  }
  function showTab(t) { $$('.mmx-tab', drawer).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); $$('.mmx-pane', drawer).forEach((p) => (p.style.display = p.dataset.t === t ? '' : 'none')); }
  function deck(on, tab) { makeDrawer(); const show = on ?? drawer.classList.contains('mmx-hide'); drawer.classList.toggle('mmx-hide', !show); const b = $('#mmx-deck-btn'); b && b.classList.toggle('on', show); if (tab) showTab(tab); if (show) drawSlots(); }

  /* ---------- sample slots ---------- */
  function slots(defs) {
    makeDrawer(); const pane = tabs.SOUNDS; pane.innerHTML = '';
    pane.append(h('p', { class: 'mmx-help' }, 'Each slot is one sound. Load a file or pick a folder (a random file is drawn; ↻ draws another). The top-bar SAMPLES, FOLDER and drag-and-drop fill the slots in order.'));
    S.slots = defs.map((d, i) => ({ i, label: d.label, kind: d.kind || 'loop', role: d.role || '', buf: null, rbuf: null, name: '', files: null,
      pitch: d.pitch ?? 0, gain: d.gain ?? 0.8, start: 0, end: 1, rev: false, cut: d.cut ?? 18000, pan: d.pan ?? 0, rv: d.rv ?? 0.15, dl: d.dl ?? 0, mute: false, peaks: null }));
    S.slots.forEach((s) => pane.append(slotUI(s)));
    return S.slots;
  }
  function slotUI(s) {
    const file = h('input', { type: 'file', class: 'mmx-file', accept: 'audio/*,.wav,.aif,.aiff,.aifc,.mp3,.flac,.ogg', hidden: '' });
    const fold = h('input', { type: 'file', class: 'mmx-fold', webkitdirectory: '', hidden: '' });
    file.onchange = () => file.files[0] && loadInto(s.i, file.files[0]);
    fold.onchange = () => { s.files = [...fold.files].filter((f) => AUDIO_RE.test(f.name)); redraw(s); };
    const cv = h('canvas', { class: 'mmx-wave', width: 600, height: 112, title: 'Drag the START and END handles. Shift-drag moves the whole region. Double-click resets.' });
    waveDrag(s, cv);
    const row = (k, lab, min, max, st, fmt) => { const inp = h('input', { type: 'range', min, max, step: st, value: s[k], 'data-k': k }), out = h('span', { class: 'mmx-v' }, fmt ? fmt(s[k]) : fmtN(s[k], st));
      inp.oninput = () => { s[k] = +inp.value; out.textContent = fmt ? fmt(s[k]) : fmtN(s[k], st); if (k === 'start' || k === 'end') { if (s.end <= s.start + 0.005) { if (k === 'start') s.end = Math.min(1, s.start + 0.005); else s.start = Math.max(0, s.end - 0.005); } drawWave(s); S.opts.onRegion && S.opts.onRegion(s.i, s); } };
      return h('label', { class: 'mmx-p' }, h('span', {}, lab), inp, out); };
    const el = h('div', { class: 'mmx-slot', 'data-i': s.i },
      h('div', { class: 'mmx-sh' }, h('b', {}, String(s.i + 1)), h('span', { class: 'mmx-lab' }, s.label), h('span', { class: 'mmx-nm' }, 'built-in ' + s.kind),
        h('label', { class: 'mmx-b', title: 'Load a file into this slot' }, 'FILE', file), h('label', { class: 'mmx-b', title: 'Pick a folder; a random file is drawn' }, 'DIR', fold),
        h('button', { class: 'mmx-b mmx-next', title: 'Draw another file from the folder', onclick: () => drawFromFolder(s.i) }, '↻'),
        h('button', { class: 'mmx-b mmx-aud', title: 'Audition', onclick: () => { MM.ensure(); MM.ctx.resume(); fire(s.i, MM.now + 0.01, { maxDur: 3 }); } }, '▶'),
        h('button', { class: 'mmx-b mmx-clr', title: 'Back to the built-in sound', onclick: () => { s.buf = s.rbuf = null; s.name = ''; s.peaks = null; redraw(s); } }, '⌫')),
      cv,
      h('div', { class: 'mmx-grid' }, row('pitch', 'PITCH', -24, 24, 1, (v) => (v > 0 ? '+' : '') + v + ' st'), row('gain', 'GAIN', 0, 1.5, 0.01), row('start', 'START', 0, 0.99, 0.001, (v) => (v * raw(s).duration).toFixed(2) + 's'), row('end', 'END', 0.01, 1, 0.001, (v) => (v * raw(s).duration).toFixed(2) + 's'),
        row('cut', 'FILTER', 80, 18000, 10, (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v))), row('pan', 'PAN', -1, 1, 0.01), row('rv', 'REVERB', 0, 1, 0.01), row('dl', 'DELAY', 0, 1, 0.01),
        h('label', { class: 'mmx-p mmx-chk' }, h('input', { type: 'checkbox', 'data-k': 'rev', onchange: (e) => { s.rev = e.target.checked; drawWave(s); } }), h('span', {}, 'REVERSE')),
        h('label', { class: 'mmx-p mmx-chk' }, h('input', { type: 'checkbox', 'data-k': 'mute', onchange: (e) => (s.mute = e.target.checked) }), h('span', {}, 'MUTE'))));
    s.el = el; return el;
  }
  function redraw(s) { if (!s.el) return; $('.mmx-nm', s.el).textContent = s.name || 'built-in ' + s.kind; $('.mmx-next', s.el).style.display = s.files && s.files.length ? '' : 'none'; $$('input[data-k]', s.el).forEach((inp) => { const k = inp.dataset.k; if (inp.type === 'checkbox') inp.checked = !!s[k]; else { inp.value = s[k]; inp.dispatchEvent(new Event('input')); } }); drawWave(s); }
  function drawSlots() { S.slots.forEach(redraw); }
  function drawWave(s) {
    const cv = s.el && $('.mmx-wave', s.el); if (!cv || !cv.offsetParent) return; const g = cv.getContext('2d'), w = cv.width, hh = cv.height, st = getComputedStyle(drawer);
    const b = raw(s); if (!s.peaks || s.peaksFor !== b) { s.peaks = MM.peaks(b, w); s.peaksFor = b; }
    g.clearRect(0, 0, w, hh); g.fillStyle = 'rgba(128,128,128,.16)'; g.fillRect(0, 0, w, hh);
    const fg = st.color, acc = (st.getPropertyValue('--acc') || '#e00').trim(), p = s.rev ? [...s.peaks].reverse() : s.peaks, x0 = s.start * w, x1 = s.end * w, mid = hh / 2 + 6;
    g.fillStyle = 'rgba(128,128,128,.18)'; g.fillRect(x0, 0, x1 - x0, hh);
    p.forEach((v, x) => { const inR = x >= x0 && x <= x1; g.fillStyle = inR ? acc : fg; g.globalAlpha = inR ? 1 : 0.28; const y = Math.max(1, v * (hh - 22) * 0.95); g.fillRect(x, mid - y / 2, 1, y); }); g.globalAlpha = 1;
    // handles
    [[x0, 'S'], [x1, 'E']].forEach(([x, l]) => { g.fillStyle = fg; g.fillRect(Math.round(x) - 1, 0, 2, hh); g.beginPath(); if (l === 'S') { g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 14, 12); g.lineTo(x, 18); } else { g.moveTo(x, 0); g.lineTo(x - 14, 0); g.lineTo(x - 14, 12); g.lineTo(x, 18); } g.closePath(); g.fill(); g.fillStyle = st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)' ? st.backgroundColor : '#000'; g.font = '700 10px ui-monospace,monospace'; g.fillText(l, l === 'S' ? x + 4 : x - 11, 10); });
    g.fillStyle = fg; g.font = '600 11px ui-monospace,monospace'; const D = b.duration; g.fillText(`${(s.start * D).toFixed(2)}s`, Math.min(w - 120, x0 + 18), hh - 4); const et = `${(s.end * D).toFixed(2)}s · ${((s.end - s.start) * D).toFixed(2)}s long`; g.fillText(et, Math.max(0, x1 - 18 - g.measureText(et).width), 24 > hh ? hh : 14 + 12);
    // playhead of the last time this slot fired
    const ph = s.ph; if (ph) { const el = (performance.now() - ph.t0) / 1000; if (el >= 0 && el <= ph.dur) { const fr = (ph.off + el * ph.rate) / D; if (fr >= 0 && fr <= 1) { g.fillStyle = '#fff'; g.globalAlpha = 0.9; g.fillRect(fr * w - 1, 0, 3, hh); g.globalAlpha = 1; } } else if (el > ph.dur) s.ph = null; }
  }
  function waveDrag(s, cv) {
    let mode = null, grab = 0, a0 = 0, z0 = 0;
    const fr = (e) => { const r = cv.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
    const setR = (a, z) => { const gap = 0.005; a = clamp(a, 0, 1 - gap); z = clamp(z, a + gap, 1); s.start = +a.toFixed(4); s.end = +z.toFixed(4); $$('input[data-k=start],input[data-k=end]', s.el).forEach((inp) => { inp.value = s[inp.dataset.k]; const o = inp.nextElementSibling; if (o) o.textContent = (s[inp.dataset.k] * raw(s).duration).toFixed(2) + 's'; }); drawWave(s); S.opts.onRegion && S.opts.onRegion(s.i, s); };
    cv.style.cursor = 'ew-resize'; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => { const f = fr(e); cv.setPointerCapture(e.pointerId); a0 = s.start; z0 = s.end; grab = f;
      if (e.shiftKey || e.altKey) mode = 'both'; else mode = Math.abs(f - s.start) <= Math.abs(f - s.end) ? 'start' : 'end';
      if (mode === 'start') setR(f, s.end); else if (mode === 'end') setR(s.start, f); });
    cv.addEventListener('pointermove', (e) => { if (!mode) return; const f = fr(e); if (mode === 'start') setR(f, s.end); else if (mode === 'end') setR(s.start, f); else { const d = clamp(f - grab, -a0, 1 - z0); setR(a0 + d, z0 + d); } });
    const up = () => { if (mode) { mode = null; MM.ensure(); } }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', () => setR(0, 1));
  }
  function animate() { if (!drawer || drawer.classList.contains('mmx-hide')) return; S.slots.forEach((s) => { if (s.ph) drawWave(s); }); }
  async function decode(file) { MM.ensure(); const ab = await file.arrayBuffer(); try { return await MM.ctx.decodeAudioData(ab.slice(0)); } catch (e) { return MM.aiff(ab); } }
  async function loadInto(i, file) { const s = S.slots[i]; if (!s) return; try { const b = await decode(file); setBuf(i, b, file.name); MM.toast(`Slot ${i + 1}: ${file.name}`); } catch (e) { MM.toast(`Could not decode ${file.name}`); console.warn(e); } }
  async function drawFromFolder(i) { const s = S.slots[i]; if (!s || !s.files || !s.files.length) return; for (let k = 0; k < 6; k++) { const f = s.files[Math.floor(Math.random() * s.files.length)]; try { const b = await decode(f); setBuf(i, b, f.name); MM.toast(`Slot ${i + 1}: ${f.name}`); return; } catch (e) {} } MM.toast('No decodable files in that folder'); }
  function setBuf(i, b, name) { const s = S.slots[i]; s.buf = b; s.rbuf = null; s.name = name; s.peaks = null; redraw(s); const el = $('#mm-smp'); if (el) el.textContent = S.slots.filter((x) => x.buf).map((x) => `${x.i + 1}: ${x.name}`).join(' · ') || 'built-in sounds'; S.opts.onSlot && S.opts.onSlot(i, s); }
  /* fill slots from the kit's global loader (top-bar SAMPLES/FOLDER/drop) */
  function assign(list, from = 0) { list.forEach((x, k) => { const i = from + k; if (i < S.slots.length) setBuf(i, x.buf, x.name); }); }
  function raw(s) { return s.buf || MM.fb[s.kind] || MM.fb.loop; }
  function buf(i) { const s = S.slots[i]; if (!s) return MM.fb.loop; const b = raw(s); if (!s.rev) return b; if (!s.rbuf || s.rbufFor !== b) { const c = MM.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate); for (let k = 0; k < b.numberOfChannels; k++) { const src = b.getChannelData(k), d = c.getChannelData(k); for (let j = 0, n = src.length; j < n; j++) d[j] = src[n - 1 - j]; } s.rbuf = c; s.rbufFor = b; } return s.rbuf; }
  function isUser(i) { return !!(S.slots[i] && S.slots[i].buf); }
  /* region of the slot in seconds, honouring reverse */
  function region(i) { const s = S.slots[i], b = buf(i), D = b.duration; let a = s.start * D, z = s.end * D; if (s.rev) [a, z] = [D - z, D - a]; return { a, z, len: Math.max(0.005, z - a), b }; }
  /* play slot i at time t. o: rate (multiplier), semis (added), gain (multiplier), dur, pos (0..1 inside the region), maxDur, pan (overrides), send (adds), dest, fadeIn, fadeOut, loop */
  let busCache = new WeakMap();
  function fire(i, t, o = {}) {
    const s = S.slots[i]; if (!s || s.mute) return null; MM.ensure(); t = t ?? MM.now;
    const { a, len, b } = region(i), rate = (o.rate || 1) * Math.pow(2, (s.pitch + (o.semis || 0)) / 12), off = a + clamp(o.pos || 0, 0, 0.999) * len;
    let dur = o.dur ?? (len - (off - a)) / rate; if (o.maxDur) dur = Math.min(dur, o.maxDur); if (!o.loop) dur = Math.min(dur, (len - (off - a)) / rate);
    const filt = s.cut < 17500 || o.cut ? { type: 'lowpass', freq: Math.min(s.cut, o.cut || 20000), q: 0.8 } : null;
    s.ph = { t0: performance.now() + (t - MM.now) * 1000, off, rate, dur: Math.max(0.01, dur) }; S.opts.onFire && S.opts.onFire(i, s, t, off, rate, dur, b);
    return MM.play(b, t, { offset: off, rate, dur: Math.max(0.01, dur), gain: s.gain * (o.gain ?? 1) * 0.8, pan: clamp((o.pan ?? 0) + s.pan, -1, 1), filter: filt, send: { rev: clamp(s.rv + (o.rev || 0), 0, 1.2), dly: clamp(s.dl + (o.dly || 0), 0, 1.2) }, dest: o.dest, fadeIn: o.fadeIn, fadeOut: o.fadeOut ?? Math.min(0.03, dur / 4), loop: o.loop, loopStart: o.loop ? a : undefined, loopEnd: o.loop ? a + len : undefined });
  }

  /* ---------- bound controls (presets restore them) ---------- */
  /* ctl(parent, key, {label, min, max, step, type: range|select|check|text|number, options: [[v,label]...], fmt(v), on(v), hint}) reads and writes S.state[key] */
  function bind(state) { S.state = state; return state; }
  function ctl(parent, key, o = {}) {
    const st = o.state || S.state, type = o.type || 'range'; let inp;
    if (type === 'select') { inp = h('select', { 'data-key': key }); (o.options || []).forEach(([v, l]) => inp.append(new Option(l ?? v, v))); }
    else if (type === 'check') inp = h('input', { type: 'checkbox', 'data-key': key });
    else if (type === 'text') inp = h('input', { type: 'text', 'data-key': key });
    else if (type === 'textarea') inp = h('textarea', { 'data-key': key, rows: o.rows || 4 });
    else if (type === 'color') inp = h('input', { type: 'color', 'data-key': key });
    else inp = h('input', { type: type === 'number' ? 'number' : 'range', min: o.min ?? 0, max: o.max ?? 1, step: o.step ?? 0.01, 'data-key': key });
    const out = h('span', { class: 'mmx-cv' });
    const show = () => { const v = st[key]; out.textContent = type === 'check' || type === 'text' || type === 'textarea' || type === 'color' ? '' : o.fmt ? o.fmt(v) : type === 'select' ? '' : fmtN(v, o.step ?? 0.01); };
    const read = () => { const v = type === 'check' ? inp.checked : type === 'select' || type === 'text' || type === 'textarea' || type === 'color' ? (typeof st[key] === 'number' ? +inp.value : inp.value) : +inp.value; st[key] = v; show(); o.on && o.on(v); };
    inp.addEventListener(type === 'select' || type === 'check' || type === 'color' ? 'change' : 'input', read); if (type === 'color') inp.addEventListener('input', read);
    const el = h('label', { class: 'mmx-ctl ' + (o.cls || ''), title: o.hint || '' }, h('span', { class: 'mmx-cl' }, o.label || key), inp, out);
    const rec = { key, inp, show, o, type, st, set(v) { st[key] = v; if (type === 'check') inp.checked = !!v; else inp.value = v; show(); o.on && o.on(v); } };
    rec.set(st[key]); S.ctls.push(rec); if (parent) parent.append(el); rec.el = el;
    if (o.cc != null) S.ccMap[o.cc] = key; return rec;
  }
  function setParam(key, v) { const r = S.ctls.find((c) => c.key === key); if (r) r.set(v); else if (S.state) S.state[key] = v; }
  function refresh() { S.ctls.forEach((c) => c.set(c.st[c.key])); }

  /* ---------- presets ---------- */
  const PK = () => 'mm.presets.' + ((window.MM_META || {}).no || 'x');
  const slotKeys = ['pitch', 'gain', 'start', 'end', 'rev', 'cut', 'pan', 'rv', 'dl', 'mute'];
  function snapshot(name) { const x = S.opts.extra ? S.opts.extra.get() : null; return { tool: (window.MM_META || {}).no + '-' + (window.MM_META || {}).slug, name: name || 'preset', saved: new Date().toISOString(), bpm: MM.bpm, params: JSON.parse(JSON.stringify(S.state || {})), slots: S.slots.map((s) => Object.fromEntries([...slotKeys.map((k) => [k, s[k]]), ['sample', s.name || null]])), extra: x }; }
  function apply(p) { if (!p) return false; if (p.bpm) MM.bpm = p.bpm; if (p.params && S.state) { Object.assign(S.state, p.params); refresh(); } (p.slots || []).forEach((x, i) => { const s = S.slots[i]; if (!s) return; slotKeys.forEach((k) => k in x && (s[k] = x[k])); redraw(s); }); if (p.extra && S.opts.extra) S.opts.extra.set(p.extra); S.opts.onPreset && S.opts.onPreset(p); return true; }
  const all = () => { try { return JSON.parse(localStorage.getItem(PK()) || '{}'); } catch (e) { return {}; } };
  function save(name) { name = (name || 'preset').trim(); const a = all(); a[name] = snapshot(name); localStorage.setItem(PK(), JSON.stringify(a)); listPresets(); MM.toast('Preset saved: ' + name); return a[name]; }
  function load(name) { const p = all()[name]; if (!p) return false; apply(p); MM.toast('Preset loaded: ' + name); return true; }
  function del(name) { const a = all(); delete a[name]; localStorage.setItem(PK(), JSON.stringify(a)); listPresets(); }
  function exportJSON() { const sel = $('#mmx-psel'), a = all(), body = sel && a[sel.value] ? a[sel.value] : snapshot('current'); const blob = new Blob([JSON.stringify(body, null, 1)], { type: 'application/json' }); const m = window.MM_META || {}, el = h('a', { href: URL.createObjectURL(blob), download: `${m.no}-${m.slug}-preset-${(body.name || 'preset').replace(/\W+/g, '-')}.json` }); document.body.append(el); el.click(); el.remove(); return body; }
  async function importJSON(file) { try { const p = JSON.parse(await file.text()); apply(p); const a = all(); a[p.name || file.name] = p; localStorage.setItem(PK(), JSON.stringify(a)); listPresets(); MM.toast('Imported preset: ' + (p.name || file.name)); return true; } catch (e) { MM.toast('Not a preset file'); return false; } }
  function listPresets() { const sel = $('#mmx-psel'); if (!sel) return; const cur = sel.value; sel.innerHTML = ''; const a = all(); Object.keys(a).forEach((k) => sel.append(new Option(k, k))); if (a[cur]) sel.value = cur; }
  function presetsUI(factory = {}) {
    makeDrawer(); const pane = tabs.PRESETS; pane.innerHTML = '';
    const a = all(); let changed = false; Object.entries(factory).forEach(([k, v]) => { if (!a[k]) { a[k] = Object.assign(snapshot(k), v.full ? v.full : { params: Object.assign(JSON.parse(JSON.stringify(S.state)), v.params || {}) }, { factory: true, name: k }); changed = true; } }); if (changed) localStorage.setItem(PK(), JSON.stringify(a));
    const nm = h('input', { id: 'mmx-pname', type: 'text', placeholder: 'preset name', value: 'my preset' }), sel = h('select', { id: 'mmx-psel' }), imp = h('input', { id: 'mmx-pimp', type: 'file', accept: '.json,application/json', hidden: '' });
    imp.onchange = () => imp.files[0] && importJSON(imp.files[0]);
    pane.append(h('p', { class: 'mmx-help' }, 'A preset stores every control, the tempo and each slot\'s settings (not the audio itself; the sample names are noted so you can reload them). Saved in this browser; EXPORT writes a JSON file you can share or keep with your samples.'),
      h('div', { class: 'mmx-row' }, nm, h('button', { class: 'mmx-b', id: 'mmx-psave', onclick: () => save(nm.value) }, 'SAVE')),
      h('div', { class: 'mmx-row' }, sel, h('button', { class: 'mmx-b', id: 'mmx-pload', onclick: () => load(sel.value) }, 'LOAD'), h('button', { class: 'mmx-b', onclick: () => sel.value && del(sel.value) }, 'DELETE')),
      h('div', { class: 'mmx-row' }, h('button', { class: 'mmx-b', id: 'mmx-pexp', onclick: exportJSON }, 'EXPORT JSON'), h('label', { class: 'mmx-b' }, 'IMPORT JSON', imp)));
    listPresets();
  }

  /* ---------- MIDI ---------- */
  function midiUI(help) {
    makeDrawer(); const pane = tabs.MIDI; pane.innerHTML = '';
    const st = h('div', { class: 'mmx-help', id: 'mmx-mst' }, 'MIDI is off.');
    const learn = h('select', { id: 'mmx-mlearn' }); const fill = () => { const v = learn.value; learn.innerHTML = ''; learn.append(new Option('MIDI learn: pick a control, then move a knob', '')); S.ctls.filter((c) => c.type === 'range').forEach((c) => learn.append(new Option(c.o.label || c.key, c.key))); learn.value = v; }; fill(); learn.addEventListener('pointerdown', fill); learn.addEventListener('focus', fill);
    learn.onchange = () => { S.learnCC = learn.value || null; st.textContent = S.learnCC ? 'Move a knob or fader to map it to ' + S.learnCC : st.textContent; };
    pane.append(h('p', { class: 'mmx-help' }, help || 'Notes play the instrument. Any knob can be mapped with MIDI learn.'), h('button', { class: 'mmx-b', id: 'mmx-midi', onclick: midiStart }, 'ENABLE MIDI IN'), st, learn, h('div', { class: 'mmx-help', id: 'mmx-mlog' }));
  }
  async function midiStart() {
    const st = $('#mmx-mst'); if (!navigator.requestMIDIAccess) { st.textContent = 'This browser has no Web MIDI (use Chrome or Edge).'; return; }
    try { const acc = await navigator.requestMIDIAccess(); const hook = () => { let n = 0; acc.inputs.forEach((inp) => { n++; inp.onmidimessage = onMidi; }); st.textContent = n ? `MIDI on: ${n} input${n > 1 ? 's' : ''}.` : 'MIDI on, but no inputs found. Plug one in.'; }; hook(); acc.onstatechange = hook; S.midiOn = true; }
    catch (e) { st.textContent = 'MIDI was blocked: ' + e.message; }
  }
  function onMidi(e) { const [a, b, c] = e.data, cmd = a & 0xf0; const lg = $('#mmx-mlog'); if (lg) lg.textContent = `last: ${[a, b, c].join(' ')}`;
    if (cmd === 0x90 && c > 0) { MM.ensure(); MM.ctx.resume(); S.opts.midi && S.opts.midi(b, c / 127, true); }
    else if (cmd === 0x80 || (cmd === 0x90 && c === 0)) S.opts.midi && S.opts.midi(b, 0, false);
    else if (cmd === 0xb0) { if (S.learnCC) { S.ccMap[b] = S.learnCC; MM.toast(`CC ${b} → ${S.learnCC}`); S.learnCC = null; const l = $('#mmx-mlearn'); if (l) l.value = ''; }
      const k = S.ccMap[b], r = k && S.ctls.find((x) => x.key === k); if (r) { const mn = +(r.o.min ?? 0), mx = +(r.o.max ?? 1), stp = +(r.o.step ?? 0.01); let v = mn + (c / 127) * (mx - mn); v = Math.round(v / stp) * stp; r.set(+v.toFixed(4)); } } }

  /* ---------- keys ---------- */
  function keysUI(list) {
    S.keys = [['Space', 'play / stop'], ['R', 'record to WAV'], ['L', 'learn panel'], ['D', 'deck: sounds, presets, MIDI'], ['?', 'this sheet'], ...list]; makeDrawer();
    tabs.KEYS.innerHTML = ''; tabs.KEYS.append(h('table', { class: 'mmx-keys' }, ...S.keys.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))));
  }
  /* call first from the tool's key handler; returns true if it handled the key */
  function key(e) { if (e.key === 'd' || e.key === 'D') { deck(); return true; } if (e.key === '?') { const open = drawer && !drawer.classList.contains('mmx-hide') && tabs.KEYS.style.display !== 'none'; deck(!open, 'KEYS'); return true; } return false; }

  /* ---------- output tap: keeps the last N seconds of the mix, for resampling ---------- */
  let tapSt = null;
  function tap(sec = 16) { if (tapSt) return tapSt; const ctx = MM.ctx, n = Math.ceil(sec * ctx.sampleRate), L = new Float32Array(n), R = new Float32Array(n), sp = ctx.createScriptProcessor(4096, 2, 2), z = ctx.createGain(); z.gain.value = 0; let w = 0, filled = 0;
    sp.onaudioprocess = (e) => { const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.getChannelData(1); for (let i = 0; i < a.length; i++) { L[w] = a[i]; R[w] = b[i]; w = (w + 1) % n; } filled = Math.min(n, filled + a.length); };
    MM.out.connect(sp); sp.connect(z); z.connect(ctx.destination);
    tapSt = { grab(s) { const m = Math.min(filled, Math.floor(s * ctx.sampleRate)); if (m < 128) return null; const B = ctx.createBuffer(2, m, ctx.sampleRate), l = B.getChannelData(0), r = B.getChannelData(1); for (let i = 0; i < m; i++) { const j = (w - m + i + n) % n; l[i] = L[j]; r[i] = R[j]; } let pk = 0; for (let i = 0; i < m; i++) pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i])); if (pk > 0) for (let i = 0; i < m; i++) { l[i] *= 0.85 / pk; r[i] *= 0.85 / pk; } const f = Math.min(m >> 2, 600); for (let i = 0; i < f; i++) { const g = i / f; l[i] *= g; r[i] *= g; l[m - 1 - i] *= g; r[m - 1 - i] *= g; } return B; } };
    return tapSt; }


  /* ---------- richer LEARN panel: quotes with sources, a "try this with your own sounds" list, and the deck ---------- */
  function learn() {
    const m = window.MM_META || {}, M = m.manifesto, D = m.design, dlg = $('#mm-learn-dlg'); if (!dlg || !M) return;
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'), q = (x) => (Array.isArray(x) ? `<blockquote>“${esc(x[0])}”<cite>${esc(x[1])}</cite></blockquote>` : `<blockquote>“${esc(x)}”</blockquote>`);
    dlg.innerHTML = `<button class="mm-x" aria-label="close">×</button>
<div class="mm-l-col"><div class="mm-l-k">${esc(m.kicker || 'THE SOURCE IDEA')}</div><h2>${esc(M.name)}</h2><div class="mm-l-by">${esc(M.author)} · ${esc(M.year)}${M.where ? ' · ' + esc(M.where) : ''}</div>
<div class="mm-l-k">KEY IDEAS</div><ul>${M.ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
${(M.quotes || []).map(q).join('')}
<div class="mm-l-k">HOW THIS INSTRUMENT READS IT</div><p>${esc(M.system)}</p>
${m.live ? `<div class="mm-l-k">LIVE VISUALS (PERFORMANCE MODE)</div>${m.live.map((x) => `<p>${esc(x)}</p>`).join('')}` : ''}
${m.try ? `<div class="mm-l-k">TRY THIS WITH YOUR OWN SOUNDS</div><ol>${m.try.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>` : ''}</div>
<div class="mm-l-col"><div class="mm-l-k">THE DESIGN HOMAGE</div><h2>${esc(D.name)}</h2><div class="mm-l-by">${esc(D.who)} · ${esc(D.era)}</div>
<div class="mm-l-k">HALLMARKS, AND WHERE THEY SHOW UP HERE</div><ul>${D.hallmarks.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
<div class="mm-l-k">WORKS TO LOOK UP</div><ul>${D.works.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
<div class="mm-l-k">HOW TO PLAY</div><p>${esc(m.how)}</p>
<div class="mm-l-k">THE DECK (PRESS D)</div><p>Sample slots with pitch, gain, start and end (drag the handles on each waveform; shift-drag moves the whole region), reverse, filter, pan, reverb and delay sends; presets (save, load, export and import JSON); MIDI in with MIDI learn for any slider; and every keyboard shortcut (press ?).</p>
<p class="mm-l-note">${(M.quotes || []).length ? 'Quotes are short and taken from the published sources named under each one; everything else is paraphrase.' : 'Everything here is paraphrase: no score, text or recording is reproduced.'} ${esc(m.note || ('Tool ' + m.no + ' of Manifesto Machines.'))}</p></div>`;
    dlg.querySelector('.mm-x').onclick = () => dlg.classList.add('mm-hide');
  }

  /* ---------- setup ---------- */
  function init(o) { S.opts = o; makeDrawer(); learn(); if (o.state) bind(o.state); if (o.slots) slots(o.slots); presetsUI(o.factory || {}); midiUI(o.midiHelp); keysUI(o.keys || []); return S; }
  return { init, animate, drawWave, slots, ctl, bind, setParam, refresh, fire, buf, region, isUser, assign, loadInto, setBuf, save, load, del, exportJSON, importJSON, snapshot, apply, deck, key, tap, onMidi, decode, S };
})();
