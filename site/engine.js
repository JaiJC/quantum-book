/* Quantum Book reading engine.
   The text drives the plate: scrolling into a passage (".beat") calls plate.beat(i).
   Words act on the plate: [data-act], [data-hold], [data-pick], .tangle numbers.
   Nothing ever blocks reading. */
(function () {
  "use strict";
  var root = document.documentElement;
  var CH = +(document.body.getAttribute("data-ch") || 0);
  var KEY = "qbook.ch" + CH;
  var S = { beat: 0, y: 0, picks: {}, vals: {} };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var k in sv) S[k] = sv[k]; } catch (e) {}
  var saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 250); }
  function $(id) { return document.getElementById(id); }
  function all(sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------- drawing kit ---------- */
  function Kit(canvas) {
    var K = { canvas: canvas, ctx: canvas.getContext("2d"), W: 1, H: 1, dpr: 1, t: 0,
      col: { bg: "#000", ink: "#ece6da", ink2: "#b9b2a5", muted: "#7c766b", faint: "#3a3631", rule: "#24211d", amber: "#ffb547", amberSoft: "rgba(255,181,71,.18)", red: "#e0735a" } };
    K.fit = function () {
      var r = canvas.getBoundingClientRect(); K.dpr = Math.min(window.devicePixelRatio || 1, 2);
      K.W = Math.max(1, r.width); K.H = Math.max(1, r.height);
      canvas.width = Math.round(K.W * K.dpr); canvas.height = Math.round(K.H * K.dpr);
      K.ctx.setTransform(K.dpr, 0, 0, K.dpr, 0, 0);
    };
    var c = K.ctx;
    K.clear = function () { c.setTransform(K.dpr, 0, 0, K.dpr, 0, 0); c.fillStyle = "#000"; c.fillRect(0, 0, K.W, K.H); };
    K.line = function (x1, y1, x2, y2, col, w, dash) { c.strokeStyle = col || K.col.ink2; c.lineWidth = w || 1; if (dash) c.setLineDash(dash); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); if (dash) c.setLineDash([]); };
    K.circle = function (x, y, r, fill, stroke, w) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, 6.2832); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = w || 1; c.stroke(); } };
    K.rr = function (x, y, w, h, r, fill, stroke) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); } };
    K.glow = function (x, y, r, col, a) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col || "rgba(255,205,130," + (a == null ? 0.9 : a) + ")"); g.addColorStop(1, "rgba(255,181,71,0)"); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); };
    K.text = function (s, x, y, o) {
      o = o || {}; c.save(); c.globalAlpha = o.alpha == null ? 1 : o.alpha;
      c.font = o.font || ((o.italic === false ? "" : "italic ") + "400 " + (o.size || 13) + "px Newsreader, Georgia, serif");
      if (o.mono) c.font = "400 " + (o.size || 11) + "px 'JetBrains Mono', monospace";
      c.fillStyle = o.color || K.col.muted; c.textAlign = o.align || "center"; c.textBaseline = o.base || "alphabetic"; c.fillText(s, x, y); c.restore();
    };
    // axes in a box; returns mapping helpers
    K.axes = function (x0, y0, w, h, xr, yr, o) {
      o = o || {};
      var X = function (x) { return x0 + (x - xr[0]) / (xr[1] - xr[0]) * w; }, Y = function (y) { return y0 + h - (y - yr[0]) / (yr[1] - yr[0]) * h; };
      K.line(x0, y0 + h, x0 + w, y0 + h, K.col.faint); K.line(x0, y0, x0, y0 + h, K.col.faint);
      if (o.zeroY && yr[0] < 0 && yr[1] > 0) K.line(x0, Y(0), x0 + w, Y(0), K.col.rule);
      if (o.xl) K.text(o.xl, x0 + w, y0 + h + 18, { align: "right" });
      if (o.yl) K.text(o.yl, x0 - 6, y0 - 8, { align: "left" });
      (o.xt || []).forEach(function (t) { K.line(X(t), y0 + h, X(t), y0 + h + 4, K.col.muted); K.text(String(t), X(t), y0 + h + 16, { mono: true, size: 10 }); });
      (o.yt || []).forEach(function (t) { K.line(x0 - 4, Y(t), x0, Y(t), K.col.muted); K.text(String(t), x0 - 8, Y(t) + 3, { mono: true, size: 10, align: "right" }); });
      return { X: X, Y: Y, x0: x0, y0: y0, w: w, h: h };
    };
    K.plot = function (A, f, xr, col, w, n) {
      n = n || 300; c.strokeStyle = col || K.col.amber; c.lineWidth = w || 2; c.beginPath();
      for (var i = 0; i <= n; i++) { var x = xr[0] + (xr[1] - xr[0]) * i / n, y = f(x); if (!isFinite(y)) continue; var px = A.X(x), py = A.Y(y); if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
    };
    K.lerp = function (a, b, t) { return a + (b - a) * t; };
    K.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    K.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    return K;
  }


  /* ---------- 1D Schrödinger solver (split-step Fourier, ħ = m = 1) ---------- */
  function FFT(re, im, inv) {
    var n = re.length, i, j, k, m;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (m = 2; m <= n; m <<= 1) {
      var ang = (inv ? 2 : -2) * Math.PI / m, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += m) { var cr = 1, ci = 0; for (k = 0; k < m / 2; k++) { var a = i + k, b = a + m / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr; } }
    }
    if (inv) for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  function Solver(N, L) {
    var S = { N: N, L: L, dx: L / N, x: new Float64Array(N), re: new Float64Array(N), im: new Float64Array(N), V: new Float64Array(N), k: new Float64Array(N), mass: 1, t: 0 };
    for (var i = 0; i < N; i++) { S.x[i] = -L / 2 + i * S.dx; S.k[i] = 2 * Math.PI * (i < N / 2 ? i : i - N) / L; }
    S.setV = function (f) { for (var i = 0; i < N; i++) S.V[i] = f(S.x[i]); };
    S.setPsi = function (f) { var nr = 0; for (var i = 0; i < N; i++) { var z = f(S.x[i]); S.re[i] = z[0]; S.im[i] = z[1]; nr += (z[0] * z[0] + z[1] * z[1]) * S.dx; } nr = Math.sqrt(nr) || 1; for (i = 0; i < N; i++) { S.re[i] /= nr; S.im[i] /= nr; } S.t = 0; };
    S.packet = function (x0, sig, k0) { S.setPsi(function (x) { var g = Math.exp(-Math.pow(x - x0, 2) / (4 * sig * sig)); return [g * Math.cos(k0 * x), g * Math.sin(k0 * x)]; }); };
    function phaseV(dt) { for (var i = 0; i < N; i++) { var a = -S.V[i] * dt, c = Math.cos(a), s = Math.sin(a), r = S.re[i], m = S.im[i]; S.re[i] = r * c - m * s; S.im[i] = r * s + m * c; } }
    S.step = function (dt, n) {
      for (var q = 0; q < (n || 1); q++) {
        phaseV(dt / 2); FFT(S.re, S.im, false);
        for (var i = 0; i < N; i++) { var a = -S.k[i] * S.k[i] / (2 * S.mass) * dt, c = Math.cos(a), s = Math.sin(a), r = S.re[i], m = S.im[i]; S.re[i] = r * c - m * s; S.im[i] = r * s + m * c; }
        FFT(S.re, S.im, true); phaseV(dt / 2); S.t += dt;
      }
    };
    S.absorb = function (w) { for (var i = 0; i < N; i++) { var d = Math.min(i, N - 1 - i) / (w * N); if (d < 1) { var f = 0.9 + 0.1 * d; S.re[i] *= f; S.im[i] *= f; } } };
    S.prob = function (i) { return S.re[i] * S.re[i] + S.im[i] * S.im[i]; };
    S.norm = function () { var s = 0; for (var i = 0; i < N; i++) s += S.prob(i) * S.dx; return s; };
    S.mean = function () { var s = 0, s2 = 0; for (var i = 0; i < N; i++) { var p = S.prob(i) * S.dx; s += S.x[i] * p; s2 += S.x[i] * S.x[i] * p; } return [s, Math.sqrt(Math.max(0, s2 - s * s))]; };
    S.sumWhere = function (pred) { var s = 0; for (var i = 0; i < N; i++) if (pred(S.x[i])) s += S.prob(i) * S.dx; return s; };
    return S;
  }
  /* ---------- the plate ---------- */
  var P = null, kit = null;

  // Small state-vector simulator. Qubit 0 is the LEFTMOST (most significant) bit, textbook ordering.

  /* Exact STO-3G H2 integrals (Szabo & Ostlund), for chemistry chapters */
  function H2(R) {
    var d = [0.444635, 0.535328, 0.154329], a = [0.109818, 0.405771, 2.22766].map(function (x) { return x * 1.24 * 1.24; }), PI = Math.PI;
    function erf(x) { var t = 1 / (1 + 0.5 * Math.abs(x)), y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : -y; }
    function F0(t) { return t < 1e-10 ? 1 : 0.5 * Math.sqrt(PI / t) * erf(Math.sqrt(t)); }
    var pos = [0, R], c = d.map(function (x, i) { return x * Math.pow(2 * a[i] / PI, 0.75); }), S = [[0, 0], [0, 0]], T = [[0, 0], [0, 0]], Vn = [[0, 0], [0, 0]], i, j, p, q, G = {};
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) for (p = 0; p < 3; p++) for (q = 0; q < 3; q++) { var ap = a[p], aq = a[q], sm = ap + aq, R2 = (pos[i] - pos[j]) * (pos[i] - pos[j]), P = (ap * pos[i] + aq * pos[j]) / sm, cc = c[p] * c[q], ov = Math.pow(PI / sm, 1.5) * Math.exp(-ap * aq / sm * R2); S[i][j] += cc * ov; T[i][j] += cc * ap * aq / sm * (3 - 2 * ap * aq / sm * R2) * ov; for (var nn = 0; nn < 2; nn++) Vn[i][j] += cc * (-2 * PI / sm * Math.exp(-ap * aq / sm * R2) * F0(sm * (P - pos[nn]) * (P - pos[nn]))); }
    function eri(i, j, k, l) { var key = "" + i + j + k + l; if (G[key] !== undefined) return G[key]; var sum = 0; for (var p = 0; p < 3; p++) for (var q = 0; q < 3; q++) for (var r = 0; r < 3; r++) for (var t = 0; t < 3; t++) { var A = a[p], B = a[q], C = a[r], D = a[t], P = (A * pos[i] + B * pos[j]) / (A + B), Q = (C * pos[k] + D * pos[l]) / (C + D); sum += c[p] * c[q] * c[r] * c[t] * 2 * Math.pow(PI, 2.5) / ((A + B) * (C + D) * Math.sqrt(A + B + C + D)) * Math.exp(-A * B / (A + B) * (pos[i] - pos[j]) * (pos[i] - pos[j]) - C * D / (C + D) * (pos[k] - pos[l]) * (pos[k] - pos[l])) * F0((A + B) * (C + D) / (A + B + C + D) * (P - Q) * (P - Q)); } return (G[key] = sum); }
    var Hc = [[T[0][0] + Vn[0][0], T[0][1] + Vn[0][1]], [T[1][0] + Vn[1][0], T[1][1] + Vn[1][1]]], s12 = S[0][1], g = [1 / Math.sqrt(2 + 2 * s12), 1 / Math.sqrt(2 + 2 * s12)], u = [1 / Math.sqrt(2 - 2 * s12), -1 / Math.sqrt(2 - 2 * s12)];
    function mo(X, Y) { var v = 0; for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) v += X[i] * Y[j] * Hc[i][j]; return v; }
    function two(X, Y, Z, W) { var v = 0; for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) for (var k = 0; k < 2; k++) for (var l = 0; l < 2; l++) v += X[i] * Y[j] * Z[k] * W[l] * eri(i, j, k, l); return v; }
    var hg = mo(g, g), hu = mo(u, u), Jgg = two(g, g, g, g), Juu = two(u, u, u, u), Jgu = two(g, g, u, u), Kgu = two(g, u, g, u), Ehf = 2 * hg + Jgg, E2 = 2 * hu + Juu, tr = Ehf + E2, det = Ehf * E2 - Kgu * Kgu, Ef = tr / 2 - Math.sqrt(tr * tr / 4 - det);
    return { R: R, S: S, T: T, V: Vn, H: Hc, eri: eri, hg: hg, hu: hu, Jgg: Jgg, Juu: Juu, Jgu: Jgu, Kgu: Kgu, Enuc: 1 / R, Ehf: Ehf + 1 / R, Efci: Ef + 1 / R, E2: E2 + 1 / R };
  }
  function QSim(n) {
    var N = 1 << n, S = { n: n, re: new Float64Array(N), im: new Float64Array(N) };
    S.reset = function () { S.re.fill(0); S.im.fill(0); S.re[0] = 1; return S; };
    function bit(q) { return 1 << (n - 1 - q); }
    S.u1 = function (q, m) { // m = [[ar,ai],[br,bi],[cr,ci],[dr,di]] for [[a,b],[c,d]]
      var b = bit(q);
      for (var i = 0; i < N; i++) if (!(i & b)) { var j = i | b, xr = S.re[i], xi = S.im[i], yr = S.re[j], yi = S.im[j];
        S.re[i] = m[0][0] * xr - m[0][1] * xi + m[1][0] * yr - m[1][1] * yi; S.im[i] = m[0][0] * xi + m[0][1] * xr + m[1][0] * yi + m[1][1] * yr;
        S.re[j] = m[2][0] * xr - m[2][1] * xi + m[3][0] * yr - m[3][1] * yi; S.im[j] = m[2][0] * xi + m[2][1] * xr + m[3][0] * yi + m[3][1] * yr; }
      return S; };
    S.ctrl = function (c, q, m) { var cb = bit(c), b = bit(q);
      for (var i = 0; i < N; i++) if ((i & cb) && !(i & b)) { var j = i | b, xr = S.re[i], xi = S.im[i], yr = S.re[j], yi = S.im[j];
        S.re[i] = m[0][0] * xr - m[0][1] * xi + m[1][0] * yr - m[1][1] * yi; S.im[i] = m[0][0] * xi + m[0][1] * xr + m[1][0] * yi + m[1][1] * yr;
        S.re[j] = m[2][0] * xr - m[2][1] * xi + m[3][0] * yr - m[3][1] * yi; S.im[j] = m[2][0] * xi + m[2][1] * xr + m[3][0] * yi + m[3][1] * yr; }
      return S; };
    var r2 = Math.SQRT1_2;
    S.G = { X: [[0, 0], [1, 0], [1, 0], [0, 0]], Y: [[0, 0], [0, -1], [0, 1], [0, 0]], Z: [[1, 0], [0, 0], [0, 0], [-1, 0]], H: [[r2, 0], [r2, 0], [r2, 0], [-r2, 0]], S: [[1, 0], [0, 0], [0, 0], [0, 1]], T: [[1, 0], [0, 0], [0, 0], [r2, r2]], I: [[1, 0], [0, 0], [0, 0], [1, 0]] };
    S.rot = function (axis, th) { var c = Math.cos(th / 2), s = Math.sin(th / 2); if (axis === "x") return [[c, 0], [0, -s], [0, -s], [c, 0]]; if (axis === "y") return [[c, 0], [-s, 0], [s, 0], [c, 0]]; return [[c, -s], [0, 0], [0, 0], [c, s]]; };
    S.g = function (name, q) { return S.u1(q, S.G[name]); };
    S.cx = function (c, t) { return S.ctrl(c, t, S.G.X); };
    S.cz = function (c, t) { return S.ctrl(c, t, S.G.Z); };
    S.ccx = function (a, b, t) { var ab = bit(a), bb = bit(b), tb = bit(t); for (var i = 0; i < N; i++) if ((i & ab) && (i & bb) && !(i & tb)) { var j = i | tb, r = S.re[i], m = S.im[i]; S.re[i] = S.re[j]; S.im[i] = S.im[j]; S.re[j] = r; S.im[j] = m; } return S; };
    S.prob = function (i) { return S.re[i] * S.re[i] + S.im[i] * S.im[i]; };
    S.probs = function () { var p = []; for (var i = 0; i < N; i++) p.push(S.prob(i)); return p; };
    S.pq = function (q) { var b = bit(q), p = 0; for (var i = 0; i < N; i++) if (i & b) p += S.prob(i); return p; };
    S.bloch = function (q) { // reduced Bloch vector of qubit q
      var b = bit(q), r00 = 0, r11 = 0, r01r = 0, r01i = 0;
      for (var i = 0; i < N; i++) if (!(i & b)) { var j = i | b; r00 += S.prob(i); r11 += S.prob(j); r01r += S.re[i] * S.re[j] + S.im[i] * S.im[j]; r01i += S.im[i] * S.re[j] - S.re[i] * S.im[j]; }
      return [2 * r01r, -2 * r01i, r00 - r11]; };
    S.label = function (i) { var s = ""; for (var q = 0; q < n; q++) s += (i & bit(q)) ? "1" : "0"; return s; };
    return S.reset();
  }
  window.Book = {
    plate: function (def) { P = def; },
    save: save, state: S,
    text: function (id, s) { var e = $(id); if (e) e.textContent = s; },
    html: function (id, s) { var e = $(id); if (e) e.innerHTML = s; },
    reveal: function (id, on) { var e = $(id); if (e) e.classList.toggle("shown", !!on); },
    setVal: function (name, v) { setTangle(name, v, true); },
    beat: function () { return S.beat; },
    Solver: Solver,
    QSim: QSim,
    H2: H2,
    _tap: function (x, y) { if (P && P.tap) P.tap(x, y, kit); },
    _test: function (now) { kit.clear(); if (P && P.draw) P.draw(kit, now || performance.now()); return { cap: P && P.caption ? P.caption() : "", out: P && P.readout ? P.readout() : "" }; }
  };

  function start() {
    var cv = $("cv");
    kit = Kit(cv); kit.fit();
    if (P && P.init) P.init(kit, S);
    if (window.ResizeObserver) new ResizeObserver(function () { kit.fit(); if (P && P.resize) P.resize(kit); }).observe(cv);
    if (P && P.tap) { cv.style.cursor = "pointer"; cv.addEventListener("pointerdown", function (e) { var r = cv.getBoundingClientRect(); P.tap(e.clientX - r.left, e.clientY - r.top, kit); }); }
    var raf = 0, lastCap = 0;
    function loop(now) {
      kit.t = now;
      if (P && P.draw) { kit.clear(); P.draw(kit, now); }
      if (now - lastCap > 150) { lastCap = now; if (P && P.caption) $("cap").textContent = P.caption(); if (P && P.readout) $("count").textContent = P.readout(); }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", function () { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(loop); });

    /* beats */
    var beats = all(".beat"), stage = $("stage");
    function current() {
      var pr = stage.getBoundingClientRect(), vh = window.innerHeight, stacked = pr.width > window.innerWidth * 0.8;
      var line = stacked ? pr.bottom + (vh - pr.bottom) * 0.4 : vh * 0.5, cur = 0;
      for (var i = 0; i < beats.length; i++) if (beats[i].getBoundingClientRect().top <= line) cur = i;
      return cur;
    }
    function enter(i, first) {
      if (i === S.beat && !first) return;
      S.beat = i; save();
      beats.forEach(function (b, k) { b.classList.toggle("now", k === i); });
      if (P && P.beat) P.beat(i, kit);
      if (i === beats.length - 1) { try { localStorage.setItem("qbook.read." + CH, "1"); } catch (e) {} }
    }
    window.Book._enter = function (i) { enter(i); };
    var q = false;
    function onScroll() {
      if (q) return; q = true;
      requestAnimationFrame(function () {
        q = false; var b = current(); if (b !== S.beat) enter(b);
        var max = document.documentElement.scrollHeight - window.innerHeight;
        $("bar").style.width = (max > 0 ? Math.min(100, window.scrollY / max * 100) : 0) + "%";
        S.y = window.scrollY; save();
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    /* words that act */
    all("[data-act]").forEach(function (b) { b.addEventListener("click", function () { if (P && P.act) P.act(b.getAttribute("data-act"), b, kit); }); });
    all("[data-hold]").forEach(function (b) {
      var name = b.getAttribute("data-hold"), on = false;
      function down(e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} on = true; b.classList.add("firing"); if (P && P.hold) P.hold(name, true, kit); }
      function up() { if (!on) return; on = false; b.classList.remove("firing"); if (P && P.hold) P.hold(name, false, kit); }
      b.addEventListener("pointerdown", down);
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { b.addEventListener(ev, up); });
      b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
    all("[data-pick]").forEach(function (b) {
      var parts = b.getAttribute("data-pick").split(":"), g = parts[0], v = parts[1];
      b.addEventListener("click", function () { S.picks[g] = v; save(); showPicks(); if (P && P.pick && g !== "pr") P.pick(g, v, kit); });
    });
    function showPicks() {
      all("[data-pick]").forEach(function (b) { var p = b.getAttribute("data-pick").split(":"); var on = S.picks[p[0]] === p[1]; b.classList.toggle("pick", on); b.setAttribute("aria-pressed", String(on)); });
      all("[data-if-pick]").forEach(function (e) { var p = e.getAttribute("data-if-pick").split(":"); e.hidden = S.picks[p[0]] !== p[1]; });
      all("[data-if-nopick]").forEach(function (e) { e.hidden = !!S.picks[e.getAttribute("data-if-nopick")]; });
    }
    showPicks();

    /* draggable numbers */
    all(".tangle").forEach(function (t) {
      var name = t.getAttribute("data-var"), num = t.querySelector(".num");
      var init = S.vals[name] != null ? S.vals[name] : +t.getAttribute("data-value");
      setTangle(name, init, true, true);
      var drag = null, px = +(t.getAttribute("data-px") || 4), step = +(t.getAttribute("data-step") || 1);
      num.addEventListener("pointerdown", function (e) { e.preventDefault(); drag = { x: e.clientX, v: tangleVal(name) }; num.classList.add("drag"); try { num.setPointerCapture(e.pointerId); } catch (_) {} });
      num.addEventListener("pointermove", function (e) { if (drag) setTangle(name, drag.v + Math.round((e.clientX - drag.x) / px) * step); });
      ["pointerup", "pointercancel"].forEach(function (ev) { num.addEventListener(ev, function () { drag = null; num.classList.remove("drag"); }); });
      num.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setTangle(name, tangleVal(name) - step); } if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setTangle(name, tangleVal(name) + step); } });
      all("button[data-de]", t).forEach(function (b) {
        var d = +b.getAttribute("data-de") * step, rep = 0;
        function stop() { clearInterval(rep); }
        b.addEventListener("pointerdown", function (e) { e.preventDefault(); setTangle(name, tangleVal(name) + d); stop(); var t0 = Date.now(); rep = setInterval(function () { if (Date.now() - t0 > 350) setTangle(name, tangleVal(name) + d); }, 70); });
        ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { b.addEventListener(ev, stop); });
        b.addEventListener("click", function (e) { if (e.detail === 0) setTangle(name, tangleVal(name) + d); });
      });
    });

    /* questions, calculations, depth */
    all(".qa").forEach(function (qq) { qq.addEventListener("click", function () { qq.classList.toggle("open"); }); });
    all("form.calc").forEach(function (f) {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var inp = f.querySelector("input"), fb = f.nextElementSibling, v = parseFloat(String(inp.value).replace(",", ".").replace("−", "-"));
        var ans = +f.getAttribute("data-answer"), tol = +(f.getAttribute("data-tol") || Math.abs(ans) * 0.02);
        if (isNaN(v)) { fb.textContent = "Type a number."; return; }
        if (Math.abs(v - ans) <= tol) { fb.textContent = f.getAttribute("data-ok") || "Yes."; f.classList.add("right"); return; }
        var alts = (f.getAttribute("data-alt") || "").split("|").filter(Boolean);
        for (var i = 0; i < alts.length; i++) { var p = alts[i].split("~"); if (Math.abs(v - +p[0]) <= Math.abs(+p[0]) * 0.02 + 1e-12) { fb.textContent = p[1]; return; } }
        fb.textContent = f.getAttribute("data-hint") || "Not quite. Try again.";
      });
    });
    var LEVELS = ["intuition", "standard", "deep"], lvl = "standard";
    try { lvl = localStorage.getItem("qbook.level") || "standard"; } catch (e) {}
    function setLevel(l) { lvl = l; root.setAttribute("data-level", l); var dn = $("depth-name"); if (dn) dn.textContent = l; try { localStorage.setItem("qbook.level", l); } catch (e) {} setTimeout(fitEqs, 30); }
    var db = $("depth"); if (db) db.addEventListener("click", function () { setLevel(LEVELS[(LEVELS.indexOf(lvl) + 1) % 3]); });
    setLevel(LEVELS.indexOf(lvl) >= 0 ? lvl : "standard");

    var jump = /[?&]beat=(\d+)/.exec(location.search);
    if (jump && beats[+jump[1]]) setTimeout(function () { window.scrollTo(0, beats[+jump[1]].getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.55); }, 60);
    else if (S.y) setTimeout(function () { window.scrollTo(0, S.y); }, 60);
    enter(Math.min(S.beat || 0, beats.length - 1), true);
    setTimeout(onScroll, 150);
  }

  /* tangle helpers */
  var TV = {};
  function tangleVal(name) { return TV[name]; }
  function setTangle(name, v, silent, first) {
    var t = document.querySelector('.tangle[data-var="' + name + '"]'); if (!t) { TV[name] = v; return; }
    var mn = +t.getAttribute("data-min"), mx = +t.getAttribute("data-max"), dec = +(t.getAttribute("data-dec") || 0), unit = t.getAttribute("data-unit") || "";
    v = Math.max(mn, Math.min(mx, +(+v).toFixed(dec)));
    var changed = TV[name] !== v; TV[name] = v;
    all('.tangle[data-var="' + name + '"] .num').forEach(function (n) { n.textContent = v.toFixed(dec) + (unit ? " " + unit : ""); n.setAttribute("aria-valuenow", v); });
    S.vals[name] = v; save();
    if ((changed || first) && P && P.set) P.set(name, v, kit, !!first);
  }

  // Shrink display equations that are wider than the text column (narrow screens), down to 62%; beyond that they scroll.
  function fitEqs() {
    var eqs = document.querySelectorAll(".eq");
    for (var i = 0; i < eqs.length; i++) {
      var e = eqs[i], k = e.querySelector(".katex-display"); if (!k) continue;
      k.style.fontSize = ""; var cw = e.clientWidth, f = 1;
      for (var it = 0; it < 5 && cw > 0 && Math.max(k.scrollWidth, e.scrollWidth) > cw + 1 && f > 0.62; it++) { f = Math.max(0.62, f * (cw - 4) / Math.max(k.scrollWidth, e.scrollWidth)); k.style.fontSize = f.toFixed(3) + "em"; }
    }
  }
  var fitT = 0; window.addEventListener("resize", function () { clearTimeout(fitT); fitT = setTimeout(fitEqs, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitEqs);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { start(); fitEqs(); }); else { start(); fitEqs(); }
})();
