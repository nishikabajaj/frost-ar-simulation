/* FROST reactor flow animation.
 * Everything drawn is a pure function of loop time t, so the same code
 * drives the browser simulation and the AR overlay.
 * Geometry is in canvas px, 30 px = 1 cm (chamber: 5 cm x 10 cm). */
(function (global) {
  'use strict';

  /* ---------- geometry ---------- */
  const W = 480, H = 760, CX = 240;
  const R = 75;                                   // head radius (2.5 cm)
  const HP = 15;                                  // port half-width (1 cm port)
  const CH_TOP = 190, CH_BOT = 490;               // chamber 10 cm tall
  const IN_L = CX - R, IN_R = CX + R;             // inner wall, 5 cm wide
  const DK = Math.sqrt(R * R - HP * HP);
  const TOP_PIPE_Y1 = CH_TOP - DK, TOP_PIPE_Y0 = TOP_PIPE_Y1 - 45;
  const TOP_VALVE_Y = TOP_PIPE_Y0 - 15;
  const BOT_PIPE_Y0 = CH_BOT + DK, BOT_PIPE_Y1 = BOT_PIPE_Y0 + 45;
  const BOT_VALVE_Y = BOT_PIPE_Y1 + 15;
  const PLATE_TOP = 474, PLATE_H = 8;             // flow distributor / bead support
  const SURF = 300;                               // liquid surface when full
  const D = Math.SQRT1_2;                         // 45 deg angled vent
  const VP0 = { x: CX + R * D, y: CH_TOP - R * D };
  const VE1 = { x: VP0.x + 45 * D, y: VP0.y - 45 * D };
  const VVC = { x: VP0.x + 60 * D, y: VP0.y - 60 * D };
  const VE2 = { x: VP0.x + 75 * D, y: VP0.y - 75 * D };
  const VE3 = { x: VE2.x + 20 * D, y: VE2.y - 20 * D };
  const VEND = { x: W - 8, y: VE3.y };

  /* ---------- timeline (seconds) ---------- */
  const STEPS = [
    { d: 4.0, text: 'Top inlet valve opens and nitrogen flows in' },
    { d: 6.0, text: 'Solvents and reagents flow in; the bottom valve stays closed' },
    { d: 5.0, text: 'Compressed nitrogen flows again so excess reagent coats the beads' },
    { d: 2.0, text: 'Top inlet valve closes' },
    { d: 2.0, text: 'Angled vent valve opens' },
    { d: 9.0, text: 'Gas at the bottom of the beads bubbles up and vents out the top' },
    { d: 2.5, text: 'Angled vent valve closes' },
    { d: 7.0, text: 'Bottom valve opens and liquid flows out' }
  ];
  const START = []; let TOTAL = 0;
  STEPS.forEach(s => { START.push(TOTAL); TOTAL += s.d; });

  /* ---------- helpers ---------- */
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const ramp = (t, a, b) => smooth((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- vessel width profile and liquid volume -> level ---------- */
  function halfW(y) {
    if (y < TOP_PIPE_Y1) return HP;
    if (y < CH_TOP) return Math.max(HP, Math.sqrt(Math.max(0, R * R - (y - CH_TOP) * (y - CH_TOP))));
    if (y <= CH_BOT) return R;
    if (y < BOT_PIPE_Y0) return Math.max(HP, Math.sqrt(Math.max(0, R * R - (y - CH_BOT) * (y - CH_BOT))));
    return HP;
  }
  const dotHalfW = y => (y < TOP_PIPE_Y0 || y > BOT_PIPE_Y1) ? 6 : halfW(y);

  const LV = [];
  (function () {
    let v = 0; const st = 0.5;
    for (let y = BOT_PIPE_Y1; y >= CH_TOP - R; y -= st) {
      LV.push({ y: y, v: v });
      v += Math.PI * halfW(y) * halfW(y) * st;
    }
  })();
  const VFILL = (function () {
    for (let i = 0; i < LV.length; i++) if (LV[i].y <= SURF) return LV[i].v;
    return LV[LV.length - 1].v;
  })();
  function levelAt(P) {
    const v = P * VFILL;
    let lo = 0, hi = LV.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LV[m].v <= v) lo = m; else hi = m; }
    const a = LV[lo], b = LV[hi];
    return lerp(a.y, b.y, clamp((v - a.v) / ((b.v - a.v) || 1), 0, 1));
  }

  /* ---------- beads (resting packing, built once) ---------- */
  const BEADS = (function () {
    const rnd = rng(7), r = 4.8, dx = 2 * r + 1.0, dy = r * 1.74, list = [];
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 15; col++) {
        const x = IN_L + r + 1.5 + col * dx + (row % 2) * dx / 2 + (rnd() - 0.5) * 0.8;
        if (x > IN_R - r - 1) continue;
        const y = PLATE_TOP - r - row * dy + (rnd() - 0.5) * 0.8;
        list.push({
          x0: x, y0: y,
          p1: rnd() * 6.283, p2: rnd() * 6.283, p3: rnd() * 6.283,
          w1: 2.2 + rnd() * 2.2, w2: 2.6 + rnd() * 2.4,
          ax: 3 + rnd() * 3, ay: 3 + rnd() * 4
        });
      }
    }
    return list;
  })();
  const NB = BEADS.length;
  const BED_H = PLATE_TOP - Math.min.apply(null, BEADS.map(b => b.y0));
  const BEAD_R = 4.4;                              // collision radius

  /* ---------- bubbles (step 6) ---------- */
  const BUBBLES = (function () {
    const rnd = rng(11), n = 30, list = [];
    for (let k = 0; k < n; k++) {
      list.push({
        ts: START[5] + 0.4 + k * (5.5 / n) + (rnd() - 0.5) * 0.12,
        r: 3.5 + rnd() * 3.3,
        x0: IN_L + 16 + rnd() * (R * 2 - 32),
        v: 80 + rnd() * 40,
        amp: 2 + rnd() * 4, w: 3 + rnd() * 2, ph: rnd() * 6.283
      });
    }
    return list;
  })();
  const BUB_Y0 = PLATE_TOP - 6;
  BUBBLES.forEach(b => { b.tp = b.ts + (BUB_Y0 - SURF) / b.v; });

  /* ---------- gas dots ---------- */
  const GAS = (function () {
    const rnd = rng(23), list = [];
    for (let i = 0; i < 80; i++) list.push({ xo: (rnd() * 2 - 1) * 0.85, ph: rnd(), sp: 0.8 + rnd() * 0.4, wb: rnd() * 6.283 });
    return list;
  })();
  const GAS_LEN = BOT_PIPE_Y1 + 20;

  /* vent path: headspace -> angled pipe -> exhaust line */
  const VENT_DOTS = (function () {
    const rnd = rng(31), list = [];
    for (let i = 0; i < 26; i++) {
      const xs = CX - 60 + rnd() * 120;
      const pts = [
        { x: xs, y: 285 },
        { x: lerp(xs, VP0.x, 0.55), y: 215 },
        { x: VP0.x - 4, y: VP0.y + 6 },
        VE1, VE2, VE3, VEND
      ];
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      list.push({ pts: pts, cum: cum, ph: rnd(), sp: 0.85 + rnd() * 0.3 });
    }
    return list;
  })();

  /* ---------- state at time t ---------- */
  function liquidP(t) {
    const rise = clamp((t - 4.3) / 5.5, 0, 1);
    const q = clamp((t - 31.0) / 5.0, 0, 1);
    return rise * (1 - smooth(q));
  }

  function stateAt(t) {
    const s = { t: t };
    s.reset = 1 - ramp(t, 36.5, 37.5);
    s.top = ramp(t, 0, 0.8) - ramp(t, START[3], START[3] + 1.2);
    s.vent = ramp(t, START[4], START[4] + 1.2) - ramp(t, START[6], START[6] + 1.2);
    s.bot = ramp(t, START[7], START[7] + 1.0) - ramp(t, START[7] + 6.0, START[7] + 7.0);
    const liqWin = ramp(t, 3.8, 4.2) - ramp(t, 9.8, 10.2);
    s.liqIn = s.top * liqWin;
    s.gasIn = s.top * (1 - liqWin);
    s.P = liquidP(t);
    s.surf = levelAt(s.P);
    s.reach = levelAt(clamp((t - 4.3) / 5.5, 0, 1));
    s.tint = (0.10 * ramp(t, 0.3, 3.8) + 0.10 * ramp(t, 10.2, 14.5) - 0.10 * ramp(t, 17.2, 27.5)) * s.reset;
    s.coatK = ramp(t, 10.5, 14.5);
    s.swellK = ramp(t, 5, 14);

    // bed motion
    const Fb = 0.95 * (ramp(t, 19.4, 21.0) - ramp(t, 26.8, 29.2));
    const F1 = 0.10 * s.gasIn * (1 - ramp(t, 4, 5));
    const bedMid = t < 10 ? clamp(1 - Math.abs(s.surf - 425) / 70, 0, 1) : 0;
    const F2 = 0.30 * bedMid;
    s.F = clamp(Fb + F1 + F2, 0, 1);
    s.E = 0.34 * Fb + 0.06 * F2;

    // venting: pressure burst when valve opens + gas arriving from bubbles
    let sum = 0;
    for (let i = 0; i < BUBBLES.length; i++) {
      const dt = t - BUBBLES[i].tp;
      if (dt > 0) sum += smooth(dt / 0.25) * Math.exp(-dt / 0.9);
    }
    const burst = t > 17.1 ? ramp(t, 17.1, 17.6) * Math.exp(-(t - 17.1) / 1.3) : 0;
    s.ventFlow = s.vent * clamp(burst + (1 - Math.exp(-0.8 * sum)), 0, 1);

    // drain flow
    const q = clamp((t - 31.0) / 5.0, 0, 1);
    s.drain = s.bot * (q > 0 && q < 1 ? (0.15 + 0.85 * 4 * q * (1 - q)) * smooth(q / 0.1) * (1 - smooth((q - 0.9) / 0.1)) : 0);
    return s;
  }

  function stepAt(t) {
    let i = 0;
    for (let k = 0; k < STEPS.length; k++) if (t >= START[k]) i = k;
    return { index: i, progress: clamp((t - START[i]) / STEPS[i].d, 0, 1) };
  }

  /* ---------- drawing primitives ---------- */
  const C = {
    liquid: 'rgba(47,127,209,0.50)',
    liquidSolid: 'rgba(47,127,209,0.88)',
    gas: '0,165,175',
    wall: '#8fa3bb',
    clear: '#b9cce2',
    ring: '#7b8fa8',
    outline: '#34506f',
    pipeFill: '#f7f9fc'
  };

  function vesselPath(ctx) {
    const a = Math.acos(HP / R);                  // 1.3277 rad
    const thL = -Math.PI + a, thR = -a;
    ctx.beginPath();
    ctx.moveTo(CX - HP, TOP_PIPE_Y0);
    ctx.lineTo(CX - HP, CH_TOP + R * Math.sin(thL));
    ctx.arc(CX, CH_TOP, R, thL, -Math.PI, true);
    ctx.lineTo(IN_L, CH_BOT);
    ctx.arc(CX, CH_BOT, R, Math.PI, Math.PI - a, true);
    ctx.lineTo(CX - HP, BOT_PIPE_Y1);
    ctx.lineTo(CX + HP, BOT_PIPE_Y1);
    ctx.lineTo(CX + HP, BOT_PIPE_Y0);
    ctx.arc(CX, CH_BOT, R, a, 0, true);
    ctx.lineTo(IN_R, CH_TOP);
    ctx.arc(CX, CH_TOP, R, 0, thR, true);
    ctx.lineTo(CX + HP, TOP_PIPE_Y0);
    ctx.closePath();
  }

  function tube(ctx, pts, w) {
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = C.wall; ctx.lineWidth = w + 6; ctx.stroke();
    ctx.strokeStyle = C.pipeFill; ctx.lineWidth = w; ctx.stroke();
  }

  function mix(a, b, k) {
    return 'rgb(' + Math.round(lerp(a[0], b[0], k)) + ',' + Math.round(lerp(a[1], b[1], k)) + ',' + Math.round(lerp(a[2], b[2], k)) + ')';
  }

  function drawValve(ctx, x, y, rot, open) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.lineWidth = 1.5; ctx.strokeStyle = C.outline; ctx.lineJoin = 'round';
    ctx.fillStyle = mix([214, 69, 69], [31, 157, 85], open);
    ctx.beginPath();
    ctx.moveTo(-14, -13); ctx.lineTo(0, 0); ctx.lineTo(-14, 13); ctx.closePath();
    ctx.moveTo(14, -13); ctx.lineTo(0, 0); ctx.lineTo(14, 13); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -19); ctx.stroke();
    const hl = lerp(6, 28, open);                  // handle parallel to pipe = open, end-on = closed
    ctx.lineCap = 'round'; ctx.lineWidth = 4.5; ctx.strokeStyle = C.outline;
    ctx.beginPath(); ctx.moveTo(-hl / 2, -19); ctx.lineTo(hl / 2, -19); ctx.stroke();
    ctx.restore();
  }

  function arrow(ctx, x0, y0, x1, y1) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = 7;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    [[x1, y1, a + Math.PI], [x0, y0, a]].forEach(function (e) {
      ctx.beginPath();
      ctx.moveTo(e[0], e[1]);
      ctx.lineTo(e[0] + L * Math.cos(e[2] - 0.4), e[1] + L * Math.sin(e[2] - 0.4));
      ctx.moveTo(e[0], e[1]);
      ctx.lineTo(e[0] + L * Math.cos(e[2] + 0.4), e[1] + L * Math.sin(e[2] + 0.4));
      ctx.stroke();
    });
  }

  function haloText(ctx, str, x, y) {
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(247,249,252,0.9)'; ctx.strokeText(str, x, y);
    ctx.fillText(str, x, y);
  }

  function drawDims(ctx) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = '#34506f'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
    ctx.font = '600 13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const x = 122;
    ctx.beginPath();
    ctx.moveTo(IN_L - 14, CH_TOP); ctx.lineTo(x - 6, CH_TOP);
    ctx.moveTo(IN_L - 14, CH_BOT); ctx.lineTo(x - 6, CH_BOT);
    ctx.stroke();
    arrow(ctx, x, CH_TOP, x, CH_BOT);
    ctx.save(); ctx.translate(x - 11, (CH_TOP + CH_BOT) / 2); ctx.rotate(-Math.PI / 2);
    haloText(ctx, '10 cm', 0, 0); ctx.restore();
    arrow(ctx, IN_L + 2, 214, IN_R - 2, 214);
    haloText(ctx, '5 cm', CX, 226);
    ctx.restore();
  }

  /* ---------- Sim ---------- */
  function Sim(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.scale = opts.scale || 2;
    this.dims = opts.dimensions !== false;
    this.background = opts.background || null;
    canvas.width = Math.round(W * this.scale);
    canvas.height = Math.round(H * this.scale);
    this.ctx = canvas.getContext('2d');
    this.X = new Float32Array(NB);
    this.Y = new Float32Array(NB);
  }

  Sim.prototype.placeBeads = function (s, bubs) {
    const t = s.t, X = this.X, Y = this.Y, lo = IN_L + BEAD_R, hi = IN_R - BEAD_R, fl = PLATE_TOP - BEAD_R;
    for (let i = 0; i < NB; i++) {
      const b = BEADS[i], h = (PLATE_TOP - b.y0) / BED_H, k = 0.4 + 0.6 * h;
      X[i] = b.x0 + s.F * b.ax * k * (Math.sin(b.w1 * t + b.p1) + 0.5 * Math.sin(b.w2 * 1.7 * t + b.p3));
      Y[i] = PLATE_TOP - (PLATE_TOP - b.y0) * (1 + s.E) + s.F * b.ay * k * Math.sin(b.w2 * t + b.p2);
    }
    for (let j = 0; j < bubs.length; j++) {            // rising bubbles push beads aside
      const bb = bubs[j], rr = bb.r + BEAD_R;
      for (let i = 0; i < NB; i++) {
        const dx = X[i] - bb.x, dy = Y[i] - bb.y, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.01, p = rr - d;
          X[i] += dx / d * p; Y[i] += dy / d * p;
        }
      }
    }
    const m2 = 2 * BEAD_R, m2s = m2 * m2;
    for (let it = 0; it < 3; it++) {                   // remove overlaps
      for (let i = 0; i < NB; i++) {
        for (let j = i + 1; j < NB; j++) {
          const dx = X[j] - X[i], dy = Y[j] - Y[i];
          if (dx > m2 || dx < -m2 || dy > m2 || dy < -m2) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 < m2s && d2 > 1e-6) {
            const d = Math.sqrt(d2), p = (m2 - d) / 2 / d;
            X[i] -= dx * p; Y[i] -= dy * p; X[j] += dx * p; Y[j] += dy * p;
          }
        }
      }
      for (let i = 0; i < NB; i++) {
        X[i] = X[i] < lo ? lo : X[i] > hi ? hi : X[i];
        Y[i] = Y[i] > fl ? fl : Y[i];
      }
    }
  };

  Sim.prototype.render = function (t) {
    const s = stateAt(t), ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.background) { ctx.fillStyle = this.background; ctx.fillRect(0, 0, W, H); }

    // outer tubes
    tube(ctx, [{ x: CX, y: -6 }, { x: CX, y: TOP_PIPE_Y0 }], 12);
    tube(ctx, [{ x: CX, y: BOT_PIPE_Y1 }, { x: CX, y: H + 6 }], 12);

    // bubbles at time t
    const bubs = [];
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i], age = t - b.ts;
      if (age < 0) continue;
      const y = BUB_Y0 - b.v * age;
      if (y > s.surf) {
        const prog = (BUB_Y0 - y) / (BUB_Y0 - SURF);
        bubs.push({ x: b.x0 + b.amp * Math.sin(b.w * age + b.ph), y: y, r: b.r * (1 + 0.35 * prog) });
      }
    }
    this.placeBeads(s, bubs);

    /* ----- interior ----- */
    ctx.save();
    vesselPath(ctx); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(0, 0, W, H);
    if (s.tint > 0.002) { ctx.fillStyle = 'rgba(' + C.gas + ',' + s.tint + ')'; ctx.fillRect(0, 0, W, s.surf + 2); }

    // liquid body with moving surface
    if (s.surf < BOT_PIPE_Y1 - 0.5) {
      const dimple = 5 * s.gasIn * ramp(t, 10, 10.6) * smooth((420 - s.surf) / 20);
      const amp = 0.7 + 2.2 * s.liqIn + 2.2 * s.F;
      ctx.beginPath();
      for (let x = IN_L - 12; x <= IN_R + 12; x += 4) {
        const y = s.surf + amp * Math.sin(x * 0.09 + t * 3.1) + 0.5 * Math.sin(x * 0.17 - t * 2.3) - dimple * Math.exp(-Math.pow((x - CX) / 55, 2));
        x === IN_L - 12 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(IN_R + 12, H); ctx.lineTo(IN_L - 12, H); ctx.closePath();
      ctx.fillStyle = C.liquid; ctx.fill();
    }

    // plate (flow distributor)
    ctx.fillStyle = '#6b7a8c';
    for (let x = IN_L + 3; x < IN_R - 2; x += 14) ctx.fillRect(x, PLATE_TOP, Math.min(9, IN_R - x), PLATE_H);
    ctx.fillRect(IN_L, PLATE_TOP, 3, PLATE_H); ctx.fillRect(IN_R - 3, PLATE_TOP, 3, PLATE_H);

    ctx.restore();

    // liquid stream from the top
    if (s.liqIn > 0.02) {
      const w = 9 * s.liqIn * (0.92 + 0.08 * Math.sin(t * 9));
      ctx.fillStyle = C.liquidSolid;
      ctx.fillRect(CX - w / 2, -6, w, s.surf + 6);
    }

    // nitrogen streaks (above liquid surface only)
    if (s.gasIn > 0.01) {
      ctx.lineCap = 'round';
      for (let i = 0; i < GAS.length; i++) {
        const g = GAS[i];
        const y = ((t * 170 * g.sp + g.ph * GAS_LEN) % GAS_LEN) - 10;
        if (y > s.surf - 2 || y < -8) continue;
        const x = CX + g.xo * dotHalfW(y) + Math.sin(y * 0.05 + g.wb) * 1.5;
        const a = s.gasIn * 0.85 * clamp((s.surf - y) / 14, 0, 1);
        ctx.strokeStyle = 'rgba(' + C.gas + ',' + a + ')'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x, y - 9 * g.sp); ctx.lineTo(x, y); ctx.stroke();
      }
    }

    ctx.save();
    vesselPath(ctx); ctx.clip();

    // splash where the stream lands
    if (s.liqIn > 0.05 && s.surf < BOT_PIPE_Y1 - 2) {
      for (let k = 0; k < 2; k++) {
        const ph = (t * 1.6 + k * 0.5) % 1, rx = 6 + 28 * ph;
        ctx.strokeStyle = 'rgba(47,127,209,' + (1 - ph) * 0.6 * s.liqIn + ')'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(CX, s.surf, rx, rx * 0.2, 0, 0, 6.283); ctx.stroke();
      }
    }

    // beads
    for (let i = 0; i < NB; i++) {
      const b = BEADS[i];
      const wet = smooth((b.y0 - s.reach) / 14 + 0.5) * s.reset;
      const coat = wet * (0.35 + 0.65 * s.coatK), rr = 4.4 + 0.4 * wet * s.swellK;
      const x = this.X[i], y = this.Y[i];
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283);
      ctx.fillStyle = '#f3e8c8'; ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = '#b8a672'; ctx.stroke();
      if (coat > 0.02) {
        ctx.lineWidth = 0.9 + 1.3 * coat; ctx.strokeStyle = 'rgba(40,110,200,' + (0.2 + 0.75 * coat) + ')'; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 1.2, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    }

    // submerged tint over beads
    if (s.surf < BOT_PIPE_Y1 - 0.5) { ctx.fillStyle = 'rgba(47,127,209,0.16)'; ctx.fillRect(IN_L - 12, s.surf, R * 2 + 24, H); }

    // bubbles + pops
    for (let i = 0; i < bubs.length; i++) {
      const b = bubs[i];
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283);
      ctx.fillStyle = 'rgba(' + C.gas + ',0.18)'; ctx.fill();
      ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(' + C.gas + ',0.9)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, 6.283);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }
    for (let i = 0; i < BUBBLES.length; i++) {
      const dt = t - BUBBLES[i].tp;
      if (dt > 0 && dt < 0.5) {
        const k = dt / 0.5, rx = 4 + 14 * k;
        ctx.strokeStyle = 'rgba(' + C.gas + ',' + (1 - k) * 0.7 + ')'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(BUBBLES[i].x0, s.surf, rx, rx * 0.25, 0, 0, 6.283); ctx.stroke();
      }
    }
    ctx.restore();

    /* ----- vessel walls ----- */
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    vesselPath(ctx); ctx.strokeStyle = C.wall; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = C.clear; ctx.lineWidth = 6;           // clear-resin body
    ctx.beginPath(); ctx.moveTo(IN_L, CH_TOP); ctx.lineTo(IN_L, CH_BOT); ctx.moveTo(IN_R, CH_TOP); ctx.lineTo(IN_R, CH_BOT); ctx.stroke();
    [CH_TOP, CH_BOT].forEach(function (y) {                  // flanges
      ctx.fillStyle = C.ring; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.rect(IN_L - 8, y - 7, R * 2 + 16, 14); ctx.fill(); ctx.stroke();
    });

    /* ----- vent pipe + exhaust ----- */
    tube(ctx, [{ x: VP0.x - 7 * D, y: VP0.y + 7 * D }, VE1], HP * 2);
    tube(ctx, [VE2, VE3, VEND], 12);
    if (s.ventFlow > 0.01) {
      ctx.lineCap = 'round';
      for (let i = 0; i < VENT_DOTS.length; i++) {
        const v = VENT_DOTS[i], tot = v.cum[v.cum.length - 1];
        const d = ((t * 150 * v.sp + v.ph * tot) % tot);
        let k = 1; while (k < v.cum.length - 1 && v.cum[k] < d) k++;
        const f = (d - v.cum[k - 1]) / (v.cum[k] - v.cum[k - 1]);
        const x = lerp(v.pts[k - 1].x, v.pts[k].x, f), y = lerp(v.pts[k - 1].y, v.pts[k].y, f);
        ctx.fillStyle = 'rgba(' + C.gas + ',' + 0.85 * s.ventFlow + ')';
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.283); ctx.fill();
      }
    }

    /* ----- valves ----- */
    drawValve(ctx, CX, TOP_VALVE_Y, Math.PI / 2, s.top);
    drawValve(ctx, VVC.x, VVC.y, -Math.PI / 4, s.vent);
    drawValve(ctx, CX, BOT_VALVE_Y, Math.PI / 2, s.bot);

    /* ----- outlet stream ----- */
    if (s.drain > 0.02) {
      const w = 9 * s.drain * (0.94 + 0.06 * Math.sin(t * 11));
      ctx.fillStyle = C.liquidSolid;
      ctx.fillRect(CX - w / 2, BOT_VALVE_Y + 15, w, H - BOT_VALVE_Y - 15);
    }

    if (this.dims) drawDims(ctx);
  };

  global.Reactor = { Sim: Sim, STEPS: STEPS, START: START, TOTAL: TOTAL, stepAt: stepAt, W: W, H: H, PX_PER_CM: 30 };
})(window);
