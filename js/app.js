(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const sim = new Reactor.Sim($('simCanvas'), { scale: 2 });
  const steps = Reactor.STEPS;

  /* progress segments */
  const seg = steps.map(function () {
    const i = document.createElement('i'), b = document.createElement('b');
    i.appendChild(b); $('progress').appendChild(i); return b;
  });
  let shown = -1;
  function updateCaption(t) {
    const s = Reactor.stepAt(t);
    if (s.index !== shown) {
      shown = s.index;
      $('capNum').textContent = (s.index + 1) + '/' + steps.length;
      $('capText').textContent = steps[s.index].text;
    }
    seg.forEach(function (b, i) { b.style.width = (i < s.index ? 100 : i === s.index ? s.progress * 100 : 0) + '%'; });
  }

  /* mode switching */
  const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const arAllowed = phone || /[?&]ar=1/.test(location.search);   // ?ar=1 for testing on a laptop webcam
  let mode = 'sim', badge = null;

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    const ar = m === 'ar';
    document.body.classList.toggle('ar', ar);
    $('simView').hidden = ar; $('arView').hidden = !ar;
    $('btnSim').classList.toggle('on', !ar); $('btnAr').classList.toggle('on', ar);
    $('btnSim').setAttribute('aria-pressed', String(!ar)); $('btnAr').setAttribute('aria-pressed', String(ar));
    if (ar) {
      $('arNotice').classList.remove('live'); $('arMsg').textContent = '';
    } else {
      FrostAR.stop();
      if (badge) { badge.remove(); badge = null; }
    }
  }

  $('btnSim').addEventListener('click', function () { setMode('sim'); });
  $('btnAr').addEventListener('click', function () { setMode('ar'); });
  if (!arAllowed) { $('btnAr').disabled = true; $('btnAr').title = 'AR is available on phones'; }

  $('btnStartAr').addEventListener('click', function () {
    FrostAR.start(function (m) { $('arMsg').textContent = m; }).then(function () {
      $('arNotice').classList.add('live');
      badge = document.createElement('div'); badge.className = 'badge'; badge.textContent = 'AR under construction';
      document.body.appendChild(badge);
    }).catch(function (e) {
      if (!$('arMsg').textContent) $('arMsg').textContent = e.message;
    });
  });

  /* shared clock: both modes show the same point in the loop */
  const t0 = performance.now();
  function frame(now) {
    const t = ((now - t0) / 1000) % Reactor.TOTAL;
    if (mode === 'sim') sim.render(t); else FrostAR.render(t);
    updateCaption(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
