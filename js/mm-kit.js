/* MM kit: shared engine for Manifesto Machines, inlined into every tool at build time so each file stays standalone.
   Audio graph: voices -> MM.out -> limiter (compressor + soft clip) -> master volume -> speakers (and the WAV recorder). */
const MM = (() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k.startsWith('on')) e[k] = v; else if (k === 'html') e.innerHTML = v; else if (v !== false && v != null) e.setAttribute(k, v); } for (const c of kids) if (c != null && c !== false) e.append(c); return e; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rng = (seed = Date.now()) => { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], penta: [0, 2, 4, 7, 9], minpent: [0, 3, 5, 7, 10], hira: [0, 2, 3, 7, 8], whole: [0, 2, 4, 6, 8, 10], chrom: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], blues: [0, 3, 5, 6, 7, 10] };
  const deg = (d, scale = 'minpent', root = 48) => { const s = SCALES[scale] || scale, n = s.length, o = Math.floor(d / n); return root + 12 * o + s[((d % n) + n) % n]; };
  const S = { bpm: 100, div: 4, playing: false, step: 0, events: 0, samples: [], rec: null, lastModel: null };
  let ctx, out, lim, clip, vol, cfg = {}, meta = {}, nextT = 0, FB = null, revIn, dlyIn, dly;

  /* ---------- audio graph ---------- */
  function ensure() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    out = ctx.createGain(); out.gain.value = 0.9;
    lim = ctx.createDynamicsCompressor(); lim.threshold.value = -12; lim.knee.value = 6; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.18;
    clip = ctx.createWaveShaper(); const c = new Float32Array(2048); for (let i = 0; i < c.length; i++) { const x = i / 1023.5 - 1; c[i] = Math.tanh(x * 1.2) / Math.tanh(1.2) * 0.92; } clip.curve = c; clip.oversample = '2x';
    vol = ctx.createGain(); vol.gain.value = +(localStorage.getItem('mm.vol') || 0.8);
    out.connect(lim); lim.connect(clip); clip.connect(vol); vol.connect(ctx.destination);
    // shared space: reverb + tempo delay, used only by tools that ask for them
    const rv = ctx.createConvolver(); rv.buffer = impulse(3, 2.4); revIn = ctx.createGain(); revIn.gain.value = 0.5; revIn.connect(rv); rv.connect(out);
    dly = ctx.createDelay(3); dly.delayTime.value = 0.375; const fb = ctx.createGain(); fb.gain.value = 0.38; const lp = ctx.createBiquadFilter(); lp.frequency.value = 3000;
    dlyIn = ctx.createGain(); dlyIn.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(out);
    FB = makeFallbacks();
    return ctx;
  }
  function impulse(sec, decay) { const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }

  /* ---------- built-in fallback sounds, synthesised so every tool plays before any sample is loaded ---------- */
  function makeFallbacks() {
    const sr = ctx.sampleRate, buf = (sec, ch = 1) => ctx.createBuffer(ch, Math.floor(sr * sec), sr);
    const kick = (d, o, g = 1) => { for (let i = 0; i < sr * 0.45 && o + i < d.length; i++) { const t = i / sr; d[o + i] += g * Math.sin(2 * Math.PI * (45 * t + 90 * (1 - Math.exp(-t * 28)) / 28)) * Math.exp(-t * 7); } };
    const snare = (d, o, g = 1) => { for (let i = 0; i < sr * 0.25 && o + i < d.length; i++) { const t = i / sr; d[o + i] += g * ((Math.random() * 2 - 1) * 0.6 * Math.exp(-t * 18) + 0.4 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 25)); } };
    const hat = (d, o, g = 1) => { let p = 0; for (let i = 0; i < sr * 0.06 && o + i < d.length; i++) { const t = i / sr, n = Math.random() * 2 - 1; d[o + i] += g * (n - p) * 0.5 * Math.exp(-t * 60); p = n; } };
    const tone = (d, o, f, dur, g = 1, harm = [1, 0.5, 0.33, 0.25]) => { for (let i = 0; i < sr * dur && o + i < d.length; i++) { const t = i / sr; let s = 0; harm.forEach((a, k) => (s += a * Math.sin(2 * Math.PI * f * (k + 1) * t))); d[o + i] += g * s * Math.min(1, t * 200) * Math.exp(-t * 3 / dur); } };
    const F = {};
    F.kick = buf(0.5); kick(F.kick.getChannelData(0), 0);
    F.snare = buf(0.3); snare(F.snare.getChannelData(0), 0);
    F.hat = buf(0.08); hat(F.hat.getChannelData(0), 0, 0.9);
    F.tone = buf(2.5); tone(F.tone.getChannelData(0), 0, 130.81, 2.5, 0.45, [1, 0.6, 0.4, 0.25, 0.15, 0.1]);
    F.loop = buf(60 / 96 * 8); { const d = F.loop.getChannelData(0), b = Math.floor(sr * 60 / 96 / 4); const K = [0, 6, 8, 11], N = [4, 12], bass = [36, 36, 39, 41, 36, 43, 41, 39];
      for (let bar = 0; bar < 2; bar++) for (let s = 0; s < 16; s++) { const o = (bar * 16 + s) * b; if (K.includes(s)) kick(d, o, 0.8); if (N.includes(s)) snare(d, o, 0.55); hat(d, o, s % 2 ? 0.25 : 0.45); if (s % 4 === 2) tone(d, o, mtof(bass[(bar * 4 + s / 4) | 0] || 36), 0.3, 0.22, [1, 0.5, 0.2]); } }
    F.voice = buf(1.6); { const d = F.voice.getChannelData(0); let ph = 0; const fm = [[730, 1], [1090, 0.5], [2440, 0.25]], st = fm.map(() => [0, 0]);
      for (let i = 0; i < d.length; i++) { const t = i / sr, f0 = 150 * (1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * t)); ph += f0 / sr; const src = (ph % 1) < 0.08 ? 1 : 0; let y = 0;
        fm.forEach(([f, a], k) => { const r = Math.exp(-Math.PI * 90 / sr), w = 2 * Math.PI * f / sr, s = st[k]; const v = src + 2 * r * Math.cos(w) * s[0] - r * r * s[1]; s[1] = s[0]; s[0] = v; y += v * a; });
        d[i] = y * 0.02 * Math.min(1, t * 12) * Math.min(1, (1.6 - t) * 6); } }
    F.texture = buf(4, 2); for (let c = 0; c < 2; c++) { const d = F.texture.getChannelData(c); let lpv = 0; for (let i = 0; i < d.length; i++) { lpv += ((Math.random() * 2 - 1) - lpv) * 0.03; d[i] = lpv * 0.6 * (0.6 + 0.4 * Math.sin(i / sr * 1.3 + c)); } [57, 64, 69, 76].forEach((m, k) => tone(d, Math.floor(sr * k * 0.9), mtof(m + c * 0.1), 3, 0.08, [1, 0.3])); }
    // normalise everything to a sane peak
    Object.values(F).forEach((b) => { let m = 0; for (let c = 0; c < b.numberOfChannels; c++) for (const x of b.getChannelData(c)) m = Math.max(m, Math.abs(x)); if (m > 0) for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= 0.8 / m; } });
    return F;
  }
  /* sample i of the user's loaded samples, or the built-in fallback of a given kind */
  function smp(i = 0, kind = 'loop') { ensure(); if (S.samples.length) return S.samples[((i % S.samples.length) + S.samples.length) % S.samples.length].buf; return FB[kind] || FB.loop; }
  function smpName(i = 0, kind = 'loop') { return S.samples.length ? S.samples[((i % S.samples.length) + S.samples.length) % S.samples.length].name : 'built-in ' + kind; }

  /* ---------- voices ---------- */
  function env(g, t, a, peak, end) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + a + 0.01, end)); }
  function dest(o) { return (o && o.dest) || out; }
  function pan(node, p, d) { if (p == null || !ctx.createStereoPanner) { node.connect(d); return; } const sp = ctx.createStereoPanner(); sp.pan.value = clamp(p, -1, 1); node.connect(sp); sp.connect(d); }
  function tone(f, t, d, o = {}) {
    ensure(); t = t ?? ctx.currentTime; const g = ctx.createGain(), e = t + d + (o.release ?? 0.2); env(g, t, o.attack ?? 0.005, o.gain ?? 0.25, e);
    let node = g; if (o.cutoff) { const lp = ctx.createBiquadFilter(); lp.frequency.value = o.cutoff; lp.Q.value = o.q ?? 0.7; g.connect(lp); node = lp; }
    pan(node, o.pan, dest(o)); if (o.send) sends(node, o.send);
    const os = (o.partials || [[1, 1]]).map(([r, a]) => { const x = ctx.createOscillator(), gg = ctx.createGain(); x.type = o.type || 'sine'; x.frequency.setValueAtTime(f * r, t); if (o.glide) x.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide * r), t + d); x.detune.value = o.detune || 0; gg.gain.value = a; x.connect(gg); gg.connect(g); x.start(t); x.stop(e + 0.05); return x; });
    S.events++; return { g, osc: os, end: e };
  }
  function noise(t, d, o = {}) {
    ensure(); t = t ?? ctx.currentTime; const s = ctx.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; const g = ctx.createGain(), e = t + d; env(g, t, o.attack ?? 0.002, o.gain ?? 0.2, e);
    let n = s; if (o.freq) { const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq, t); if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, e); f.Q.value = o.q ?? 1; s.connect(f); n = f; }
    n.connect(g); pan(g, o.pan, dest(o)); if (o.send) sends(g, o.send); s.start(t, Math.random()); s.stop(e + 0.05); S.events++; return { s, g };
  }
  let _nb; function noiseBuf() { if (_nb) return _nb; _nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = _nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return _nb; }
  function play(buf, t, o = {}) {
    ensure(); t = t ?? ctx.currentTime; const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = o.rate || 1; if (o.detune) s.detune.value = o.detune;
    if (o.loop) { s.loop = true; if (o.loopStart != null) { s.loopStart = o.loopStart; s.loopEnd = o.loopEnd ?? buf.duration; } }
    const g = ctx.createGain(), gain = o.gain ?? 0.7, off = clamp(o.offset || 0, 0, Math.max(0, buf.duration - 0.005));
    const dur = o.dur ?? (o.loop ? null : (buf.duration - off) / (o.rate || 1)); const fi = o.fadeIn ?? 0.003, fo = o.fadeOut ?? 0.01;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + fi);
    if (dur != null) { g.gain.setValueAtTime(gain, t + Math.max(fi, dur - fo)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
    let n = s; if (o.filter) { const f = ctx.createBiquadFilter(); f.type = o.filter.type || 'lowpass'; f.frequency.value = o.filter.freq || 2000; f.Q.value = o.filter.q ?? 0.7; s.connect(f); n = f; }
    n.connect(g); pan(g, o.pan, dest(o)); if (o.send) sends(g, o.send);
    s.start(t, off); if (dur != null) s.stop(t + dur + 0.02); S.events++; return { s, g, stop(at) { const x = at ?? ctx.currentTime; try { g.gain.cancelScheduledValues(x); g.gain.setTargetAtTime(0.0001, x, 0.05); s.stop(x + 0.3); } catch (e) {} } };
  }
  function sends(node, s) { if (s.rev) { const g = ctx.createGain(); g.gain.value = s.rev; node.connect(g); g.connect(revIn); } if (s.dly) { const g = ctx.createGain(); g.gain.value = s.dly; node.connect(g); g.connect(dlyIn); } }
  function setDelay(sec, fb) { ensure(); dly.delayTime.setTargetAtTime(clamp(sec, 0.01, 2.9), ctx.currentTime, 0.05); }
  function crusher(bits = 6) { ensure(); const w = ctx.createWaveShaper(), n = 4096, c = new Float32Array(n), q = Math.pow(2, bits - 1); for (let i = 0; i < n; i++) { const x = i / (n / 2) - 1; c[i] = Math.round(x * q) / q; } w.curve = c; return w; }
  function drive(k = 20) { ensure(); const w = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n / 2) - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } w.curve = c; w.oversample = '4x'; return w; }
  /* slice a buffer into n equal parts, or at detected onsets */
  function onsets(buf, max = 16) { const d = buf.getChannelData(0), hop = 512, en = []; for (let i = 0; i + hop < d.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += d[i + j] * d[i + j]; en.push(Math.sqrt(s / hop)); } const pts = [0]; let avg = 0; for (let k = 1; k < en.length; k++) { avg = avg * 0.9 + en[k - 1] * 0.1; if (en[k] > avg * 1.8 && en[k] > 0.02 && (k * hop - pts[pts.length - 1] * buf.sampleRate) > buf.sampleRate * 0.08) pts.push(k * hop / buf.sampleRate); if (pts.length >= max) break; } return pts; }
  function peaks(buf, n = 200) { const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), p = []; for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < Math.min(d.length, (i + 1) * step); j += 4) m = Math.max(m, Math.abs(d[j])); p.push(m); } return p; }
  function cloneBuf(b) { const c = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate); for (let i = 0; i < b.numberOfChannels; i++) c.getChannelData(i).set(b.getChannelData(i)); return c; }

  /* ---------- transport: a look-ahead step clock; tools get step(i, time, stepDur) and/or tick(now) ---------- */
  function pump() {
    if (!ctx || !S.playing) return; const now = ctx.currentTime;
    if (cfg.step) { if (nextT < now - 0.2) nextT = now + 0.02; while (nextT < now + 0.12) { const sd = 60 / S.bpm / S.div; try { cfg.step(S.step, nextT, sd); } catch (e) { console.error(e); } S.step++; nextT += sd * (cfg.swing && S.step % 2 ? 1 + cfg.swing : cfg.swing && S.step % 2 === 0 ? 1 - cfg.swing : 1); } }
    if (cfg.tick) try { cfg.tick(now); } catch (e) { console.error(e); }
  }
  async function toggle(on = !S.playing) {
    ensure(); if (ctx.state !== 'running') await ctx.resume();
    if (on === S.playing) return; S.playing = on; const b = $('#mm-play'); if (b) { b.classList.toggle('on', on); b.textContent = on ? '■ STOP' : '▶ PLAY'; }
    document.body.classList.toggle('mm-playing', on);
    if (on) { nextT = ctx.currentTime + 0.05; S.step = 0; cfg.start && cfg.start(); } else { cfg.stop && cfg.stop(); }
  }

  /* ---------- recording to WAV ---------- */
  function rec() {
    ensure(); const b = $('#mm-rec');
    if (!S.rec) {
      const sp = ctx.createScriptProcessor(4096, 2, 2), z = ctx.createGain(); z.gain.value = 0; const L = [], R = [];
      sp.onaudioprocess = (e) => { L.push(new Float32Array(e.inputBuffer.getChannelData(0))); R.push(new Float32Array(e.inputBuffer.getChannelData(1))); };
      vol.connect(sp); sp.connect(z); z.connect(ctx.destination); S.rec = { sp, z, L, R }; b && (b.classList.add('on'), (b.textContent = '■ SAVE WAV')); if (!S.playing) toggle(true); toast('Recording…');
    } else {
      const { sp, z, L, R } = S.rec; vol.disconnect(sp); sp.disconnect(); z.disconnect(); S.rec = null; b && (b.classList.remove('on'), (b.textContent = '● REC'));
      const blob = wav(L, R, ctx.sampleRate); S.lastWav = blob; const a = h('a', { href: URL.createObjectURL(blob), download: `${meta.no}-${meta.slug}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav` }); document.body.append(a); a.click(); a.remove(); toast(`Saved WAV (${(blob.size / 1048576).toFixed(1)} MB)`);
    }
  }
  function wav(L, R, sr) {
    const n = L.reduce((s, x) => s + x.length, 0), buf = new ArrayBuffer(44 + n * 4), dv = new DataView(buf), ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 4, true);
    let o = 44; for (let c = 0; c < L.length; c++) { const l = L[c], r = R[c]; for (let i = 0; i < l.length; i++) { dv.setInt16(o, clamp(l[i], -1, 1) * 32767, true); dv.setInt16(o + 2, clamp(r[i], -1, 1) * 32767, true); o += 4; } }
    return new Blob([buf], { type: 'audio/wav' });
  }

  /* ---------- samples: WAV/MP3/OGG/FLAC via the browser, AIFF/AIFC (uncompressed) via a small reader ---------- */
  const AUDIO_RE = /\.(wav|aiff?|aifc|mp3|ogg|flac|m4a)$/i;
  function aiff(ab) {
    const v = new DataView(ab); if (String.fromCharCode(...new Uint8Array(ab, 0, 4)) !== 'FORM') throw new Error('not AIFF');
    let p = 12, ch, n, bytes, rate, off, le = false;
    while (p + 8 <= v.byteLength) { const id = String.fromCharCode(...new Uint8Array(ab, p, 4)), z = v.getUint32(p + 4);
      if (id === 'COMM') { ch = v.getInt16(p + 8); n = v.getUint32(p + 10); bytes = v.getInt16(p + 14) / 8; const ex = v.getUint16(p + 16) & 0x7fff, hi = v.getUint32(p + 18); rate = hi * Math.pow(2, ex - 16383 - 31); if (z >= 22) { const ct = String.fromCharCode(...new Uint8Array(ab, p + 26, 4)); if (ct === 'sowt') le = true; else if (!/NONE|twos/.test(ct)) throw new Error('compressed AIFC ' + ct); } }
      if (id === 'SSND') off = p + 16 + v.getUint32(p + 8); p += 8 + z + (z & 1); }
    if (!ch || off == null) throw new Error('bad AIFF'); const B = ctx.createBuffer(ch, n, Math.round(rate));
    for (let k = 0; k < ch; k++) { const d = B.getChannelData(k); for (let i = 0; i < n; i++) { const q = off + (i * ch + k) * bytes; if (q + bytes > v.byteLength) break; d[i] = bytes === 1 ? v.getInt8(q) / 128 : bytes === 2 ? v.getInt16(q, le) / 32768 : bytes === 3 ? (le ? (v.getInt8(q + 2) * 65536 + v.getUint16(q, true)) : (v.getInt8(q) * 65536 + v.getUint16(q + 1))) / 8388608 : v.getInt32(q, le) / 2147483648; } }
    return B;
  }
  async function decode(file) { const ab = await file.arrayBuffer(); try { return await ctx.decodeAudioData(ab.slice(0)); } catch (e) { return aiff(ab); } }
  async function loadFiles(list) {
    ensure(); let files = [...list].filter((f) => AUDIO_RE.test(f.name)); if (!files.length) return toast('No audio files found (WAV, AIFF, MP3, OGG, FLAC)');
    const cap = cfg.maxSamples || 12, total = files.length; if (files.length > cap) { for (let i = files.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [files[i], files[j]] = [files[j], files[i]]; } files = files.slice(0, cap); }
    const got = []; for (const f of files) { try { const buf = await decode(f); if (buf.duration > 0.01) got.push({ name: f.name, buf }); } catch (e) { console.warn('skipped', f.name, e.message); } }
    if (!got.length) return toast('Could not decode those files');
    S.samples = got; renderSamples(); toast(`Loaded ${got.length} sample${got.length > 1 ? 's' : ''}${total > cap ? ` (random ${cap} of ${total})` : ''}`);
    try { cfg.onSamples && cfg.onSamples(S.samples); } catch (e) { console.error(e); }
  }
  function renderSamples() { const el = $('#mm-smp'); if (el) el.textContent = S.samples.length ? `${S.samples.length} sample${S.samples.length > 1 ? 's' : ''}: ${S.samples.map((s) => s.name).join(', ')}` : 'built-in sounds · drop your Splice samples anywhere'; }

  /* ---------- Gemini (optional): key pasted by the user, kept only in this browser's localStorage ---------- */
  const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.6-flash'];
  function parseJSON(text) { let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(); try { return JSON.parse(s); } catch (e) {} const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} } throw new Error('Gemini reply was not valid JSON'); }
  async function gemini({ system, user, schema, temperature = 1 }) {
    const key = (localStorage.getItem('sr12.geminiKey') || '').trim(); if (!key) throw new Error('No Google AI Studio key saved');
    const chosen = localStorage.getItem('gp.geminiModel') || MODELS[0], order = [chosen, ...MODELS.filter((m) => m !== chosen)]; let useSchema = !!schema, lastErr;
    for (let i = 0; i < order.length; i++) { const m = order[i], gc = { temperature, responseMimeType: 'application/json' }; if (useSchema) gc.responseJsonSchema = schema;
      let r; try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: gc }) }); } catch (e) { lastErr = new Error('Network error: ' + e.message); continue; }
      if (!r.ok) { const t = await r.text(); if (/API key|API_KEY/i.test(t) && (r.status === 400 || r.status === 403)) throw new Error('Key rejected by Google'); if (r.status === 400 && useSchema && /schema/i.test(t)) { useSchema = false; i--; continue; } lastErr = new Error(`${m}: HTTP ${r.status}`); continue; }
      const j = await r.json(), text = (j?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
      if (!text) { lastErr = new Error(`${m}: empty reply`); continue; } S.lastModel = m; return parseJSON(text); }
    throw lastErr || new Error('No Gemini model answered');
  }
  /* a small Gemini box a tool can drop anywhere: opts = { title, help, placeholder, system, schema, user(prompt), apply(json) -> message, fallback(prompt) } */
  function aiBox(el, o) {
    const box = h('div', { class: 'mm-ai' }, h('div', { class: 'mm-ai-t' }, 'GEMINI · ' + (o.title || 'ASK')), o.help ? h('div', { class: 'mm-ai-help' }, o.help) : null,
      h('textarea', { class: 'mm-ai-p', placeholder: o.placeholder || '' }), h('div', { class: 'mm-ai-row' }, h('button', { class: 'mm-ai-ask' }, o.button || 'ASK GEMINI'), h('span', { class: 'mm-ai-st' }, 'No key? The built-in version still works.')),
      h('div', { class: 'mm-ai-out' }),
      h('details', {}, h('summary', {}, 'key & model'), h('div', { class: 'mm-ai-help' }, 'Free key from aistudio.google.com/apikey. Stored only in this browser (shared with SR-12 and the other tools) and sent only to Google.'), h('input', { class: 'mm-ai-key', type: 'password', placeholder: 'Google AI Studio key', autocomplete: 'off' }), h('div', { class: 'mm-ai-row' }, h('select', { class: 'mm-ai-model' }), h('button', { class: 'mm-ai-forget' }, 'FORGET KEY'))));
    el.append(box); const q = (s) => box.querySelector(s), ms = q('.mm-ai-model'); MODELS.forEach((m) => ms.append(new Option(m, m))); ms.value = localStorage.getItem('gp.geminiModel') || MODELS[0];
    q('.mm-ai-key').value = localStorage.getItem('sr12.geminiKey') || ''; q('.mm-ai-forget').onclick = () => { localStorage.removeItem('sr12.geminiKey'); q('.mm-ai-key').value = ''; toast('Key removed'); };
    q('.mm-ai-ask').onclick = async () => { const st = q('.mm-ai-st'), p = q('.mm-ai-p').value.trim() || o.placeholder || ''; const k = q('.mm-ai-key').value.trim(); if (k) localStorage.setItem('sr12.geminiKey', k); localStorage.setItem('gp.geminiModel', ms.value);
      if (!localStorage.getItem('sr12.geminiKey')) { st.textContent = 'No key: used the built-in version.'; o.fallback && o.fallback(p); return; }
      st.textContent = 'Asking Gemini…'; q('.mm-ai-ask').disabled = true;
      try { const res = await gemini({ system: o.system, user: o.user ? o.user(p) : p, schema: o.schema, temperature: o.temperature ?? 1 }); const msg = await o.apply(res, p); S.aiApplied = (S.aiApplied || 0) + 1; st.textContent = `Applied (${S.lastModel}).`; q('.mm-ai-out').textContent = msg || ''; if (!S.playing) toggle(true); }
      catch (e) { st.textContent = 'Gemini failed: ' + e.message + '. Built-in version kept.'; console.warn(e); o.fallback && o.fallback(p); } finally { q('.mm-ai-ask').disabled = false; } };
    return box;
  }

  /* ---------- learn panel ---------- */
  function learnHTML(m) {
    const M = m.manifesto, D = m.design, esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<button class="mm-x" aria-label="close">×</button>
<div class="mm-l-col"><div class="mm-l-k">THE MANIFESTO</div><h2>${esc(M.name)}</h2><div class="mm-l-by">${esc(M.author)} · ${esc(M.year)}${M.where ? ' · ' + esc(M.where) : ''}</div>
<ul>${M.ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
${(M.quotes || []).map((q) => `<blockquote>“${esc(q)}”</blockquote>`).join('')}
<div class="mm-l-k">HOW THIS MACHINE READS IT</div><p>${esc(M.system)}</p></div>
<div class="mm-l-col"><div class="mm-l-k">THE DESIGN HOMAGE</div><h2>${esc(D.name)}</h2><div class="mm-l-by">${esc(D.who)} · ${esc(D.era)}</div>
<div class="mm-l-k">HALLMARKS</div><ul>${D.hallmarks.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
<div class="mm-l-k">LOOK UP</div><ul>${D.works.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
<div class="mm-l-k">HOW TO PLAY</div><p>${esc(m.how)}</p>
<p class="mm-l-note">Quotes are short and from the published text in common English translation; everything else is paraphrase. Tool ${esc(m.no)} of Manifesto Machines.</p></div>`;
  }
  let toastT; function toast(msg) { const t = $('#mm-toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }

  /* ---------- init ---------- */
  function init(c) {
    cfg = c; meta = window.MM_META || {}; S.bpm = c.bpm || meta.bpm || 100; S.div = c.div || 4;
    const bar = h('div', { id: 'mm-bar' },
      h('a', { class: 'mm-back', href: 'https://anorthernman-developer.github.io/manifesto-machines/', target: '_blank', rel: 'noopener', title: 'All Manifesto Machines' }, '◂ ALL'),
      h('span', { class: 'mm-no' }, meta.no), h('span', { class: 'mm-name' }, meta.title),
      h('button', { id: 'mm-play', title: 'Space' }, '▶ PLAY'),
      h('label', { class: 'mm-btn', title: 'Pick WAV, AIFF, MP3 files' }, 'SAMPLES', h('input', { id: 'mm-files', type: 'file', accept: 'audio/*,.wav,.aif,.aiff,.aifc,.mp3,.flac,.ogg', multiple: '', hidden: '' })),
      h('label', { class: 'mm-btn', title: 'Pick a folder, e.g. F:\\01 Splice Sounds (a random handful is used)' }, 'FOLDER', h('input', { id: 'mm-folder', type: 'file', webkitdirectory: '', hidden: '' })),
      h('button', { id: 'mm-rec', title: 'R: record to WAV' }, '● REC'),
      h('button', { id: 'mm-learn', title: 'L: learn about the manifesto and the design' }, 'LEARN'),
      h('label', { class: 'mm-vol' }, 'VOL', h('input', { id: 'mm-volume', type: 'range', min: 0, max: 1, step: 0.01, value: localStorage.getItem('mm.vol') || 0.8 })),
      h('span', { id: 'mm-smp' }));
    const dlg = h('div', { id: 'mm-learn-dlg', class: 'mm-hide', html: learnHTML(meta) });
    document.body.append(bar, dlg, h('div', { id: 'mm-toast' }), h('div', { id: 'mm-dropzone' }, 'DROP SAMPLES'));
    $('#mm-play').onclick = () => toggle(); $('#mm-rec').onclick = rec; $('#mm-learn').onclick = () => dlg.classList.toggle('mm-hide'); dlg.querySelector('.mm-x').onclick = () => dlg.classList.add('mm-hide');
    $('#mm-volume').oninput = (e) => { localStorage.setItem('mm.vol', e.target.value); if (vol) vol.gain.value = +e.target.value; };
    $('#mm-files').onchange = (e) => loadFiles(e.target.files); $('#mm-folder').onchange = (e) => loadFiles(e.target.files);
    const dz = $('#mm-dropzone'); let dc = 0;
    addEventListener('dragenter', (e) => { e.preventDefault(); dc++; dz.classList.add('on'); }); addEventListener('dragleave', () => { if (--dc <= 0) { dc = 0; dz.classList.remove('on'); } });
    addEventListener('dragover', (e) => e.preventDefault()); addEventListener('drop', (e) => { e.preventDefault(); dc = 0; dz.classList.remove('on'); if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });
    addEventListener('keydown', (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return; if (e.code === 'Space' && !c.ownSpace) { e.preventDefault(); toggle(); } else if ((e.key === 'r' || e.key === 'R') && !c.ownR) rec(); else if ((e.key === 'l' || e.key === 'L') && !c.ownL) dlg.classList.toggle('mm-hide'); else if (e.key === 'Escape') dlg.classList.add('mm-hide'); else c.key && c.key(e); });
    renderSamples(); setInterval(pump, 25);
    if (c.draw) { const loop = (ts) => { try { c.draw(ts / 1000); } catch (e) { console.error(e); } requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
    try { c.setup && c.setup(); } catch (e) { console.error(e); }
  }
  /* canvas helper: keeps a canvas sized to its box at device pixel ratio; returns {cv, g, w, h} updated each call */
  function canvas(el) { const cv = typeof el === 'string' ? $(el) : el, g = cv.getContext('2d'), o = { cv, g, w: 0, h: 0, fit() { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d) || 1; cv.height = Math.round(r.height * d) || 1; } o.w = r.width; o.h = r.height; g.setTransform(d, 0, 0, d, 0, 0); return o; } }; return o.fit(); }
  /* drag helper: calls fn(x, y, phase, e) in element-relative px for pointer down/move/up */
  function drag(el, fn) { el.addEventListener('pointerdown', (e) => { ensure(); if (ctx.state !== 'running') ctx.resume(); const r = el.getBoundingClientRect(); el.setPointerCapture && el.setPointerCapture(e.pointerId); fn(e.clientX - r.left, e.clientY - r.top, 'down', e); const mv = (ev) => { const r2 = el.getBoundingClientRect(); fn(ev.clientX - r2.left, ev.clientY - r2.top, 'move', ev); }, up = (ev) => { const r2 = el.getBoundingClientRect(); fn(ev.clientX - r2.left, ev.clientY - r2.top, 'up', ev); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); }); }

  return { init, toggle, rec, ensure, toast, aiBox, gemini, tone, noise, play, smp, smpName, setDelay, crusher, drive, onsets, peaks, cloneBuf, canvas, drag, rng, pick, clamp, mtof, deg, SCALES, S, h, $, $$, loadFiles, aiff,
    get ctx() { return ensure(); }, get out() { ensure(); return out; }, get post() { ensure(); return clip; }, get rev() { ensure(); return revIn; }, get dly() { ensure(); return dlyIn; }, get now() { return ctx ? ctx.currentTime : 0; },
    get bpm() { return S.bpm; }, set bpm(v) { S.bpm = clamp(v, 10, 400); }, get playing() { return S.playing; }, get user() { return S.samples.length > 0; }, get fb() { ensure(); return FB; } };
})();
