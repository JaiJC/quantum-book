(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- silent autosave ---------- */
  var KEY = "qbook.ch25.v1", S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { S = {}; }
  S.missions = S.missions || {};
  var saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 150); }

  /* ---------- physics helpers ---------- */
  var LAMBDA_COEF = 1.2264259653; // nm * sqrt(eV), from CODATA h, m_e, e
  function lambdaNm(E) { return LAMBDA_COEF / Math.sqrt(E); }
  function sinc2(x) { return x === 0 ? 1 : Math.pow(Math.sin(x) / x, 2); }
  var P54 = 0.36;                          // fringe period on screen (x in [-1,1]) at 54 eV
  function period(E) { return P54 * lambdaNm(E) / lambdaNm(54); }
  function intensity(x, E, which) {        // two-slit Fraunhofer pattern, slit width a = d/4
    var P = period(E), env = sinc2(Math.PI * x / (4 * P));
    return which ? env : env * Math.pow(Math.cos(Math.PI * x / P), 2);
  }
  function makeSampler(E, which) {          // inverse-CDF sampler on 1024 bins
    var n = 1024, cdf = new Float64Array(n + 1), tot = 0;
    for (var i = 0; i < n; i++) { tot += intensity(-1 + (i + 0.5) * 2 / n, E, which); cdf[i + 1] = tot; }
    return function () {
      var u = Math.random() * tot, lo = 0, hi = n;
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cdf[m] < u) lo = m; else hi = m; }
      return -1 + (lo + Math.random()) * 2 / n;
    };
  }
  function fitCanvas(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return true; }
    return false;
  }
  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }

  /* ---------- reading level ---------- */
  function setLevel(lv) {
    root.setAttribute("data-level", lv); S.level = lv; save();
    document.querySelectorAll(".seg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lv") === lv)); });
  }
  document.querySelectorAll(".seg button").forEach(function (b) { b.addEventListener("click", function () { setLevel(b.getAttribute("data-lv")); }); });
  setLevel(S.level || "standard");

  /* ---------- theme ---------- */
  var sun = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var moon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function isDark() { var t = root.getAttribute("data-theme"); return t ? t === "dark" : !(window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches); }
  function paintThemeBtn() { $("theme").innerHTML = isDark() ? sun : moon; $("theme").setAttribute("aria-label", isDark() ? "Switch to light" : "Switch to dark"); }
  if (S.theme) root.setAttribute("data-theme", S.theme);
  paintThemeBtn();
  $("theme").addEventListener("click", function () { S.theme = isDark() ? "light" : "dark"; root.setAttribute("data-theme", S.theme); save(); paintThemeBtn(); drawCalc(); drawSphere(); });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () { paintThemeBtn(); drawCalc(); drawSphere(); });

  /* ---------- mission progress ---------- */
  var MIS = ["m1", "m2", "m3", "m4"];
  function paintMissions() {
    var dots = $("dots").children, firstOpen = -1;
    MIS.forEach(function (m, i) {
      var el = $(m), done = !!S.missions[m], open = i === 0 || !!S.missions[MIS[i - 1]] || m === "m4";
      dots[i].classList.toggle("done", done);
      el.classList.toggle("done", done);
      el.classList.toggle("locked", !done && !open);
      el.querySelector(".tick").textContent = done ? "✓" : "";
      el.querySelector(".why").hidden = !done;
      if (!done && open && firstOpen < 0 && m !== "m4") firstOpen = i;
    });
    MIS.forEach(function (m, i) { $(m).classList.toggle("active", i === firstOpen); });
    var now = $("mission-now");
    if (firstOpen >= 0) { var el = $(MIS[firstOpen]); now.innerHTML = '<span class="eyebrow">Mission ' + (firstOpen + 1) + '</span><span></span>'; now.lastChild.textContent = el.querySelector("p").textContent; }
    else { now.innerHTML = '<span class="eyebrow">Lab complete</span><span>All three lab missions done. Mission 4 is with the qubit further down.</span>'; }
    $("dots").setAttribute("aria-label", MIS.filter(function (m) { return S.missions[m]; }).length + " of 4 missions completed");
  }
  function complete(m) { if (S.missions[m]) return; S.missions[m] = new Date().toISOString(); save(); paintMissions(); if (m === "m1") revealPrediction(); if (typeof drawOverlay === "function") drawOverlay(); }

  /* ---------- prediction ---------- */
  var choices = Array.prototype.slice.call(document.querySelectorAll(".choice"));
  function paintPrediction() {
    choices.forEach(function (c) {
      var p = c.getAttribute("data-p");
      c.setAttribute("aria-checked", String(S.predict === p));
      c.disabled = !!S.locked;
      c.classList.toggle("right", !!S.missions.m1 && p === "stripes");
      c.classList.toggle("wrong", !!S.missions.m1 && p !== "stripes");
    });
    $("lock").disabled = !S.predict || !!S.locked;
    var note = $("lock-note");
    if (S.missions.m1) note.textContent = S.predict === "stripes" ? "You called it. Stripes it is." : (S.predict ? "Most people pick this. The screen says otherwise." : "The answer: stripes.");
    else if (S.locked) note.textContent = "Locked. Now run the experiment below.";
    else note.textContent = S.predict ? "Lock it in, then test it." : "Pick one to continue.";
    $("lock").textContent = S.locked ? "Prediction locked" : "Lock in my prediction";
  }
  choices.forEach(function (c) { c.addEventListener("click", function () { if (S.locked) return; S.predict = c.getAttribute("data-p"); save(); paintPrediction(); }); });
  $("lock").addEventListener("click", function () { S.locked = true; save(); paintPrediction(); $("lab").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); });
  function revealPrediction() { paintPrediction(); }

  /* ---------- the detector screen ---------- */
  var scr = $("screen"), sctx = scr.getContext("2d");
  var hits = [], E = S.energy || 120, which = false, curve = false, sampler = makeSampler(E, which);
  var m1count = 0, m2count = 0;
  var energyEl = $("energy"); energyEl.value = E;

  function drawDot(ctx, x, y, w, h, dpr) {
    var px = (x + 1) / 2 * w, py = y * h, r = 1.6 * dpr;
    ctx.fillStyle = "rgba(255,181,71,0.22)"; ctx.beginPath(); ctx.arc(px, py, r * 2.6, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "rgba(255,214,150,0.95)"; ctx.fillRect(px - r / 2, py - r / 2, r, r);
  }
  function redrawScreen() {
    fitCanvas(scr);
    var w = scr.width, h = scr.height, dpr = Math.min(window.devicePixelRatio || 1, 2);
    sctx.globalCompositeOperation = "source-over"; sctx.fillStyle = "#05070f"; sctx.fillRect(0, 0, w, h);
    sctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < hits.length; i += 2) drawDot(sctx, hits[i], hits[i + 1], w, h, dpr);
    sctx.globalCompositeOperation = "source-over";
    drawOverlay();
  }
  var ov = $("overlay"), octx = ov.getContext("2d");
  function drawOverlay() {
    fitCanvas(ov); var w = ov.width, h = ov.height, dpr = Math.min(window.devicePixelRatio || 1, 2), sctx = octx;
    sctx.clearRect(0, 0, w, h);
    if (S.missions.m2) {
      var mx = (1 + P54 / 2) / 2 * w;
      sctx.save(); sctx.setLineDash([6 * dpr, 6 * dpr]); sctx.strokeStyle = "rgba(143,162,255,0.9)"; sctx.lineWidth = 2 * dpr;
      sctx.beginPath(); sctx.moveTo(mx, 0); sctx.lineTo(mx, h); sctx.stroke(); sctx.restore();
      sctx.fillStyle = "rgba(143,162,255,0.95)"; sctx.font = (11 * dpr) + "px JetBrains Mono, monospace"; sctx.fillText("marker", mx + 6 * dpr, h - 10 * dpr);
    }
    if (curve) {
      var n = 120, bins = new Array(n).fill(0), cnt = hits.length / 2;
      for (var i = 0; i < hits.length; i += 2) { var b = Math.min(n - 1, Math.floor((hits[i] + 1) / 2 * n)); bins[b]++; }
      var maxB = Math.max.apply(null, bins) || 1, peak = 0, k;
      for (k = 0; k < 400; k++) peak = Math.max(peak, intensity(-1 + 2 * k / 399, E, which));
      sctx.fillStyle = "rgba(255,181,71,0.18)";
      if (cnt > 50) for (k = 0; k < n; k++) { var bh = bins[k] / maxB * h * 0.8; sctx.fillRect(k / n * w, h - bh, w / n - 1, bh); }
      sctx.strokeStyle = "rgba(143,162,255,0.95)"; sctx.lineWidth = 2 * dpr; sctx.beginPath();
      for (k = 0; k <= 400; k++) { var x = -1 + 2 * k / 400, yy = h - intensity(x, E, which) / peak * h * 0.8; if (k) sctx.lineTo((x + 1) / 2 * w, yy); else sctx.moveTo(0, yy); }
      sctx.stroke();
    }
  }
  function addHits(n) {
    if (fitCanvas(scr)) redrawScreen(); // Books can lay the page out before the screen has a size
    var w = scr.width, h = scr.height, dpr = Math.min(window.devicePixelRatio || 1, 2);
    sctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < n; i++) { var x = sampler(), y = 0.04 + Math.random() * 0.92; hits.push(x, y); drawDot(sctx, x, y, w, h, dpr); }
    sctx.globalCompositeOperation = "source-over";
    if (hits.length > 60000) { hits = hits.slice(hits.length - 60000); }
    if (curve) drawOverlay();
    var c = hits.length / 2;
    $("count").textContent = c.toLocaleString() + (c === 1 ? " electron" : " electrons");
    if (!which) m1count += n; else m2count += n;
    $("m1-meter").style.width = Math.min(100, m1count / 20) + "%";
    if (!S.missions.m1 && m1count >= 2000) complete("m1");
    if (S.missions.m1 && !S.missions.m2 && which && m2count >= 1500) complete("m2");
    if (S.missions.m2 && !S.missions.m3 && !which && Math.abs(E - 54) <= 2 && c >= 800) complete("m3");
  }
  function clearScreen() { hits = []; m2count = 0; redrawScreen(); $("count").textContent = "0 electrons"; }

  var firing = false, rate = 0, lastT = 0, carry = 0;
  function fireLoop(t) {
    if (!firing) return;
    var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
    rate = Math.min(900, rate + dt * 500);
    carry += rate * dt; var n = Math.floor(carry); carry -= n;
    if (n) addHits(n);
    requestAnimationFrame(fireLoop);
  }
  function startFire(e) { if (e) e.preventDefault(); if (firing) return; firing = true; rate = 30; lastT = 0; carry = 1; $("fire").classList.add("on"); $("fire").textContent = "Firing…"; requestAnimationFrame(fireLoop); }
  function stopFire() { if (!firing) return; firing = false; $("fire").classList.remove("on"); $("fire").textContent = "Hold to fire electrons"; }
  var fireBtn = $("fire");
  fireBtn.addEventListener("pointerdown", function (e) { try { fireBtn.setPointerCapture(e.pointerId); } catch (_) {} startFire(e); });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { fireBtn.addEventListener(ev, stopFire); });
  fireBtn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  fireBtn.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); startFire(); } });
  fireBtn.addEventListener("keyup", function (e) { if (e.key === " " || e.key === "Enter") stopFire(); });
  $("burst").addEventListener("click", function () { addHits(500); });
  $("clear").addEventListener("click", clearScreen);
  $("detector").addEventListener("change", function () {
    which = this.checked; sampler = makeSampler(E, which); clearScreen();
    $("schem-eye").setAttribute("opacity", which ? "1" : "0");
  });
  $("curve").addEventListener("change", function () { curve = this.checked; redrawScreen(); });
  function paintEnergy() {
    var l = lambdaNm(E);
    $("energy-out").textContent = E + " eV · λ = " + l.toFixed(3) + " nm";
    energyEl.style.setProperty("--fill", ((E - 10) / 190 * 100) + "%");
    $("calc-l").textContent = l.toFixed(3) + " nm"; $("calc-e").textContent = E + " eV";
    drawCalc();
  }
  energyEl.addEventListener("input", function () {
    E = +this.value; S.energy = E; save(); sampler = makeSampler(E, which); paintEnergy();
    if (hits.length) clearScreen();
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-de]"), function (b) {
    b.addEventListener("click", function () {
      E = Math.max(10, Math.min(200, E + +b.getAttribute("data-de"))); energyEl.value = E;
      S.energy = E; save(); sampler = makeSampler(E, which); paintEnergy();
      if (hits.length) clearScreen();
    });
  });

  /* ---------- wavelength vs atoms ---------- */
  function drawCalc() {
    var cv = $("calc-wave"); if (!cv) return; fitCanvas(cv);
    var g = cv.getContext("2d"), w = cv.width, h = cv.height, span = 2.0; // nm across the strip
    g.clearRect(0, 0, w, h);
    g.fillStyle = css("--muted"); g.globalAlpha = 0.55;
    for (var a = 0.1; a < span; a += 0.2) { g.beginPath(); g.arc(a / span * w, h / 2, h * 0.18, 0, 6.2832); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = css("--hit"); g.lineWidth = Math.max(2, h * 0.07); g.beginPath();
    var l = lambdaNm(E);
    for (var i = 0; i <= w; i += 2) { var y = h / 2 - Math.sin(2 * Math.PI * (i / w * span) / l) * h * 0.32; if (i) g.lineTo(i, y); else g.moveTo(i, y); }
    g.stroke();
  }

  /* ---------- hero: ambient detector ---------- */
  (function () {
    var cv = $("hero-cv"), g = cv.getContext("2d"), samp = makeSampler(54, false), n = 0, running = true;
    function reset() { fitCanvas(cv); g.fillStyle = "#05070f"; g.fillRect(0, 0, cv.width, cv.height); n = 0; }
    function dot() { var x = samp(), y = Math.random(); var px = (x * 0.9 + 1) / 2 * cv.width, py = y * cv.height;
      g.fillStyle = "rgba(255,181,71,0.16)"; g.beginPath(); g.arc(px, py, 3.5, 0, 6.2832); g.fill(); g.fillStyle = "rgba(255,220,160,0.9)"; g.fillRect(px - 1, py - 1, 2, 2); n++; }
    reset();
    if (reduceMotion) { g.globalCompositeOperation = "lighter"; for (var i = 0; i < 5000; i++) dot(); return; }
    g.globalCompositeOperation = "lighter";
    function tick() {
      if (!running) return;
      var k = n < 300 ? 2 : n < 2000 ? 12 : 30;
      for (var i = 0; i < k; i++) dot();
      if (n > 9000) { g.globalCompositeOperation = "source-over"; reset(); g.globalCompositeOperation = "lighter"; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", function () { var was = running; running = !document.hidden; if (running && !was) requestAnimationFrame(tick); });
    window.addEventListener("resize", function () { g.globalCompositeOperation = "source-over"; reset(); g.globalCompositeOperation = "lighter"; });
  })();

  /* ---------- qubit sphere ---------- */
  var sp = $("sphere"), sg = sp.getContext("2d");
  var Q = { th: S.qth != null ? S.qth : 90, ph: S.qph != null ? S.qph : 30, yaw: -0.5, pitch: 0.32 };
  function rot(p) { // world (x, y, z-up) -> view; returns [sx, sz, depth]
    var cy = Math.cos(Q.yaw), sy = Math.sin(Q.yaw), cp = Math.cos(Q.pitch), spi = Math.sin(Q.pitch);
    var x1 = p[0] * cy - p[1] * sy, y1 = p[0] * sy + p[1] * cy, z1 = p[2];
    var y2 = y1 * cp - z1 * spi, z2 = y1 * spi + z1 * cp;
    return [x1, z2, -y2];
  }
  function unrot(x2, z2, y2) {
    var cy = Math.cos(Q.yaw), sy = Math.sin(Q.yaw), cp = Math.cos(Q.pitch), spi = Math.sin(Q.pitch);
    var y1 = y2 * cp + z2 * spi, z1 = -y2 * spi + z2 * cp, x1 = x2;
    return [x1 * cy + y1 * sy, -x1 * sy + y1 * cy, z1];
  }
  function bloch() { var t = Q.th * Math.PI / 180, f = Q.ph * Math.PI / 180; return [Math.sin(t) * Math.cos(f), Math.sin(t) * Math.sin(f), Math.cos(t)]; }
  var geo = {};
  function drawSphere() {
    fitCanvas(sp);
    var w = sp.width, h = sp.height, dpr = Math.min(window.devicePixelRatio || 1, 2), cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
    geo = { cx: cx, cy: cy, R: R, dpr: dpr };
    sg.clearRect(0, 0, w, h);
    var grd = sg.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R);
    grd.addColorStop(0, "rgba(143,162,255,0.30)"); grd.addColorStop(0.7, "rgba(60,78,160,0.16)"); grd.addColorStop(1, "rgba(30,40,90,0.10)");
    sg.fillStyle = grd; sg.beginPath(); sg.arc(cx, cy, R, 0, 6.2832); sg.fill();
    sg.strokeStyle = "rgba(143,162,255,0.35)"; sg.lineWidth = 1.2 * dpr; sg.stroke();
    function ring(fn, alpha) {
      for (var i = 0; i < 96; i++) {
        var a = rot(fn(i / 96 * 6.2832)), b = rot(fn((i + 1) / 96 * 6.2832)), front = (a[2] + b[2]) / 2 > 0;
        sg.strokeStyle = "rgba(199,206,230," + (front ? alpha : alpha * 0.3) + ")"; sg.lineWidth = (front ? 1.4 : 1) * dpr;
        sg.beginPath(); sg.moveTo(cx + a[0] * R, cy - a[1] * R); sg.lineTo(cx + b[0] * R, cy - b[1] * R); sg.stroke();
      }
    }
    ring(function (t) { return [Math.cos(t), Math.sin(t), 0]; }, 0.55);
    ring(function (t) { return [Math.sin(t), 0, Math.cos(t)]; }, 0.25);
    ring(function (t) { return [0, Math.sin(t), Math.cos(t)]; }, 0.25);
    function line(p, q, col, wdt, dash) { var a = rot(p), b = rot(q); sg.save(); sg.strokeStyle = col; sg.lineWidth = wdt * dpr; if (dash) sg.setLineDash(dash.map(function (d) { return d * dpr; })); sg.beginPath(); sg.moveTo(cx + a[0] * R, cy - a[1] * R); sg.lineTo(cx + b[0] * R, cy - b[1] * R); sg.stroke(); sg.restore(); }
    line([0, 0, -1.25], [0, 0, 1.25], "rgba(199,206,230,0.5)", 1.2);
    line([-1.15, 0, 0], [1.15, 0, 0], "rgba(199,206,230,0.18)", 1);
    line([0, -1.15, 0], [0, 1.15, 0], "rgba(199,206,230,0.18)", 1);
    sg.fillStyle = "#e7eaf4"; sg.font = "500 " + (15 * dpr) + "px JetBrains Mono, monospace"; sg.textAlign = "center";
    var top = rot([0, 0, 1.38]), bot = rot([0, 0, -1.38]);
    sg.fillText("|0⟩", cx + top[0] * R, cy - top[1] * R + 5 * dpr); sg.fillText("|1⟩", cx + bot[0] * R, cy - bot[1] * R + 5 * dpr);
    var v = bloch(), foot = [v[0], v[1], 0];
    line([0, 0, 0], foot, "rgba(255,181,71,0.35)", 1.2, [4, 4]); line(foot, v, "rgba(255,181,71,0.35)", 1.2, [4, 4]);
    var tv = rot(v), tx = cx + tv[0] * R, ty = cy - tv[1] * R;
    sg.save(); sg.shadowColor = "rgba(255,181,71,0.8)"; sg.shadowBlur = 14 * dpr; sg.strokeStyle = "#ffb547"; sg.lineWidth = 4 * dpr; sg.lineCap = "round";
    sg.beginPath(); sg.moveTo(cx, cy); sg.lineTo(tx, ty); sg.stroke();
    sg.fillStyle = "#ffb547"; sg.beginPath(); sg.arc(tx, ty, (Q.drag === "tip" ? 15 : 12) * dpr, 0, 6.2832); sg.fill(); sg.restore();
    sg.fillStyle = "#1a1205"; sg.beginPath(); sg.arc(tx, ty, 4 * dpr, 0, 6.2832); sg.fill();
    geo.tip = [tx, ty];
    var p0 = Math.pow(Math.cos(Q.th * Math.PI / 360), 2);
    $("angles").textContent = "θ = " + Math.round(Q.th) + "° · φ = " + Math.round(Q.ph) + "°";
    $("p0").textContent = "P(0) = " + p0.toFixed(2); $("p1").textContent = "P(1) = " + (1 - p0).toFixed(2);
    var H = $("bar0").parentNode.clientHeight - 36;
    $("pred0").style.bottom = (28 + p0 * H) + "px"; $("pred1").style.bottom = (28 + (1 - p0) * H) + "px";
  }
  var raf = 0; function queueSphere() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawSphere(); }); }
  function local(e) { var r = sp.getBoundingClientRect(); return [(e.clientX - r.left) * sp.width / r.width, (e.clientY - r.top) * sp.height / r.height]; }
  sp.addEventListener("pointerdown", function (e) {
    var p = local(e), d = geo.tip ? Math.hypot(p[0] - geo.tip[0], p[1] - geo.tip[1]) : 1e9;
    Q.drag = d < 36 * geo.dpr ? "tip" : "view"; Q.last = p; try { sp.setPointerCapture(e.pointerId); } catch (_) {}
    sp.style.cursor = "grabbing"; queueSphere();
  });
  sp.addEventListener("pointermove", function (e) {
    if (!Q.drag) return; var p = local(e);
    if (Q.drag === "tip") {
      var x = (p[0] - geo.cx) / geo.R, z = (geo.cy - p[1]) / geo.R, r2 = x * x + z * z, depth;
      if (r2 > 1) { var k = 1 / Math.sqrt(r2); x *= k; z *= k; depth = 0; } else depth = Math.sqrt(1 - r2);
      var wv = unrot(x, z, -depth);
      Q.th = Math.acos(Math.max(-1, Math.min(1, wv[2]))) * 180 / Math.PI;
      Q.ph = (Math.atan2(wv[1], wv[0]) * 180 / Math.PI + 360) % 360;
      S.qth = Q.th; S.qph = Q.ph; save();
    } else {
      Q.yaw += (p[0] - Q.last[0]) / geo.R * 1.2; Q.pitch = Math.max(-1.3, Math.min(1.3, Q.pitch + (p[1] - Q.last[1]) / geo.R * 1.2));
    }
    Q.last = p; queueSphere();
  });
  ["pointerup", "pointercancel"].forEach(function (ev) { sp.addEventListener(ev, function () { Q.drag = null; sp.style.cursor = "grab"; queueSphere(); }); });

  Array.prototype.forEach.call(document.querySelectorAll("[data-dt]"), function (b) {
    b.addEventListener("click", function () {
      Q.th = Math.max(0, Math.min(180, Math.round(Q.th) + +b.getAttribute("data-dt")));
      S.qth = Q.th; save(); drawSphere();
    });
  });
  $("measure").addEventListener("click", function () {
    var p0 = Math.pow(Math.cos(Q.th * Math.PI / 360), 2), n0 = 0;
    for (var i = 0; i < 100; i++) if (Math.random() < p0) n0++;
    var H = $("bar0").parentNode.clientHeight - 36;
    $("bar0").style.height = (n0 / 100 * H) + "px"; $("bar1").style.height = ((100 - n0) / 100 * H) + "px";
    $("n0").textContent = n0; $("n1").textContent = 100 - n0;
    var hit = Math.abs(p0 - 0.75) <= 0.02;
    $("measure-note").textContent = hit ? "Odds set to 75%. You got " + n0 + " zeros out of 100. Run it again: the count wobbles, the odds don't." : "Predicted " + Math.round(p0 * 100) + " zeros, got " + n0 + ". Mission 4 wants the odds at 75%.";
    if (hit) complete("m4");
  });

  /* ---------- problem ---------- */
  var HINTS = [
    "Use λ ≈ 1.226 nm / √(E in eV).",
    "√100 = 10.",
    "λ = 1.226 nm / 10.",
    "Solution: λ = h / √(2 mₑ E) = 1.226 nm / √100 = 0.1226 nm. Checked by code with CODATA constants: 0.12264 nm. A common slip is putting E in joules into the eV formula."
  ];
  var hintN = S.hints || 0;
  function paintHints() { var box = $("hints"); box.innerHTML = ""; for (var i = 0; i < hintN; i++) { var d = document.createElement("div"); d.className = "hint"; d.textContent = (i < 3 ? "Hint " + (i + 1) + ". " : "") + HINTS[i]; box.appendChild(d); } $("hint-btn").textContent = hintN >= 3 ? (hintN >= 4 ? "Solution shown" : "Show solution") : "Hint " + (hintN + 1); $("hint-btn").disabled = hintN >= 4; }
  $("hint-btn").addEventListener("click", function () { hintN = Math.min(4, hintN + 1); S.hints = hintN; save(); paintHints(); });
  $("ans-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = parseFloat(String($("ans").value).replace(",", ".")), fb = $("ans-fb");
    if (isNaN(v)) { fb.className = "feedback bad"; fb.textContent = "Type a number in nanometres, like 0.15."; return; }
    if (v >= 0.12 && v <= 0.125) { fb.className = "feedback good"; fb.textContent = "Correct. 0.1226 nm, about the size of an atom."; S.solved = true; save(); }
    else if (v >= 1.2 && v <= 1.25) { fb.className = "feedback bad"; fb.textContent = "That's ångströms. Divide by 10 to get nanometres."; }
    else if (v >= 120 && v <= 125) { fb.className = "feedback bad"; fb.textContent = "That's picometres. Divide by 1000 to get nanometres."; }
    else { fb.className = "feedback bad"; fb.textContent = "Not quite. Try the hint."; }
  });
  if (S.solved) { $("ans").value = "0.1226"; $("ans-fb").className = "feedback good"; $("ans-fb").textContent = "Correct. 0.1226 nm, about the size of an atom."; }

  /* ---------- recall card ---------- */
  function paintCard() {
    var c = S.card; $("card-next").textContent = c ? "Next review in " + c.interval + (c.interval === 1 ? " day." : " days.") : "";
  }
  $("flip").addEventListener("click", function () { this.classList.toggle("over"); $("grade").hidden = false; });
  $("grade").addEventListener("click", function (e) {
    var g = +(e.target.getAttribute && e.target.getAttribute("data-g")); if (!g) return;
    var c = S.card || { interval: 0, reps: 0 }; c.reps++;
    c.interval = g === 1 ? 1 : Math.max(g, Math.round((c.interval || 1) * (g === 3 ? 2.5 : 3.5)));
    S.card = c; save(); paintCard(); $("flip").classList.remove("over"); $("grade").hidden = true;
  });

  /* ---------- boot ---------- */
  paintMissions(); paintPrediction(); paintEnergy(); paintHints(); paintCard();
  redrawScreen(); drawSphere();
  if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (fitCanvas(scr)) redrawScreen(); queueSphere(); }); ro.observe(scr); ro.observe(sp); }
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { redrawScreen(); drawSphere(); drawCalc(); }, 120); });
})();
