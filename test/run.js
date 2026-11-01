// Fifty-Three Cells. End-to-end checks in headless Chrome: audio, sync to the output window (http via BroadcastChannel + postMessage, and file://),
// scenes, start/end handles, presets, MIDI learn for visuals, screenshots. Run: node test/run.js [http|file]
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), mode = process.argv[2] || 'http', BASE = mode === 'file' ? 'file://' + ROOT + '/' : /^https?:/.test(mode) ? mode.replace(/\/?$/, '/') : 'http://127.0.0.1:8099/';
const SHOTS = [ROOT + '/screenshots', '/workspace/inc-screenshots']; SHOTS.forEach((d) => fs.mkdirSync(d, { recursive: true }));
const shot = async (pg, name) => { const p = SHOTS[0] + '/' + name; await pg.screenshot({ path: p }); fs.copyFileSync(p, SHOTS[1] + '/' + name); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage(), errs = [], R = { mode };
  const watch = (pg, tag) => { pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_INTERNET|ERR_NAME|net::/.test(m.text())) errs.push(tag + ': ' + m.text()); }); pg.on('pageerror', (e) => errs.push(tag + ' PAGEERROR ' + e.message)); };
  watch(page, 'controller');
  await ctx.addInitScript(() => { window.__ctx = []; const AC = window.AudioContext; window.AudioContext = class extends AC { constructor(...a) { super(...a); __ctx.push(this); this.__an = this.createAnalyser(); } }; const oc = AudioNode.prototype.connect; AudioNode.prototype.connect = function (d, ...r) { if (d instanceof AudioDestinationNode && this.context.__an && this !== this.context.__an) oc.call(this, this.context.__an); return oc.call(this, d, ...r); }; window.__lvl = () => { const c = __ctx[0], d = new Float32Array(2048); c.__an.getFloatTimeDomainData(d); let p = 0; for (const x of d) p = Math.max(p, Math.abs(x)); return p; }; });
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(800);
  R.layoutDefault = await page.evaluate(() => document.body.className);
  await page.click('#mm-play'); await page.waitForTimeout(3500);
  let pk = 0; for (let i = 0; i < 10; i++) { pk = Math.max(pk, await page.evaluate(() => __lvl())); await page.waitForTimeout(100); } R.audioPeak = +pk.toFixed(3);
  R.counts = await page.evaluate(() => Object.assign({}, EFL.counts)); R.analyserSees = await page.evaluate(() => EFL.r.A.e > 0.001 && EFL.r.A.spec.some((x) => x > 0));
  // open the output window
  const popP = page.waitForEvent('popup', { timeout: 5000 }); await page.click('#mm-bar .efl-out'); const out = await popP; watch(out, 'output'); await out.setViewportSize({ width: 1280, height: 720 }); await out.waitForTimeout(1500);
  R.outputGot = await out.evaluate(() => EFLOUT.got); R.outputPulses = await out.evaluate(() => EFLOUT.r.A.n.p); R.outputNotes = await out.evaluate(() => EFLOUT.r.A.n.n); R.outputCells = await out.evaluate(() => EFLOUT.r.cells.length); R.outputPlayers = await out.evaluate(() => EFLOUT.r.A.players); R.outputPlaying = await out.evaluate(() => EFLOUT.r.A.playing);
  R.connectedLabel = await page.evaluate(() => document.querySelector('.vj-status').textContent);
  // scene by key, text, theme
  await page.keyboard.press('Shift+Digit3'); await page.waitForTimeout(300); R.sceneSync = await out.evaluate(() => EFLOUT.r.V.scene);
  await page.fill('#vjp input[data-key=headline]', 'HELLO {bpm}'); await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(200); R.textSync = await out.evaluate(() => EFLOUT.r.V.headline);
  await page.keyboard.press('t'); await page.waitForTimeout(200); R.themeSync = await out.evaluate(() => EFLOUT.r.V.theme);
  await page.keyboard.press('k'); await page.waitForTimeout(200); R.blackout = await out.evaluate(() => EFLOUT.r.V.blackout); await page.keyboard.press('k');
  await page.keyboard.press('f'); await page.waitForTimeout(200); R.freeze = await out.evaluate(() => EFLOUT.r.V.freeze); await page.keyboard.press('f');
  await page.evaluate(() => { EFL.V.headline = 'CELL {cell}'; EFL.V.theme = 'sleeve'; EFL.changed(); });
  // ensemble: 12 players, unison, edited cell reaches the output
  await page.evaluate(() => MMX.setParam('players', 12)); await page.waitForTimeout(1500); R.players12 = await out.evaluate(() => EFLOUT.r.A.players);
  await page.keyboard.press('u'); await page.waitForTimeout(800); R.unisonCount = await out.evaluate(() => EFLOUT.r.A.n.u);
  await page.evaluate(() => { const i = document.querySelector('#cell'); i.value = '0:1 4:1 7:2'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); }); await page.waitForTimeout(500); R.cellEditSync = await out.evaluate(() => JSON.stringify(EFLOUT.r.cells[0]));
  // every scene renders without errors, in both windows; screenshot the output for each
  const scenes = await page.evaluate(() => VJ.SCENES.map((s) => s.id)); R.scenes = scenes.length;
  for (const [k, id] of scenes.entries()) { await page.evaluate((id) => EFL.setScene(id), id); await out.waitForTimeout(1300); const name = `output-${k + 1}-${id}.png`; await shot(out, name); }
  R.areaMoods = await page.evaluate(async () => { EFL.V.areaMoods = true; EFL.changed(); await new Promise((r) => setTimeout(r, 300)); const ok = EFL.r.V.areaMoods === true; EFL.V.areaMoods = false; EFL.changed(); return ok; });
  // logo upload + brand
  await page.evaluate(() => EFL.setScene('signage'));
  // cycle by bars
  await page.selectOption('#vjp select[data-key=cycle]', 'time'); await page.evaluate(() => { EFL.V.cycleSecs = 2; EFL.changed(); }); const before = await out.evaluate(() => EFLOUT.r.V.scene); await page.waitForTimeout(2600); R.cycleMoved = (await out.evaluate(() => EFLOUT.r.V.scene)) !== before; await page.selectOption('#vjp select[data-key=cycle]', 'off');
  // start/end handles on the vocal slot: load a WAV then drag the START handle
  await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('d'); await page.waitForTimeout(200); R.deckOpen = await page.evaluate(() => !document.querySelector('#mmx-deck').classList.contains('mmx-hide'));
  await page.setInputFiles('.mmx-slot[data-i="0"] input.mmx-file', path.join(__dirname, 'test.wav')); await page.waitForTimeout(600);
  await page.setInputFiles('.mmx-slot[data-i="1"] input.mmx-file', path.join(__dirname, 'test.aif')); await page.waitForTimeout(600);
  await page.evaluate(() => { EFL.V.scopeSlot = 0; EFL.changed(); });
  R.wavAif = await page.evaluate(() => !!MMX.S.slots[0].buf && !!MMX.S.slots[1].buf);
  R.userTimbreName = await out.evaluate(() => EFLOUT.r.A.pl.join('|'));
  const bb = await page.locator('.mmx-slot[data-i="0"] .mmx-wave').boundingBox(); await page.mouse.move(bb.x + 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.25, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.up();
  await page.mouse.move(bb.x + bb.width - 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.8, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.up();
  R.dragRegion = await page.evaluate(() => [MMX.S.slots[0].start, MMX.S.slots[0].end, document.querySelector('.mmx-slot[data-i="0"] input[data-k=start]').value]);
  await page.waitForTimeout(400); R.regionSync = await out.evaluate(() => [EFLOUT.r.A.rs, EFLOUT.r.A.re, EFLOUT.r.peaks.length]);
  await page.locator('.mmx-slot[data-i="0"] .mmx-wave').dblclick(); await page.waitForTimeout(200); R.dblclickReset = await page.evaluate(() => [MMX.S.slots[0].start, MMX.S.slots[0].end]);
  await page.mouse.move(bb.x + 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.up(); await page.mouse.move(bb.x + bb.width - 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.7, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.up();
  await page.keyboard.down('Shift'); await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Shift'); R.shiftMove = await page.evaluate(() => [MMX.S.slots[0].start, MMX.S.slots[0].end].map((x) => +x.toFixed(3)));
  await page.evaluate(() => EFL.setScene('scope')); await page.waitForTimeout(1200); await shot(out, 'output-scope-your-sample.png'); await shot(page, 'deck-start-end-handles.png');
  await page.keyboard.press('d');
  // instrument presets still work
  R.instrPresets = await page.evaluate(() => { MMX.save('t'); MMX.setParam('players', 12); MMX.save('t'); MMX.setParam('players', 3); MMX.load('t'); return MMX.S.state.players === 12; });
  // visuals presets: save, change, load, export
  await page.fill('#vjp .vj-row input[type=text]', 'test show'); await page.evaluate(() => { EFL.V.theme = 'bauhaus'; EFL.changed(); }); await page.click('#vjp .vj-row .vjb:text("SAVE")');
  await page.evaluate(() => { EFL.V.theme = 'swiss'; EFL.changed(); }); await page.click('#vjp .vj-row .vjb:text("LOAD")'); R.vjPreset = await page.evaluate(() => EFL.V.theme);
  const dl = page.waitForEvent('download', { timeout: 4000 }).catch(() => null); await page.click('#vjp .vjb:text("EXPORT JSON")'); const d = await dl; if (d) { const p = path.join(__dirname, 'vj.json'); await d.saveAs(p); const j = JSON.parse(fs.readFileSync(p, 'utf8')); R.vjExport = j.visuals && j.visuals.theme; await page.evaluate(() => { EFL.V.theme = 'acid'; EFL.changed(); }); await page.setInputFiles('#vjp input[type=file][accept^=".json"]', p); await page.waitForTimeout(300); R.vjImport = await page.evaluate(() => EFL.V.theme); fs.unlinkSync(p); }
  // MIDI learn for a visuals action (simulated note)
  R.midiLearn = await page.evaluate(() => { const sel = [...document.querySelectorAll('#vjp select')].find((s) => s.options[0] && /MIDI learn/.test(s.options[0].text)); sel.value = 'blackout'; sel.dispatchEvent(new Event('change')); EFL_midi(70, 1, true); const b0 = EFL.V.blackout; EFL_midi(70, 1, true); const b1 = EFL.V.blackout; EFL_midi(70, 1, true); return !b0 && b1 && !EFL.V.blackout; });
  R.midiVJinLearnList = await page.evaluate(() => MMX.S.ctls.filter((c) => c.type === 'range' && /^VJ/.test(c.o.label)).length);
  // back to a nice look for screenshots
  await page.evaluate(() => { EFL.V.theme = 'sleeve'; EFL.V.scopeSlot = 1; EFL.V.blackout = false; EFL.changed(); EFL.setScene('lanes'); }); await page.waitForTimeout(1200);
  await shot(page, 'split.png'); await shot(out, 'output.png');
  await page.click('#mm-bar .efl-lay:text("STUDIO")'); await page.waitForTimeout(600); await shot(page, 'studio.png');
  await page.click('#mm-bar .efl-lay:text("VISUALS")'); await page.waitForTimeout(800); await shot(page, 'visuals-only.png'); R.visualsMode = await page.evaluate(() => document.body.className);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); R.escBack = await page.evaluate(() => document.body.className);
  // soak
  await page.waitForTimeout(4000); R.fps = await page.evaluate(() => document.querySelector('.vj-status').textContent);
  R.errors = errs; console.log(JSON.stringify(R, null, 1)); fs.writeFileSync(path.join(__dirname, `results-${mode.replace(/[^a-z0-9]+/gi, "_")}.json`), JSON.stringify(R, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
