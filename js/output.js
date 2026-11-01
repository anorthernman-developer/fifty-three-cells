/* the projector window: receives settings and audio frames from the controller and draws them full screen */
(function () {
  const cv = document.getElementById('out'), hint = document.getElementById('hint'), hs = document.getElementById('hs');
  const r = VJ.create(cv, { maxDpr: 2 }), id = Math.random().toString(36).slice(2, 10), seen = new Set(), order = [];
  let lastFrame = 0, got = false;
  function onMsg(m) {
    if (!m || typeof m !== 'object' || !m.t) return;
    if (m.q) { const k = m.sid + ':' + m.q; if (seen.has(k)) return; seen.add(k); order.push(k); if (order.length > 600) seen.delete(order.shift()); }
    if (m.t === 'f') { r.setFrame(m.A); lastFrame = performance.now(); if (!got) { got = true; hs.textContent = 'Connected.'; setTimeout(() => !moving && hint.classList.add('off'), 2500); } }
    else if (m.t === 's') r.setSettings(m.V); else if (m.t === 'logo') r.setLogo(m.src); else if (m.t === 'p') r.setPeaks(m.peaks); else if (m.t === 'c') r.setCells(m.cells);
  }
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('ftc-live') : null;
  if (bc) bc.onmessage = (e) => onMsg(e.data);
  addEventListener('message', (e) => { if (window.opener && e.source === window.opener) onMsg(e.data); });
  const tell = (m) => { m.id = id; try { bc && bc.postMessage(m); } catch (e) {} try { window.opener && window.opener.postMessage(m, '*'); } catch (e) {} };
  tell({ t: 'hello' }); setInterval(() => tell({ t: 'ping' }), 1000); addEventListener('beforeunload', () => tell({ t: 'bye' }));
  // full screen: click or F
  const fs = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); };
  cv.addEventListener('click', fs); addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') fs(); });
  let moving = false, mt; addEventListener('mousemove', () => { document.body.classList.remove('idle'); moving = true; if (got) hint.classList.add('off'); clearTimeout(mt); mt = setTimeout(() => { moving = false; document.body.classList.add('idle'); }, 2000); });
  // idle motion if the controller is not there yet
  function loop(ts) {
    const stale = performance.now() - lastFrame > 2500;
    if (stale) { const t = ts / 1000, spec = Array.from({ length: 48 }, (_, i) => 60 + 50 * Math.sin(t * 1.3 + i * 0.4) * Math.sin(t * 0.37 + i * 0.11)); r.setFrame({ spec, e: 0.05, lo: 0.2 + 0.1 * Math.sin(t), nn: [], wave: Array.from({ length: 96 }, (_, i) => 20 * Math.sin(t * 3 + i * 0.3)) }); if (got) { hs.textContent = 'Lost the controller: is the controller tab still open?'; } }
    try { r.render(ts); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.FTCOUT = window.EFLOUT = { r, get got() { return got; } };
})();
