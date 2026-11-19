(function () {
  "use strict";
  function start() {
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var KEY = "qbook.ch25.v3";

  /* ---------- saved progress (silent) ---------- */
  var S = { beat: 0, pred: null, level: "standard", y: 0 };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var k in saved) S[k] = saved[k]; } catch (e) {}
  var saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 200); }

  /* ---------- physics ---------- */
  var LC = 1.2264259653;                          // nm * sqrt(eV): lambda = h / sqrt(2 m_e E)
  function lam(E) { return LC / Math.sqrt(E); }
  function sinc(x) { return Math.abs(x) < 1e-6 ? 1 : Math.sin(x) / x; }
  var C = { E: 54, topClosed: false, detector: false, wave: false };

  /* ---------- plate geometry ---------- */
  var stage = $("stage"), cv = $("cv"), ctx = cv.getContext("2d");
  var G = {}, dpr = 1;
  function layout() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.max(1, r.width), H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var wide = W / H > 1.25;
    var setupW = W * (wide ? 0.68 : 0.6);
    G = { W: W, H: H };
    G.top = H * (wide ? 0.13 : 0.1); G.bottom = H * (wide ? 0.86 : 0.88);
    G.cy = (G.top + G.bottom) / 2; G.Hs = (G.bottom - G.top) / 2;
    G.gun = Math.max(52, setupW * 0.1); G.xb = setupW * 0.34; G.xs = setupW * 0.97;
    G.L = G.xs - G.xb;
    G.ds = G.Hs * 0.15; G.d = 2 * G.ds; G.a = G.d * 0.26;
    G.so = Math.max(4, G.Hs * 0.03);
    G.px0 = W * (wide ? 0.74 : 0.68); G.px1 = W - Math.max(14, W * 0.03);
    G.K = 0.29 * G.Hs * G.d / G.L;
    buildPanel(); buildSampler(); buildField(); computeTargets(); buildBackdrop();
  }
  function Lam(E) { return G.K * lam(E) / lam(54); }
  function intensityAt(y, E, cfg) {
    var Lm = G.K * lam(E) / lam(54);
    var r1 = Math.hypot(G.L, y - (G.cy - G.ds)), r2 = Math.hypot(G.L, y - (G.cy + G.ds));
    var A1 = sinc(Math.PI * G.a * ((y - (G.cy - G.ds)) / r1) / Lm), A2 = sinc(Math.PI * G.a * ((y - (G.cy + G.ds)) / r2) / Lm);
    if (cfg.topClosed) return A2 * A2;
    if (cfg.detector) return A1 * A1 + A2 * A2;
    return A1 * A1 + A2 * A2 + 2 * A1 * A2 * Math.cos(2 * Math.PI * (r1 - r2) / Lm);
  }

  var bd = document.createElement("canvas"), bdx = bd.getContext("2d");
  function buildBackdrop() {
    bd.width = cv.width; bd.height = cv.height; bdx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bdx.fillStyle = "#000"; bdx.fillRect(0, 0, G.W, G.H);
    var fl = bdx.createLinearGradient(0, 0, G.W, 0); fl.addColorStop(0, "rgba(236,230,218,0)"); fl.addColorStop(0.5, "rgba(236,230,218,.12)"); fl.addColorStop(1, "rgba(236,230,218,0)");
    bdx.fillStyle = fl; bdx.fillRect(0, G.cy + G.Hs + 26, G.W, 1);
  }

  /* ---------- where electrons land ---------- */
  var NB = 700, cdf = new Float64Array(NB + 1);
  function buildSampler() {
    cdf[0] = 0;
    for (var i = 0; i < NB; i++) { var y = G.cy - G.Hs + (i + 0.5) / NB * 2 * G.Hs; cdf[i + 1] = cdf[i] + Math.max(0, intensityAt(y, C.E, C)); }
  }
  function sampleU() {
    var t = Math.random() * cdf[NB], lo = 0, hi = NB;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cdf[m] < t) lo = m; else hi = m; }
    return -1 + (lo + Math.random()) / NB * 2;
  }
  function whichSlit(u) {
    var y = G.cy + u * G.Hs, r1 = Math.hypot(G.L, y - (G.cy - G.ds)), r2 = Math.hypot(G.L, y - (G.cy + G.ds));
    var A1 = sinc(Math.PI * G.a * ((y - (G.cy - G.ds)) / r1) / Lam(C.E)), A2 = sinc(Math.PI * G.a * ((y - (G.cy + G.ds)) / r2) / Lam(C.E));
    return Math.random() * (A1 * A1 + A2 * A2) < A1 * A1 ? 1 : 2;
  }

  /* ---------- hits ---------- */
  var hitsU = [], hitsV = [], HB = 90, hist = new Float32Array(HB);
  var pc = document.createElement("canvas"), pctx = pc.getContext("2d");
  function buildPanel() {
    pc.width = Math.max(1, Math.round((G.px1 - G.px0) * dpr)); pc.height = Math.max(1, Math.round(2 * G.Hs * dpr));
    pctx.clearRect(0, 0, pc.width, pc.height);
    for (var i = 0; i < hitsU.length; i++) dot(hitsU[i], hitsV[i]);
  }
  function dot(u, v) {
    var x = (0.06 + v * 0.88) * pc.width, y = (u + 1) / 2 * pc.height, r = 1.4 * dpr;
    pctx.globalCompositeOperation = "lighter";
    pctx.fillStyle = "rgba(255,170,60,0.13)"; pctx.beginPath(); pctx.arc(x, y, r * 2.8, 0, 6.2832); pctx.fill();
    pctx.fillStyle = "rgba(255,225,175,0.95)"; pctx.fillRect(x - r / 2, y - r / 2, r, r);
    pctx.globalCompositeOperation = "source-over";
  }
  function addHit(u) {
    var v = Math.random(); hitsU.push(u); hitsV.push(v); dot(u, v);
    hist[Math.min(HB - 1, Math.max(0, Math.floor((u + 1) / 2 * HB)))]++;
    if (hitsU.length > 40000) { hitsU = hitsU.slice(-30000); hitsV = hitsV.slice(-30000); rebuildHist(); buildPanel(); }
  }
  function rebuildHist() { hist.fill(0); for (var i = 0; i < hitsU.length; i++) hist[Math.min(HB - 1, Math.max(0, Math.floor((hitsU[i] + 1) / 2 * HB)))]++; }
  function addMany(n) { for (var i = 0; i < n; i++) addHit(sampleU()); changed(); }
  function clearHits() { hitsU = []; hitsV = []; hist.fill(0); flights = []; stream = 0; buildPanel(); changed(); }
  function n() { return hitsU.length; }

  /* ---------- the wave ---------- */
  var CELL = 3, wc = document.createElement("canvas"), wctx = wc.getContext("2d"), field = null, img = null;
  function buildField() {
    var gw = Math.max(2, Math.ceil(G.xs / CELL)), gh = Math.max(2, Math.ceil((2 * G.Hs + 30) / CELL));
    wc.width = gw; wc.height = gh; img = wctx.createImageData(gw, gh);
    var Lm = Lam(C.E), N = gw * gh, y0 = G.cy - G.Hs - 15;
    field = { gw: gw, gh: gh, y0: y0, ph1: new Float32Array(N), ph2: new Float32Array(N), a1: new Float32Array(N), a2: new Float32Array(N), left: new Uint8Array(N) };
    for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
      var x = (i + 0.5) * CELL, y = y0 + (j + 0.5) * CELL, idx = j * gw + i;
      if (x < G.xb) { field.left[idx] = x > G.gun + 40 && Math.abs(y - G.cy) < G.Hs * 0.5 ? 1 : 2; field.ph1[idx] = 2 * Math.PI * x / Lm; continue; }
      var dx = x - G.xb + 1;
      var r1 = Math.hypot(dx, y - (G.cy - G.ds)), r2 = Math.hypot(dx, y - (G.cy + G.ds));
      field.ph1[idx] = 2 * Math.PI * r1 / Lm; field.ph2[idx] = 2 * Math.PI * r2 / Lm;
      field.a1[idx] = sinc(Math.PI * G.a * ((y - (G.cy - G.ds)) / r1) / Lm) * Math.min(1, Math.sqrt(Lm / r1) * 1.3);
      field.a2[idx] = sinc(Math.PI * G.a * ((y - (G.cy + G.ds)) / r2) / Lm) * Math.min(1, Math.sqrt(Lm / r2) * 1.3);
    }
  }
  function paintField(t) {
    var d = img.data, N = field.gw * field.gh, w = 2.2 * t, open1 = !C.topClosed;
    for (var idx = 0; idx < N; idx++) {
      var lf = field.left[idx], v;
      if (lf === 2) v = 0;
      else if (lf === 1) v = 0.26 * Math.cos(field.ph1[idx] - w);
      else v = 1.15 * ((open1 ? field.a1[idx] * Math.cos(field.ph1[idx] - w) : 0) + field.a2[idx] * Math.cos(field.ph2[idx] - w));
      var o = idx * 4, al = Math.pow(Math.min(1, Math.abs(v)), 0.75);
      if (v > 0) { d[o] = 255; d[o + 1] = 176; d[o + 2] = 72; d[o + 3] = al * 230; }
      else { d[o] = 120; d[o + 1] = 80; d[o + 2] = 40; d[o + 3] = al * 70; }
    }
    wctx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(wc, 0, field.y0, field.gw * CELL, field.gh * CELL); ctx.restore();
  }

  /* ---------- the marks for the tuning puzzle (dark stripes at 54 eV) ---------- */
  var targets = [];
  function computeTargets() {
    targets = []; var cfg = { topClosed: false, detector: false }, N = 900, max = 0, vals = [];
    for (var i = 0; i <= N; i++) { vals.push(intensityAt(G.cy - G.Hs + i / N * 2 * G.Hs, 54, cfg)); max = Math.max(max, vals[i]); }
    for (i = 1; i < N; i++) if (vals[i] <= vals[i - 1] && vals[i] < vals[i + 1] && vals[i] < 0.08 * max) targets.push(-1 + i / N * 2);
  }

  /* ---------- single electrons you can follow ---------- */
  var flights = [];
  function fireOne(fast) {
    var u = sampleU(), slit = C.detector ? whichSlit(u) : (C.topClosed ? 2 : 0);
    flights.push({ t0: performance.now(), dur: fast ? 520 : 1300, u: u, slit: slit, landed: false, fast: !!fast });
  }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function label(text, x, y, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.font = "italic 400 13px Newsreader, Georgia, serif"; ctx.textAlign = "center";
    ctx.fillStyle = "#8a8478"; ctx.fillText(text, x, y); ctx.restore();
  }
  var detFlash = [0, 0, 0];
  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bd, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cy = G.cy, Hs = G.Hs;
    if (C.wave && field) paintField(now / 1000);

    ctx.strokeStyle = "rgba(236,230,218,0.12)"; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(G.gun + 34, cy); ctx.lineTo(G.xb, cy); ctx.stroke(); ctx.setLineDash([]);

    // gun
    var gg = ctx.createLinearGradient(0, cy - 22, 0, cy + 22); gg.addColorStop(0, "#3a3631"); gg.addColorStop(0.5, "#201e1b"); gg.addColorStop(1, "#121110");
    ctx.fillStyle = gg; rr(G.gun - 38, cy - 22, 62, 44, 9); ctx.fill();
    ctx.strokeStyle = "rgba(236,230,218,.22)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#2a2724"; rr(G.gun + 20, cy - 10, 12, 20, 3); ctx.fill();
    for (var c0 = 0; c0 < 3; c0++) { ctx.strokeStyle = "rgba(255,181,71," + (0.18 + 0.12 * c0) + ")"; ctx.beginPath(); ctx.moveTo(G.gun - 24 + c0 * 13, cy - 22); ctx.lineTo(G.gun - 24 + c0 * 13, cy + 22); ctx.stroke(); }
    var breathe = 0.75 + 0.25 * Math.sin(now / 700);
    var glow = ctx.createRadialGradient(G.gun + 32, cy, 0, G.gun + 32, cy, 20 * breathe); glow.addColorStop(0, "rgba(255,205,130,.95)"); glow.addColorStop(1, "rgba(255,181,71,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(G.gun + 32, cy, 20, 0, 6.2832); ctx.fill();

    // wall
    var wallTop = cy - Hs - 10, wallBot = cy + Hs + 10, s1 = cy - G.ds, s2 = cy + G.ds, so = G.so, bw = 12;
    var wg = ctx.createLinearGradient(G.xb - bw / 2, 0, G.xb + bw / 2, 0); wg.addColorStop(0, "#4a4540"); wg.addColorStop(0.45, "#2a2724"); wg.addColorStop(1, "#151413");
    ctx.fillStyle = wg;
    rr(G.xb - bw / 2, wallTop, bw, s1 - so - wallTop, 2); ctx.fill();
    rr(G.xb - bw / 2, s1 + so, bw, s2 - so - s1 - so, 2); ctx.fill();
    rr(G.xb - bw / 2, s2 + so, bw, wallBot - s2 - so, 2); ctx.fill();
    [s1, s2].forEach(function (sy, k) {
      if (k === 0 && C.topClosed) { ctx.fillStyle = "#8a8478"; rr(G.xb - bw / 2 - 2, sy - so - 1, bw + 4, 2 * so + 2, 2); ctx.fill(); return; }
      var sg = ctx.createRadialGradient(G.xb, sy, 0, G.xb, sy, 22); sg.addColorStop(0, "rgba(255,200,120,.3)"); sg.addColorStop(1, "rgba(255,181,71,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(G.xb, sy, 22, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "rgba(255,205,140,.8)"; ctx.fillRect(G.xb - bw / 2, sy - so - 1.2, bw, 1.2); ctx.fillRect(G.xb - bw / 2, sy + so, bw, 1.2);
    });
    if (S.beat === 5) { var pulse = 0.5 + 0.5 * Math.sin(now / 260); ctx.strokeStyle = "rgba(236,230,218," + (0.15 + 0.35 * pulse) + ")"; ctx.beginPath(); ctx.arc(G.xb, s1, 15 + 4 * pulse, 0, 6.2832); ctx.stroke(); }
    if (C.detector) [1, 2].forEach(function (kk) {
      var y = kk === 1 ? s1 : s2, f = Math.max(0, 1 - (now - detFlash[kk]) / 450);
      ctx.fillStyle = "rgba(236,230,218," + (0.18 + 0.8 * f) + ")"; ctx.beginPath(); ctx.arc(G.xb - 20, y, 4 + 5 * f, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "rgba(236,230,218,.35)"; ctx.beginPath(); ctx.arc(G.xb - 20, y, 8, 0, 6.2832); ctx.stroke();
    });

    // side-on screen and its profile
    var scg = ctx.createLinearGradient(G.xs - 4, 0, G.xs + 4, 0); scg.addColorStop(0, "#45403a"); scg.addColorStop(1, "#1c1a18");
    ctx.fillStyle = scg; rr(G.xs - 3, cy - Hs, 7, 2 * Hs, 2); ctx.fill();
    var hmax = 12; for (var i = 0; i < HB; i++) hmax = Math.max(hmax, hist[i]);
    ctx.fillStyle = "rgba(255,181,71,.5)";
    for (i = 0; i < HB; i++) { var len = hist[i] / hmax * Math.min(44, G.L * 0.22); if (len > 0.5) ctx.fillRect(G.xs - 4 - len, cy - Hs + i / HB * 2 * Hs, len, 2 * Hs / HB - 0.6); }

    ctx.strokeStyle = "rgba(236,230,218,.07)"; ctx.beginPath();
    ctx.moveTo(G.xs + 4, cy - Hs); ctx.lineTo(G.px0, cy - Hs); ctx.moveTo(G.xs + 4, cy + Hs); ctx.lineTo(G.px0, cy + Hs); ctx.stroke();

    // face-on screen
    ctx.fillStyle = "#070605"; rr(G.px0, cy - Hs, G.px1 - G.px0, 2 * Hs, 8); ctx.fill();
    ctx.strokeStyle = "rgba(236,230,218,.14)"; ctx.stroke();
    ctx.save(); rr(G.px0, cy - Hs, G.px1 - G.px0, 2 * Hs, 8); ctx.clip();
    ctx.drawImage(pc, G.px0, cy - Hs, G.px1 - G.px0, 2 * Hs); ctx.restore();

    if (S.beat === 8) {
      ctx.strokeStyle = "#ece6da"; ctx.lineWidth = 1.5;
      targets.forEach(function (u) {
        var y = cy + u * Hs;
        ctx.beginPath(); ctx.moveTo(G.px0 - 9, y); ctx.lineTo(G.px0 + 5, y); ctx.moveTo(G.px1 - 5, y); ctx.lineTo(G.px1 + 7, y); ctx.moveTo(G.xs + 5, y); ctx.lineTo(G.xs + 14, y); ctx.stroke();
      });
      ctx.lineWidth = 1;
    }

    // flights
    var Lm = Lam(C.E);
    for (var f = flights.length - 1; f >= 0; f--) {
      var F = flights[f], p = (now - F.t0) / F.dur;
      if (p >= 1) { flights.splice(f, 1); continue; }
      var yHit = cy + F.u * Hs;
      if (p < 0.3) {
        var q = p / 0.3, x = G.gun + 32 + (G.xb - G.gun - 32) * q, rad0 = F.fast ? 6 : 10;
        var bl = ctx.createRadialGradient(x, cy, 0, x, cy, rad0); bl.addColorStop(0, "rgba(255,235,195,1)"); bl.addColorStop(1, "rgba(255,181,71,0)");
        ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(x, cy, rad0, 0, 6.2832); ctx.fill();
      } else if (p < 0.85) {
        var q2 = (p - 0.3) / 0.55, R = q2 * G.L * 1.08, alpha = (1 - q2) * (F.fast ? 0.32 : 0.85);
        if (F.slit && !F.flashed) { detFlash[F.slit] = now; F.flashed = true; }
        var sources = F.slit === 1 ? [s1] : F.slit === 2 ? [s2] : [s1, s2];
        ctx.save(); ctx.beginPath(); ctx.rect(G.xb, cy - Hs - 20, G.xs - G.xb - 4, 2 * Hs + 40); ctx.clip();
        ctx.lineWidth = F.fast ? 1.1 : 2;
        sources.forEach(function (sy) {
          for (var c = 0; c < 4; c++) {
            var rad = R - c * Lm; if (rad <= 2) break;
            ctx.strokeStyle = "rgba(255,190,95," + (alpha * (1 - c * 0.24)) + ")";
            ctx.beginPath(); ctx.arc(G.xb, sy, rad, -1.15, 1.15); ctx.stroke();
          }
        });
        ctx.restore(); ctx.lineWidth = 1;
      } else {
        if (!F.landed) { F.landed = true; addHit(F.u); F.v = hitsV[hitsV.length - 1]; changed(); }
        var q3 = (p - 0.85) / 0.15, ring = 4 + q3 * (F.fast ? 10 : 22);
        ctx.strokeStyle = "rgba(255,225,175," + (1 - q3) + ")"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(G.xs, yHit, ring, 0, 6.2832); ctx.stroke();
        var pxm = G.px0 + (G.px1 - G.px0) * (0.06 + F.v * 0.88);
        ctx.beginPath(); ctx.arc(pxm, yHit, ring, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1;
      }
    }

    var la = S.beat === 0 ? 0.55 + 0.45 * Math.abs(Math.sin(now / 700)) : 0.7;
    label("gun", G.gun - 6, cy + 40, la);
    label("two slits", G.xb, cy - Hs - 18, la);
    label("screen", G.xs, cy + Hs + 20, la);
    label("the screen, face on", (G.px0 + G.px1) / 2, cy + Hs + 20, la);
  }

  /* ---------- firing ---------- */
  var holding = false, holdStart = 0, lastSpawn = 0, stream = 0, trickle = null;
  function loop(now) {
    if (holding) {
      var rate = Math.min(16, 1 + (now - holdStart) / 140);
      if (now - lastSpawn > 110 && flights.length < 8) { fireOne(true); lastSpawn = now; }
      for (var i = 0; i < Math.floor(rate); i++) addHit(sampleU());
      changed();
    } else if (stream > n()) {
      var k = Math.max(4, Math.ceil(stream / 150));
      if (now - lastSpawn > 140 && flights.length < 6) { fireOne(true); lastSpawn = now; }
      for (var j = 0; j < k && n() < stream; j++) addHit(sampleU());
      changed();
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  var raf = requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", function () { if (document.hidden) { cancelAnimationFrame(raf); holding = false; } else raf = requestAnimationFrame(loop); });

  /* ---------- beats: the text drives the plate ---------- */
  var beats = [].slice.call(document.querySelectorAll(".beat"));
  var plan = [
    { cfg: { E: 54, topClosed: false, detector: false, wave: false } },
    { cfg: { E: 54, topClosed: false, detector: false, wave: false }, dwell: function () { if (n() === 0) fireOne(false); } },
    { cfg: { E: 54, topClosed: false, detector: false, wave: false }, dwell: function () { autoTrickle(10); } },
    { cfg: { E: 54, topClosed: false, detector: false, wave: false } },
    { cfg: { E: 54, topClosed: false, detector: false, wave: false }, fill: 2000, lazy: true },
    { cfg: { E: 54, topClosed: true, detector: false, wave: false }, fill: 1500 },
    { cfg: { E: 54, topClosed: false, detector: false, wave: true }, fill: 2000 },
    { cfg: { E: 54, topClosed: false, detector: true, wave: false }, fill: 1500 },
    { cfg: { E: 110, topClosed: false, detector: false, wave: true } },
    { cfg: { E: 54, topClosed: false, detector: false, wave: false }, fill: 2000 }
  ];
  var dwellT = 0;
  function autoTrickle(target) {
    clearInterval(trickle);
    trickle = setInterval(function () { if (S.beat !== 2 || n() >= target) { clearInterval(trickle); return; } fireOne(false); }, 750);
  }
  function setConfig(cfg) {
    var before = C.E + "|" + C.topClosed + "|" + C.detector;
    for (var k in cfg) C[k] = cfg[k];
    if (before !== C.E + "|" + C.topClosed + "|" + C.detector) { buildSampler(); buildField(); clearHits(); }
    changed();
  }
  function enterBeat(i, initial) {
    if (i === S.beat && !initial) return;
    S.beat = i; save();
    holding = false; clearTimeout(dwellT); clearInterval(trickle);
    document.querySelectorAll(".v.hold").forEach(function (b) { b.classList.remove("firing"); });
    var P = plan[i], cfg = {}; for (var k in P.cfg) cfg[k] = P.cfg[k];
    if (i === 8) cfg.E = S.tuneE || 110;
    setConfig(cfg);
    if (i === 8) setDial(C.E, true);
    // Never leave the reader waiting: each passage shows its result by itself.
    if (P.fill && n() < P.fill) {
      if (P.lazy) dwellT = setTimeout(function () { if (S.beat === i && !holding && n() < P.fill) stream = P.fill; }, 2600);
      else stream = P.fill;
    }
    if (P.dwell) dwellT = setTimeout(P.dwell, 2400);
    changed();
  }
  function currentBeat() {
    var pr = stage.getBoundingClientRect(), vh = window.innerHeight;
    var stacked = pr.width > window.innerWidth * 0.8;
    var line = stacked ? pr.bottom + (vh - pr.bottom) * 0.4 : vh * 0.5;
    var cur = 0;
    for (var i = 0; i < beats.length; i++) if (beats[i].getBoundingClientRect().top <= line) cur = i;
    return cur;
  }
  var scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return; scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      var b = currentBeat(); if (b !== S.beat) enterBeat(b);
      var max = document.documentElement.scrollHeight - window.innerHeight;
      $("bar").style.width = (max > 0 ? Math.min(100, window.scrollY / max * 100) : 0) + "%";
      S.y = window.scrollY; save();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  function fmt(x) { return x.toLocaleString("en-US"); }
  function changed() {
    var c = fmt(n()) + (n() === 1 ? " electron" : " electrons");
    $("count").textContent = c;
    document.querySelectorAll("[data-count]").forEach(function (s) { s.textContent = fmt(n()); });
    var cap;
    if (S.beat === 8) cap = C.E + " eV · λ = " + lam(C.E).toFixed(3) + " nm";
    else if (C.detector) cap = "Detectors on: each electron flashes its slit.";
    else if (C.topClosed) cap = "Top slit closed.";
    else if (C.wave) cap = "Both slits open, wave shown.";
    else cap = S.beat === 0 ? "The experiment." : "Both slits open.";
    $("cap").textContent = cap;
    document.querySelectorAll('[data-act="slit"]').forEach(function (b) { b.classList.toggle("on", C.topClosed); });
    document.querySelectorAll('[data-act="wave"]').forEach(function (b) { b.classList.toggle("on", C.wave); });
    document.querySelectorAll('[data-act="detector"]').forEach(function (b) { b.classList.toggle("on", C.detector); });
    tuneText();
  }

  /* ---------- words that act ---------- */
  function wireHold(btn) {
    function down(e) { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (_) {} holding = true; stream = 0; holdStart = performance.now(); btn.classList.add("firing"); }
    function up() { if (!holding) return; holding = false; btn.classList.remove("firing"); changed(); }
    btn.addEventListener("pointerdown", down);
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { btn.addEventListener(ev, up); });
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  document.querySelectorAll("[data-act]").forEach(function (b) {
    var act = b.getAttribute("data-act");
    if (act === "hold") return wireHold(b);
    b.addEventListener("click", function () {
      clearTimeout(dwellT); clearInterval(trickle);
      if (act === "fire1") { if (flights.length < 12) fireOne(false); }
      else if (act === "burst") { stream = 0; addMany(500); }
      else if (act === "slit") { setConfig({ topClosed: !C.topClosed }); stream = 1200; }
      else if (act === "wave") { C.wave = !C.wave; }
      else if (act === "detector") { setConfig({ detector: !C.detector }); stream = 1200; }
      changed();
    });
  });
  // tap the top slit on the plate itself
  stage.addEventListener("pointerdown", function (e) {
    if (S.beat !== 5) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - G.xb, y - (G.cy - G.ds)) < 40) { setConfig({ topClosed: !C.topClosed }); stream = 1200; }
  });

  /* ---------- the prediction ---------- */
  var PRED = { two: "two bands", stripes: "many stripes", blob: "one soft glow" };
  function showPred() {
    document.querySelectorAll("[data-pred]").forEach(function (o) { o.classList.toggle("pick", o.getAttribute("data-pred") === S.pred); o.setAttribute("aria-pressed", String(o.getAttribute("data-pred") === S.pred)); });
    document.querySelectorAll("[data-pred-msg]").forEach(function (p) { p.hidden = p.getAttribute("data-pred-msg") !== S.pred; });
    $("pred-echo").textContent = S.pred ? "Your guess: " + PRED[S.pred] + ". Read on to see." : "Tap the phrase you believe. Or don’t; read on and see.";
  }
  document.querySelectorAll("[data-pred]").forEach(function (b) { b.addEventListener("click", function () { S.pred = b.getAttribute("data-pred"); save(); showPred(); }); });
  showPred();

  /* ---------- the draggable energy ---------- */
  var num = $("e-num"), EMIN = 10, EMAX = 200;
  function setDial(E, silent) {
    E = Math.round(Math.max(EMIN, Math.min(EMAX, E)));
    num.textContent = E + " eV"; num.setAttribute("aria-valuenow", E);
    $("lam").textContent = lam(E).toFixed(3) + " nm";
    if (!silent && E !== C.E) { S.tuneE = E; save(); setConfig({ E: E }); }
    tuneText();
  }
  function tuneText() {
    var h = $("tune-hint"), ok = Math.abs(C.E - 54) <= 1 && S.beat === 8;
    if (S.beat !== 8) return;
    h.textContent = ok ? "The dark lanes meet the marks. Fire to see the stripes land there." : C.E > 54 ? "The dark lanes are too close together. Lower the energy." : "The dark lanes are too far apart. Raise the energy.";
    $("tune-reveal").classList.toggle("shown", ok || !!S.tuned);
    if (ok && !S.tuned) { S.tuned = true; save(); }
  }
  var drag = null;
  num.addEventListener("pointerdown", function (e) { e.preventDefault(); drag = { x: e.clientX, E: C.E }; num.classList.add("drag"); try { num.setPointerCapture(e.pointerId); } catch (_) {} });
  num.addEventListener("pointermove", function (e) { if (drag) setDial(drag.E + (e.clientX - drag.x) / 4); });
  ["pointerup", "pointercancel"].forEach(function (ev) { num.addEventListener(ev, function () { drag = null; num.classList.remove("drag"); }); });
  num.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setDial(C.E - 1); } if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setDial(C.E + 1); } });
  document.querySelectorAll(".tangle button").forEach(function (b) {
    var rep = 0, step = +b.getAttribute("data-de");
    function stop() { clearInterval(rep); rep = 0; }
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); setDial(C.E + step); stop(); var t0 = Date.now(); rep = setInterval(function () { if (Date.now() - t0 > 350) setDial(C.E + step); }, 70); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { b.addEventListener(ev, stop); });
    b.addEventListener("click", function (e) { if (e.detail === 0) setDial(C.E + step); });
  });

  /* ---------- questions ---------- */
  document.querySelectorAll(".qa").forEach(function (q) { q.addEventListener("click", function () { q.classList.toggle("open"); }); });
  $("calc").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = parseFloat(String($("ans").value).replace(",", ".")), fb = $("fb");
    if (isNaN(v)) fb.textContent = "Type a number, such as 0.5.";
    else if (Math.abs(v - 0.1226) <= 0.002) fb.textContent = "Yes: 1.226 ÷ √100 = 0.1226 nm, about the width of an atom.";
    else if (Math.abs(v - 1.226) <= 0.02) fb.textContent = "That is in ångströms. In nanometres it is 0.1226.";
    else if (Math.abs(v - 122.6) <= 2) fb.textContent = "That is in picometres. In nanometres it is 0.1226.";
    else fb.textContent = "Not quite. Divide 1.226 by the square root of 100.";
  });

  /* ---------- depth ---------- */
  var LEVELS = ["intuition", "standard", "deep"];
  function setLevel(l) { S.level = l; root.setAttribute("data-level", l); $("depth-name").textContent = l; save(); }
  $("depth").addEventListener("click", function () { setLevel(LEVELS[(LEVELS.indexOf(S.level) + 1) % 3]); });
  setLevel(LEVELS.indexOf(S.level) >= 0 ? S.level : "standard");

  /* ---------- go ---------- */
  layout();
  if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(cv);
  else window.addEventListener("resize", layout);
  setDial(S.tuneE || 110, true);
  var jump = /[?&]beat=(\d+)/.exec(location.search);
  if (jump) { var jb = beats[Math.min(beats.length - 1, +jump[1])]; setTimeout(function () { window.scrollTo(0, jb.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.55); }, 50); }
  else if (S.y) setTimeout(function () { window.scrollTo(0, S.y); }, 50);
  enterBeat(Math.min(S.beat || 0, beats.length - 1), true);
  setTimeout(onScroll, 120);
  window.__qb = { C: C, S: S, n: n, addMany: addMany, enterBeat: enterBeat, setDial: setDial, targets: function () { return targets; }, intensityAt: intensityAt, G: function () { return G; }, stream: function () { return stream; } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
