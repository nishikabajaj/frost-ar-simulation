/* Marker-based AR (A-Frame + AR.js). Loaded and started only when the user
 * taps "Start camera", so desktop and simulation mode never touch the camera.
 * Under construction: wiring is complete, but real markers/offsets are
 * placeholders in ar-config.js. */
(function (global) {
  'use strict';
  const cfg = global.AR_CONFIG;
  const SCALE = 1.5;                       // canvas resolution multiplier for the AR texture
  let libsReady = null, scene = null, sim = null, running = false, onCamErr = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadLibs() {
    if (libsReady) return libsReady;
    libsReady = cfg.scripts.reduce(function (p, src) {
      return p.then(function () { return loadScript(src); });
    }, Promise.resolve()).then(function () {
      global.AFRAME.registerComponent('live-canvas', {   // re-upload the canvas texture every frame
        tick: function () {
          const mesh = this.el.getObject3D('mesh');
          if (mesh && mesh.material && mesh.material.map) mesh.material.map.needsUpdate = true;
        }
      });
    }).catch(function (e) { libsReady = null; throw e; });
    return libsReady;
  }

  function markerHtml(name, wU, hU) {
    const m = cfg.markers[name], k = cfg.markerSizeCm;
    // Marker plane is XZ: +x right, +z down the marker image. The plane is laid flat into it.
    return '<a-marker id="frost-' + name + '" type="pattern" url="' + m.pattern + '" smooth="true" smoothCount="5">' +
      '<a-plane id="frost-plane-' + name + '" live-canvas width="' + wU + '" height="' + hU + '"' +
      ' rotation="-90 0 0" position="' + (m.offsetCm.x / k) + ' 0 ' + (m.offsetCm.y / k) + '"' +
      ' material="shader: flat; src: #frostArCanvas; transparent: true; side: double"></a-plane></a-marker>';
  }

  function build() {
    const k = cfg.markerSizeCm, ppc = Reactor.PX_PER_CM;
    const wU = (Reactor.W / ppc) / k, hU = (Reactor.H / ppc) / k;
    const cw = Math.round(Reactor.W * SCALE), ch = Math.round(Reactor.H * SCALE);
    document.body.insertAdjacentHTML('beforeend',
      '<a-scene id="frostScene" vr-mode-ui="enabled: false" renderer="alpha: true; antialias: true"' +
      ' arjs="sourceType: webcam; debugUIEnabled: false; cameraParametersUrl: ' + cfg.cameraParamsUrl + ';">' +
      '<a-assets><canvas id="frostArCanvas" width="' + cw + '" height="' + ch + '"></canvas></a-assets>' +
      markerHtml('top', wU, hU) + markerHtml('bottom', wU, hU) +
      '<a-entity camera></a-entity></a-scene>');
    scene = document.getElementById('frostScene');
    sim = new Reactor.Sim(document.getElementById('frostArCanvas'), { scale: SCALE, dimensions: cfg.showDimensions });

    const found = { top: false, bottom: false };
    const pref = cfg.preferMarker, other = pref === 'top' ? 'bottom' : 'top';
    function refresh() {
      document.getElementById('frost-plane-' + other).setAttribute('visible', !found[pref]);
    }
    ['top', 'bottom'].forEach(function (n) {
      const el = document.getElementById('frost-' + n);
      el.addEventListener('markerFound', function () { found[n] = true; refresh(); });
      el.addEventListener('markerLost', function () { found[n] = false; refresh(); });
    });
    return new Promise(function (resolve) {
      if (scene.hasLoaded) resolve(); else scene.addEventListener('loaded', resolve);
    });
  }

  function start(setMsg) {
    if (running) return Promise.resolve();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg('Camera access needs a secure (https) connection.');
      return Promise.reject(new Error('no camera api'));
    }
    setMsg('Starting camera…');
    onCamErr = function () { setMsg('Camera blocked. Allow camera access in browser settings and try again.'); };
    global.addEventListener('camera-error', onCamErr);
    return loadLibs().then(build).then(function () { running = true; setMsg(''); });
  }

  function stop() {
    running = false;
    if (onCamErr) { global.removeEventListener('camera-error', onCamErr); onCamErr = null; }
    document.querySelectorAll('video').forEach(function (v) {
      if (v.srcObject) v.srcObject.getTracks().forEach(function (t) { t.stop(); });
      v.remove();
    });
    if (scene) { scene.remove(); scene = null; }
    sim = null;
    document.documentElement.classList.remove('a-fullscreen', 'a-embedded');
  }

  global.FrostAR = {
    start: start, stop: stop,
    render: function (t) { if (running && sim) sim.render(t); },
    get running() { return running; }
  };
})(window);
