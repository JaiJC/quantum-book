(function () {
  "use strict";
  function start() {
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var KEY = "qbook.ch25.v2";

  /* ---------- saved progress (silent) ---------- */
  var S = { step: 0, maxStep: 0, pred: null, level: "standard", met: {} };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var k in saved) S[k] = saved[k]; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- physics ---------- */
  var LC = 1.2264259653;                          // nm * sqrt(eV): lambda = h / sqrt(2 m_e E)
  function lam(E) { return LC / Math.sqrt(E); }
  function sinc(x) { return Math.abs(x) < 1e-6 ? 1 : Math.sin(x) / x; }

  // Experiment configuration
  var C = { E: 54, topClosed: false, detector: false, wave: false };

  /* ---------- stage geometry ---------- */
  var stage = $("stage"), cv = $("cv"), ctx = cv.getContext("2d");
  var G = {};                                     // geometry in CSS px
  var dpr = 1;
  function layout() {
    var r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.max(1, r.width), H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var wide = W / H > 1.25;
    var setupW = W * (wide ? 0.66 : 0.6);
    G = { W: W, H: H };
    G.top = H * 0.12; G.bottom = H * 0.9;
    G.cy = (G.top + G.bottom) / 2; G.Hs = (G.bottom - G.top) / 2;
    G.gun = Math.max(58, setupW * 0.1); G.xb = setupW * 0.34; G.xs = setupW * 0.97;
    G.L = G.xs - G.xb;
    G.ds = G.Hs * 0.15;                           // half the slit separation
    G.d = 2 * G.ds; G.a = G.d * 0.26;             // slit width
    G.so = Math.max(5, G.Hs * 0.03);              // half-height of slit opening (drawing)
    G.px0 = W * (wide ? 0.72 : 0.68); G.px1 = W - Math.max(12, W * 0.03);
    G.K = 0.29 * G.Hs * G.d / G.L;                // visual wavelength at 54 eV, px
    buildPanel(); buildSampler(); buildField(); computeTargets(); buildBackdrop();
  }
  // static backdrop: lab-bench dot grid + vignette, drawn once per layout
  var bd = document.createElement("canvas"), bdx = bd.getContext("2d");
  function buildBackdrop() {
    bd.width = cv.width; bd.height = cv.height; bdx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = G.W, H = G.H;
    var bg = bdx.createRadialGradient(W * 0.38, G.cy, 10, W * 0.38, G.cy, Math.max(W, H) * 0.75);
    bg.addColorStop(0, "#111833"); bg.addColorStop(0.55, "#090c1b"); bg.addColorStop(1, "#04050a");
    bdx.fillStyle = bg; bdx.fillRect(0, 0, W, H);
    bdx.fillStyle = "rgba(160,175,255,0.07)";
    for (var y = 14; y < H; y += 26) for (var x = 14; x < W; x += 26) bdx.fillRect(x, y, 1.2, 1.2);
    var fl = bdx.createLinearGradient(0, 0, W, 0); fl.addColorStop(0, "rgba(143,162,255,0)"); fl.addColorStop(0.5, "rgba(143,162,255,.18)"); fl.addColorStop(1, "rgba(143,162,255,0)");
    bdx.fillStyle = fl; bdx.fillRect(0, G.cy + G.Hs + 34, W, 1);
  }
  function Lam(E) { return G.K * lam(E) / lam(54); }

  // Wave amplitude factor from one slit (single-slit envelope), signed
  function slitAmp(y, ys, L) { var r = Math.hypot(L, y - ys), s = (y - ys) / r; return { r: r, A: sinc(Math.PI * G.a * s / Lam(C.E)) }; }
  function intensityAt(y, E, cfg) {
    var Lm = G.K * lam(E) / lam(54);
    var r1 = Math.hypot(G.L, y - (G.cy - G.ds)), r2 = Math.hypot(G.L, y - (G.cy + G.ds));
    var A1 = sinc(Math.PI * G.a * ((y - (G.cy - G.ds)) / r1) / Lm), A2 = sinc(Math.PI * G.a * ((y - (G.cy + G.ds)) / r2) / Lm);
    if (cfg.topClosed) return A2 * A2;
    if (cfg.detector) return A1 * A1 + A2 * A2;
    return A1 * A1 + A2 * A2 + 2 * A1 * A2 * Math.cos(2 * Math.PI * (r1 - r2) / Lm);
  }

  /* ---------- sampling where electrons land ---------- */
  var NB = 700, cdf = new Float64Array(NB + 1);
  function buildSampler() {
    cdf[0] = 0;
    for (var i = 0; i < NB; i++) { var y = G.cy - G.Hs + (i + 0.5) / NB * 2 * G.Hs; cdf[i + 1] = cdf[i] + Math.max(0, intensityAt(y, C.E, C)); }
  }
  function sampleU() {
    var t = Math.random() * cdf[NB], lo = 0, hi = NB;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cdf[m] < t) lo = m; else hi = m; }
    return -1 + (lo + Math.random()) / NB * 2;    // -1..1 across the screen
  }
  function whichSlit(u) {                           // with detectors: pick a slit with the right odds
    var y = G.cy + u * G.Hs, r1 = Math.hypot(G.L, y - (G.cy - G.ds)), r2 = Math.hypot(G.L, y - (G.cy + G.ds));
    var A1 = sinc(Math.PI * G.a * ((y - (G.cy - G.ds)) / r1) / Lam(C.E)), A2 = sinc(Math.PI * G.a * ((y - (G.cy + G.ds)) / r2) / Lam(C.E));
    return Math.random() * (A1 * A1 + A2 * A2) < A1 * A1 ? 1 : 2;
  }

  /* ---------- hits ---------- */
  var hitsU = [], hitsV = [], HB = 90, hist = new Float32Array(HB);
  var pc = document.createElement("canvas"), pctx = pc.getContext("2d");
  function buildPanel() {
    pc.width = Math.max(1, Math.round((G.px1 - G.px0) * dpr)); pc.height = Math.max(1, Math.round(2 * G.Hs * dpr));
    pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pc.width, pc.height);
    for (var i = 0; i < hitsU.length; i++) dot(hitsU[i], hitsV[i]);
  }
  function dot(u, v) {
    var x = (0.06 + v * 0.88) * pc.width, y = (u + 1) / 2 * pc.height, r = 1.5 * dpr;
    pctx.globalCompositeOperation = "lighter";
    pctx.fillStyle = "rgba(255,181,71,0.14)"; pctx.beginPath(); pctx.arc(x, y, r * 2.8, 0, 6.2832); pctx.fill();
    pctx.fillStyle = "rgba(255,222,170,0.95)"; pctx.fillRect(x - r / 2, y - r / 2, r, r);
    pctx.globalCompositeOperation = "source-over";
  }
  function addHit(u) {
    var v = Math.random(); hitsU.push(u); hitsV.push(v); dot(u, v);
    hist[Math.min(HB - 1, Math.max(0, Math.floor((u + 1) / 2 * HB)))]++;
    if (hitsU.length > 40000) { hitsU = hitsU.slice(-30000); hitsV = hitsV.slice(-30000); rebuildHist(); buildPanel(); }
  }
  function rebuildHist() { hist.fill(0); for (var i = 0; i < hitsU.length; i++) hist[Math.min(HB - 1, Math.max(0, Math.floor((hitsU[i] + 1) / 2 * HB)))]++; }
  function addMany(n) { for (var i = 0; i < n; i++) addHit(sampleU()); changed(); }
  function clearHits() { hitsU = []; hitsV = []; hist.fill(0); flights = []; buildPanel(); changed(); }

  /* ---------- wave field ---------- */
  var CELL = 3, wc = document.createElement("canvas"), wctx = wc.getContext("2d"), field = null, img = null;
  function buildField() {
    var gw = Math.max(2, Math.ceil(G.xs / CELL)), gh = Math.max(2, Math.ceil((2 * G.Hs + 40) / CELL));
    wc.width = gw; wc.height = gh; img = wctx.createImageData(gw, gh);
    var Lm = Lam(C.E), n = gw * gh, y0 = G.cy - G.Hs - 20;
    field = { gw: gw, gh: gh, y0: y0, ph1: new Float32Array(n), ph2: new Float32Array(n), a1: new Float32Array(n), a2: new Float32Array(n), left: new Uint8Array(n) };
    for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
      var x = (i + 0.5) * CELL, y = y0 + (j + 0.5) * CELL, idx = j * gw + i;
      if (x < G.xb) { field.left[idx] = x > G.gun + 40 && Math.abs(y - G.cy) < G.Hs * 0.55 ? 1 : 2; field.ph1[idx] = 2 * Math.PI * x / Lm; continue; }
      var dx = x - G.xb + 1;
      var r1 = Math.hypot(dx, y - (G.cy - G.ds)), r2 = Math.hypot(dx, y - (G.cy + G.ds));
      var fall1 = Math.min(1, Math.sqrt(Lm / r1) * 1.3), fall2 = Math.min(1, Math.sqrt(Lm / r2) * 1.3);
      field.ph1[idx] = 2 * Math.PI * r1 / Lm; field.ph2[idx] = 2 * Math.PI * r2 / Lm;
      field.a1[idx] = sinc(Math.PI * G.a * ((y - (G.cy - G.ds)) / r1) / Lm) * fall1;
      field.a2[idx] = sinc(Math.PI * G.a * ((y - (G.cy + G.ds)) / r2) / Lm) * fall2;
    }
  }
  function paintField(t) {
    var d = img.data, n = field.gw * field.gh, w = 2.2 * t, open1 = !C.topClosed;
    for (var idx = 0; idx < n; idx++) {
      var v;
      var lf = field.left[idx];
      if (lf === 2) v = 0;
      else if (lf === 1) v = 0.28 * Math.cos(field.ph1[idx] - w);
      else v = 1.15 * ((open1 ? field.a1[idx] * Math.cos(field.ph1[idx] - w) : 0) + field.a2[idx] * Math.cos(field.ph2[idx] - w));
      var o = idx * 4, m = Math.min(1, Math.abs(v)), al = Math.pow(m, 0.75);
      if (v > 0) { d[o] = 255; d[o + 1] = 178; d[o + 2] = 74; d[o + 3] = al * 235; }
      else { d[o] = 120; d[o + 1] = 140; d[o + 2] = 255; d[o + 3] = al * 95; }
    }
    wctx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(wc, 0, field.y0, field.gw * CELL, field.gh * CELL); ctx.restore();
  }

  /* ---------- target: dark stripes at 54 eV ---------- */
  var targets = [];
  function computeTargets() {
    targets = []; var cfg = { topClosed: false, detector: false }, N = 900, prev = 1e9, cur, next, max = 0, vals = [];
    for (var i = 0; i <= N; i++) { var y = G.cy - G.Hs + i / N * 2 * G.Hs; vals.push(intensityAt(y, 54, cfg)); max = Math.max(max, vals[i]); }
    for (i = 1; i < N; i++) { prev = vals[i - 1]; cur = vals[i]; next = vals[i + 1]; if (cur <= prev && cur < next && cur < 0.08 * max) targets.push(-1 + i / N * 2); }
  }

  /* ---------- flights (single electrons you can watch) ---------- */
  var flights = [];
  function fireOne(fast) {
    var u = sampleU(), slit = C.detector ? whichSlit(u) : (C.topClosed ? 2 : 0);
    flights.push({ t0: performance.now(), dur: fast ? 520 : 1300, u: u, slit: slit, landed: false, fast: !!fast });
  }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function label(text, x, y, align, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.font = "500 11px JetBrains Mono, monospace"; ctx.textAlign = align || "center";
    ctx.fillStyle = "#9aa3c2"; ctx.fillText(text, x, y); ctx.restore();
  }
  var detFlash = [0, 0, 0];
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = G.W, H = G.H, cy = G.cy, Hs = G.Hs;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bd, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (C.wave && field) paintField(now / 1000);

    // beam axis
    ctx.strokeStyle = "rgba(143,162,255,0.18)"; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(G.gun + 34, cy); ctx.lineTo(G.xb, cy); ctx.stroke(); ctx.setLineDash([]);

    // gun
    var gg = ctx.createLinearGradient(0, cy - 26, 0, cy + 26); gg.addColorStop(0, "#3a4478"); gg.addColorStop(0.5, "#202851"); gg.addColorStop(1, "#141a36");
    ctx.fillStyle = gg; rr(G.gun - 40, cy - 24, 66, 48, 10); ctx.fill();
    ctx.strokeStyle = "rgba(170,185,255,.45)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#2b3466"; rr(G.gun + 20, cy - 11, 12, 22, 3); ctx.fill();
    for (var c0 = 0; c0 < 3; c0++) { ctx.strokeStyle = "rgba(255,181,71," + (0.25 + 0.15 * c0) + ")"; ctx.beginPath(); ctx.moveTo(G.gun - 26 + c0 * 14, cy - 24); ctx.lineTo(G.gun - 26 + c0 * 14, cy + 24); ctx.stroke(); }
    var breathe = 0.75 + 0.25 * Math.sin(now / 700);
    var glow = ctx.createRadialGradient(G.gun + 32, cy, 0, G.gun + 32, cy, 22 * breathe); glow.addColorStop(0, "rgba(255,200,120,.95)"); glow.addColorStop(1, "rgba(255,181,71,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(G.gun + 32, cy, 22, 0, 6.2832); ctx.fill();

    // wall with two slits
    var wallTop = cy - Hs - 14, wallBot = cy + Hs + 14, s1 = cy - G.ds, s2 = cy + G.ds, so = G.so, bw = 14;
    var wg = ctx.createLinearGradient(G.xb - bw / 2, 0, G.xb + bw / 2, 0); wg.addColorStop(0, "#4b5690"); wg.addColorStop(0.45, "#2c3462"); wg.addColorStop(1, "#1a1f3e");
    ctx.fillStyle = wg;
    rr(G.xb - bw / 2, wallTop, bw, s1 - so - wallTop, 3); ctx.fill();
    rr(G.xb - bw / 2, s1 + so, bw, s2 - so - s1 - so, 3); ctx.fill();
    rr(G.xb - bw / 2, s2 + so, bw, wallBot - s2 - so, 3); ctx.fill();
    [s1, s2].forEach(function (sy, k) {
      if (k === 0 && C.topClosed) return;
      var sg = ctx.createRadialGradient(G.xb, sy, 0, G.xb, sy, 26); sg.addColorStop(0, "rgba(255,200,120,.35)"); sg.addColorStop(1, "rgba(255,181,71,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(G.xb, sy, 26, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "rgba(255,200,130,.85)"; ctx.fillRect(G.xb - bw / 2, sy - so - 1.5, bw, 1.5); ctx.fillRect(G.xb - bw / 2, sy + so, bw, 1.5);
    });
    if (C.topClosed) { ctx.fillStyle = "#8fa2ff"; ctx.fillRect(G.xb - bw / 2 - 2, s1 - so - 1, bw + 4, 2 * so + 2); }
    if (S.step === 5 && !C.topClosed) { var pulse = 0.5 + 0.5 * Math.sin(now / 250); ctx.strokeStyle = "rgba(143,162,255," + (0.3 + 0.5 * pulse) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(G.xb, s1, 16 + 4 * pulse, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1; }
    if (C.detector) [1, 2].forEach(function (k) {
      var y = k === 1 ? s1 : s2, f = Math.max(0, 1 - (now - detFlash[k]) / 450);
      ctx.fillStyle = "rgba(110,231,168," + (0.25 + 0.75 * f) + ")"; ctx.beginPath(); ctx.arc(G.xb - 22, y, 6 + 6 * f, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "rgba(110,231,168,.5)"; ctx.beginPath(); ctx.arc(G.xb - 22, y, 9, 0, 6.2832); ctx.stroke();
    });

    // side-on screen with a profile of where hits landed
    var scg = ctx.createLinearGradient(G.xs - 4, 0, G.xs + 4, 0); scg.addColorStop(0, "#3a4478"); scg.addColorStop(1, "#1b2142");
    ctx.fillStyle = scg; rr(G.xs - 4, cy - Hs, 8, 2 * Hs, 3); ctx.fill();
    var hmax = 12; for (var i = 0; i < HB; i++) hmax = Math.max(hmax, hist[i]);
    if (hmax > 0) {
      ctx.fillStyle = "rgba(255,181,71,.55)";
      for (i = 0; i < HB; i++) { var len = hist[i] / hmax * Math.min(46, G.L * 0.22); if (len > 0.5) ctx.fillRect(G.xs - 4 - len, cy - Hs + i / HB * 2 * Hs, len, 2 * Hs / HB - 0.6); }
    }

    // fan linking the side screen to the face-on panel
    ctx.strokeStyle = "rgba(143,162,255,.14)"; ctx.beginPath();
    ctx.moveTo(G.xs + 3, cy - Hs); ctx.lineTo(G.px0, cy - Hs); ctx.moveTo(G.xs + 3, cy + Hs); ctx.lineTo(G.px0, cy + Hs); ctx.stroke();

    // face-on panel
    ctx.fillStyle = "#070912"; rr(G.px0, cy - Hs, G.px1 - G.px0, 2 * Hs, 10); ctx.fill();
    ctx.strokeStyle = "rgba(160,175,255,.22)"; ctx.stroke();
    ctx.save(); rr(G.px0, cy - Hs, G.px1 - G.px0, 2 * Hs, 10); ctx.clip();
    ctx.drawImage(pc, G.px0, cy - Hs, G.px1 - G.px0, 2 * Hs);
    var sheen = ctx.createLinearGradient(G.px0, cy - Hs, G.px1, cy + Hs); sheen.addColorStop(0, "rgba(160,175,255,.06)"); sheen.addColorStop(0.5, "rgba(160,175,255,0)"); sheen.addColorStop(1, "rgba(160,175,255,.04)");
    ctx.fillStyle = sheen; ctx.fillRect(G.px0, cy - Hs, G.px1 - G.px0, 2 * Hs); ctx.restore();

    // targets (step 9)
    if (S.step === 8) {
      ctx.strokeStyle = "#6ee7a8"; ctx.lineWidth = 2;
      targets.forEach(function (u) {
        var y = cy + u * Hs;
        ctx.beginPath(); ctx.moveTo(G.px0 - 10, y); ctx.lineTo(G.px0 + 6, y); ctx.moveTo(G.px1 - 6, y); ctx.lineTo(G.px1 + 6, y); ctx.moveTo(G.xs + 4, y); ctx.lineTo(G.xs + 14, y); ctx.stroke();
      });
      ctx.lineWidth = 1;
    }

    // electrons in flight
    var Lm = Lam(C.E);
    for (var f = flights.length - 1; f >= 0; f--) {
      var F = flights[f], p = (now - F.t0) / F.dur;
      if (p >= 1) { flights.splice(f, 1); continue; }
      var yHit = cy + F.u * Hs;
      if (p < 0.3) {
        var q = p / 0.3, x = G.gun + 32 + (G.xb - G.gun - 32) * q;
        var bl = ctx.createRadialGradient(x, cy, 0, x, cy, F.fast ? 7 : 11); bl.addColorStop(0, "rgba(255,230,180,1)"); bl.addColorStop(1, "rgba(255,181,71,0)");
        ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(x, cy, F.fast ? 7 : 11, 0, 6.2832); ctx.fill();
      } else if (p < 0.85) {
        var q2 = (p - 0.3) / 0.55, R = q2 * G.L * 1.08, alpha = (1 - q2) * (F.fast ? 0.35 : 0.85);
        if (F.slit && !F.flashed) { detFlash[F.slit] = now; F.flashed = true; }
        var sources = F.slit === 1 ? [s1] : F.slit === 2 ? [s2] : [s1, s2];
        ctx.save(); ctx.beginPath(); ctx.rect(G.xb, cy - Hs - 20, G.xs - G.xb - 4, 2 * Hs + 40); ctx.clip();
        ctx.lineWidth = F.fast ? 1.2 : 2.2;
        sources.forEach(function (sy) {
          for (var c = 0; c < 4; c++) {
            var rad = R - c * Lm; if (rad <= 2) break;
            ctx.strokeStyle = "rgba(255,190,90," + (alpha * (1 - c * 0.24)) + ")";
            ctx.beginPath(); ctx.arc(G.xb, sy, rad, -1.15, 1.15); ctx.stroke();
          }
        });
        ctx.restore(); ctx.lineWidth = 1;
      } else {
        if (!F.landed) { F.landed = true; addHit(F.u); changed(); }
        var q3 = (p - 0.85) / 0.15, ring = 4 + q3 * (F.fast ? 10 : 22);
        ctx.strokeStyle = "rgba(255,220,160," + (1 - q3) + ")"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(G.xs, yHit, ring, 0, 6.2832); ctx.stroke();
        var py = yHit, pxm = G.px0 + (G.px1 - G.px0) * (0.06 + hitsV[hitsV.length - 1] * 0.88);
        ctx.beginPath(); ctx.arc(pxm, py, ring, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1;
      }
    }

    // labels
    var la = S.step === 0 ? 0.5 + 0.5 * Math.abs(Math.sin(now / 600)) : 0.55;
    label("ELECTRON GUN", G.gun - 6, cy + 44, "center", la);
    label("TWO SLITS", G.xb, cy - Hs - 22, "center", la);
    label("SCREEN", G.xs, cy + Hs + 22, "center", la);
    label("SCREEN, FACE ON", (G.px0 + G.px1) / 2, cy + Hs + 22, "center", la);
  }

  /* ---------- firing controls ---------- */
  var holding = false, holdStart = 0, lastSpawn = 0;
  function loop(now) {
    if (holding) {
      var held = now - holdStart, rate = Math.min(16, 1 + held / 140);
      if (now - lastSpawn > 110 && flights.length < 8) { fireOne(true); lastSpawn = now; }
      for (var i = 0; i < Math.floor(rate); i++) addHit(sampleU());
      changed();
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  var raf = requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", function () { if (document.hidden) { cancelAnimationFrame(raf); holding = false; } else raf = requestAnimationFrame(loop); });

  function wireHold(btn) {
    function down(e) { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (_) {} holding = true; holdStart = performance.now(); btn.classList.add("firing"); btn.textContent = "Firing…"; }
    function up() { if (!holding) return; holding = false; btn.classList.remove("firing"); btn.textContent = "Hold to fire"; changed(); }
    btn.addEventListener("pointerdown", down);
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { btn.addEventListener(ev, up); });
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  /* ---------- steps ---------- */
  var steps = [].slice.call(document.querySelectorAll(".step"));
  var N = steps.length;
  var waveSeen = 0;
  function n() { return hitsU.length; }
  function fmt(x) { return x.toLocaleString("en-US"); }
  var defs = [
    { goal: function () { return true; } },
    { goal: function () { return n() >= 1; }, status: function () { return n() ? "<b>" + n() + "</b> fired" : "Waiting for your first electron"; } },
    { goal: function () { return n() >= 10; }, status: function () { return "<b>" + Math.min(n(), 10) + "</b> / 10 electrons"; } },
    { goal: function () { return !!S.pred; } },
    { goal: function () { return n() >= 2000; }, status: function () { return "<b>" + fmt(Math.min(n(), 2000)) + "</b> / 2,000 electrons"; } },
    { goal: function () { return C.topClosed && n() >= 800; }, status: function () { return C.topClosed ? "<b>" + fmt(Math.min(n(), 800)) + "</b> / 800 with one slit" : "Both slits open"; } },
    { goal: function () { return C.wave && waveSeen && performance.now() - waveSeen > 1500; }, status: function () { return C.wave ? "Look behind the wall: bright rays and dark lanes" : "Wave hidden"; } },
    { goal: function () { return C.detector && n() >= 1500; }, status: function () { return C.detector ? "<b>" + fmt(Math.min(n(), 1500)) + "</b> / 1,500 with detectors on" : "Detectors off"; } },
    { goal: function () { return Math.abs(C.E - 54) <= 1 && n() >= 300; }, status: function () { return Math.abs(C.E - 54) <= 1 ? (n() >= 300 ? "Dark stripes on the marks" : "Lined up. Now fire to check: <b>" + n() + "</b> / 300") : "Energy <b>" + C.E + " eV</b>: dark lanes are " + (C.E > 54 ? "too close together" : "too far apart"); } },
    { goal: function () { return true; } }
  ];

  function setConfig(cfg) {
    var before = C.E + "|" + C.topClosed + "|" + C.detector;
    for (var k in cfg) C[k] = cfg[k];
    var after = C.E + "|" + C.topClosed + "|" + C.detector;
    if (before !== after) { buildSampler(); buildField(); clearHits(); }
    syncButtons();
  }
  function enter(i) {
    S.step = i; S.maxStep = Math.max(S.maxStep, i); save();
    holding = false;
    document.querySelectorAll(".btn.hold").forEach(function (b) { b.classList.remove("firing"); b.textContent = "Hold to fire"; });
    if (i <= 7) setConfig({ E: 54, topClosed: false, detector: false, wave: false });
    if (i === 8) { setConfig({ E: 110, topClosed: false, detector: false, wave: true }); setDial(110, true); }
    if (i === 9) setConfig({ E: 54, topClosed: false, detector: false, wave: false });
    if ((i === 5 || i === 6 || i === 7 || i === 9) && n() < 1500) addMany(2000 - n());
    waveSeen = 0;
    steps.forEach(function (s, k) { s.classList.toggle("on", k === i); s.classList.toggle("met", k === i && !!S.met[k]); });
    $("card-body").scrollTop = 0;
    renderProgress(); changed();
  }
  function changed() {
    var i = S.step, d = defs[i], met = d.goal();
    var st = steps[i].querySelector("[data-status]");
    if (st && d.status) st.innerHTML = d.status();
    if (met && !steps[i].classList.contains("met")) {
      steps[i].classList.add("met");
      if (!S.met[i]) { S.met[i] = true; save(); setTimeout(function () { var b = $("card-body"); b.scrollTo({ top: b.scrollHeight, behavior: "smooth" }); }, 120); }
    }
    var ready = met || !!S.met[i];
    var nx = $("next"); nx.classList.toggle("ready", ready); nx.textContent = i === N - 1 ? "Finish chapter" : "Next";
    $("back").disabled = i === 0;
    var tags = [];
    if (C.topClosed) tags.push("one slit"); if (C.detector) tags.push("detectors on"); if (i >= 8) tags.push(C.E + " eV");
    $("hud").textContent = fmt(n()) + " electrons" + (tags.length ? " · " + tags.join(" · ") : "");
  }
  function renderProgress() {
    var p = $("progress"); p.innerHTML = "";
    for (var k = 0; k < N; k++) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", "Step " + (k + 1));
      b.className = k === S.step ? "now" : (k <= S.maxStep ? "done" : ""); b.disabled = k > S.maxStep;
      (function (kk) { b.addEventListener("click", function () { if (kk <= S.maxStep) enter(kk); }); })(k);
      p.appendChild(b);
    }
  }
  var toastT = 0;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2200); }
  $("next").addEventListener("click", function () {
    var i = S.step;
    if (!defs[i].goal() && !S.met[i]) { var d = steps[i].querySelector(".do"); toast(d ? d.textContent : "Finish this step first"); return; }
    if (i < N - 1) enter(i + 1); else toast("Chapter complete. Next up: the wavefunction.");
  });
  $("back").addEventListener("click", function () { if (S.step > 0) enter(S.step - 1); });

  /* ---------- buttons inside steps ---------- */
  function syncButtons() {
    document.querySelectorAll('[data-act="slit"]').forEach(function (b) { b.classList.toggle("on", C.topClosed); b.textContent = C.topClosed ? "Open top slit" : "Close top slit"; });
    document.querySelectorAll('[data-act="wave"]').forEach(function (b) { b.classList.toggle("on", C.wave); b.textContent = C.wave ? "Hide the wave" : "Show the wave"; });
    document.querySelectorAll('[data-act="detector"]').forEach(function (b) { b.classList.toggle("on", C.detector); b.textContent = C.detector ? "Stop watching" : "Watch the slits"; });
  }
  document.querySelectorAll("[data-act]").forEach(function (b) {
    var act = b.getAttribute("data-act");
    if (act === "hold") return wireHold(b);
    b.addEventListener("click", function () {
      if (act === "fire1") { if (flights.length < 12) fireOne(false); }
      else if (act === "burst") { addMany(500); toast("500 more electrons"); }
      else if (act === "slit") { setConfig({ topClosed: !C.topClosed }); toast(C.topClosed ? "Top slit closed. Screen cleared." : "Both slits open. Screen cleared."); }
      else if (act === "wave") { C.wave = !C.wave; if (C.wave) waveSeen = performance.now(); syncButtons(); setTimeout(changed, 1600); }
      else if (act === "detector") { setConfig({ detector: !C.detector }); toast(C.detector ? "Detectors on. Screen cleared." : "Detectors off. Screen cleared."); }
      changed();
    });
  });
  // tap the top slit on the stage to close/open it (step 6)
  stage.addEventListener("pointerdown", function (e) {
    if (S.step !== 5) return;
    var r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - G.xb, y - (G.cy - G.ds)) < 44) { setConfig({ topClosed: !C.topClosed }); changed(); }
  });

  document.querySelectorAll("[data-pred]").forEach(function (b) {
    b.addEventListener("click", function () {
      S.pred = b.getAttribute("data-pred"); save();
      document.querySelectorAll("[data-pred]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      showPredMsg(); changed();
    });
  });
  function showPredMsg() {
    document.querySelectorAll("[data-pred-msg]").forEach(function (p) { p.hidden = p.getAttribute("data-pred-msg") !== (S.pred || "two"); });
    document.querySelectorAll("[data-pred]").forEach(function (o) { o.setAttribute("aria-pressed", String(o.getAttribute("data-pred") === S.pred)); });
  }
  showPredMsg();

  /* ---------- energy dial ---------- */
  var track = $("track"), EMIN = 10, EMAX = 200;
  function setDial(E, silent) {
    E = Math.round(Math.max(EMIN, Math.min(EMAX, E)));
    var f = (E - EMIN) / (EMAX - EMIN);
    $("thumb").style.left = (f * 100) + "%"; $("fill").style.width = (f * 100) + "%";
    $("e-read").textContent = E + " eV"; $("l-read").textContent = "λ = " + lam(E).toFixed(3) + " nm";
    track.setAttribute("aria-valuenow", E);
    if (!silent && E !== C.E) setConfig({ E: E });
    changed();
  }
  function fromPointer(e) { var r = track.getBoundingClientRect(); setDial(EMIN + (e.clientX - r.left) / r.width * (EMAX - EMIN)); }
  var dragging = false;
  track.addEventListener("pointerdown", function (e) { dragging = true; try { track.setPointerCapture(e.pointerId); } catch (_) {} fromPointer(e); });
  track.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
  ["pointerup", "pointercancel"].forEach(function (ev) { track.addEventListener(ev, function () { dragging = false; }); });
  track.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") setDial(C.E - 1); if (e.key === "ArrowRight") setDial(C.E + 1); });
  document.querySelectorAll("[data-de]").forEach(function (b) { b.addEventListener("click", function () { setDial(C.E + +b.getAttribute("data-de")); }); });

  /* ---------- recap ---------- */
  document.querySelectorAll(".flip").forEach(function (b) { b.addEventListener("click", function () { b.classList.toggle("open"); }); });
  $("calc").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = parseFloat(String($("ans").value).replace(",", ".")), fb = $("fb");
    if (isNaN(v)) { fb.className = "fb no"; fb.textContent = "Type a number, like 0.5"; return; }
    if (Math.abs(v - 0.1226) <= 0.002) { fb.className = "fb ok"; fb.textContent = "Right: 1.226 / √100 = 0.1226 nm. About the size of an atom."; }
    else if (Math.abs(v - 1.226) <= 0.02) { fb.className = "fb no"; fb.textContent = "That’s in ångströms. In nanometres it’s 0.1226."; }
    else if (Math.abs(v - 122.6) <= 2) { fb.className = "fb no"; fb.textContent = "That’s in picometres. In nanometres it’s 0.1226."; }
    else { fb.className = "fb no"; fb.textContent = "Not quite. Divide 1.226 by the square root of 100."; }
  });

  /* ---------- depth ---------- */
  var LEVELS = ["intuition", "standard", "deep"], NAMES = { intuition: "Intuition", standard: "Standard", deep: "Deep" };
  function setLevel(l) { S.level = l; root.setAttribute("data-level", l); $("depth-name").textContent = NAMES[l]; save(); }
  $("depth").addEventListener("click", function () { setLevel(LEVELS[(LEVELS.indexOf(S.level) + 1) % 3]); toast("Depth: " + NAMES[S.level]); });
  setLevel(S.level || "standard");

  /* ---------- go ---------- */
  layout();
  if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(stage);
  else window.addEventListener("resize", layout);
  setDial(110, true);
  var jump = /[?&]step=(\d+)/.exec(location.search);
  if (jump) { var js = Math.min(N - 1, Math.max(0, +jump[1] - 1)); S.maxStep = Math.max(S.maxStep, js); S.step = js; }
  enter(Math.min(S.step || 0, N - 1));
  window.__qb = { C: C, S: S, n: n, addMany: addMany, enter: enter, setDial: setDial, targets: function () { return targets; }, intensityAt: intensityAt, G: function () { return G; } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
