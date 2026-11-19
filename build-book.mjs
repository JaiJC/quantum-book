// Builds the whole book into site/: library, one page per written chapter, shared engine, offline worker.
import fs from "node:fs";
import crypto from "node:crypto";
import katex from "katex";

const OUT = "site";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT + "/c", { recursive: true });
fs.mkdirSync(OUT + "/icons", { recursive: true });
for (const f of fs.readdirSync("book/icons")) fs.copyFileSync("book/icons/" + f, OUT + "/icons/" + f);
fs.writeFileSync(OUT + "/.gitignore", ".vercel\n");

const toc = JSON.parse(fs.readFileSync("toc.json", "utf8"));
const flat = toc.flatMap(p => p.chapters.map(c => ({ ...c, part: p })));
const pad = n => String(n).padStart(3, "0");
const written = new Set(fs.readdirSync("book/chapters").filter(f => /^\d{3}\.html$/.test(f)).map(f => +f.slice(0, 3)));

function tex(html) {
  let out = "", i = 0;
  for (;;) {
    const s = html.indexOf("{{tex", i);
    if (s < 0) { out += html.slice(i); break; }
    const colon = html.indexOf(":", s), kind = html.slice(s + 2, colon);
    let j = colon + 1, depth = 0;
    while (!(depth === 0 && html.startsWith("}}", j))) {
      if (html[j] === "\\") j++; else if (html[j] === "{") depth++; else if (html[j] === "}") depth--;
      if (++j >= html.length) throw new Error("unclosed placeholder at " + s);
    }
    out += html.slice(i, s) + katex.renderToString(html.slice(colon + 1, j), { displayMode: kind === "texd", output: "htmlAndMathml", throwOnError: true, strict: "error" });
    i = j + 2;
  }
  return out;
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inl = s => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

// shared assets
let kcss = fs.readFileSync("node_modules/katex/dist/katex.min.css", "utf8");
kcss = kcss.replace(/src:url\(fonts\/([^)]+?\.woff2)\) format\("woff2"\)[^;}]*/g, (_, f) =>
  `src:url(data:font/woff2;base64,${fs.readFileSync("node_modules/katex/dist/fonts/" + f).toString("base64")}) format("woff2")`);
fs.writeFileSync(OUT + "/katex.css", kcss);
fs.writeFileSync(OUT + "/book.css", fs.readFileSync("book/book.css", "utf8"));
fs.writeFileSync(OUT + "/engine.js", fs.readFileSync("book/engine.js", "utf8"));

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,300;1,6..72,400&family=JetBrains+Mono:wght@400;500&display=swap">`;
const HEAD = (title, rel) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Quantum">
<link rel="manifest" href="${rel}manifest.webmanifest"><link rel="apple-touch-icon" href="${rel}icons/apple-touch-icon.png">
<title>${esc(title)}</title>${FONTS}
<link rel="stylesheet" href="${rel}katex.css"><link rel="stylesheet" href="${rel}book.css">
<style>body{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}</style></head>`;
const SW = rel => `<script>if("serviceWorker"in navigator)addEventListener("load",function(){navigator.serviceWorker.register("${rel}sw.js").catch(function(){})});if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(function(){});</script>`;

const files = ["./", "index.html", "book.css", "engine.js", "katex.css", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];

// chapters
const order = flat.filter(c => written.has(c.n));
for (const c of order) {
  const src = fs.readFileSync(`book/chapters/${pad(c.n)}.html`, "utf8");
  const sm = /<script type="plate">([\s\S]*?)<\/script>/.exec(src);
  const body = tex(src.replace(/<script type="plate">[\s\S]*?<\/script>/, ""));
  const idx = order.indexOf(c), prev = order[idx - 1], next = order[idx + 1];
  const nextAny = flat[flat.indexOf(c) + 1];
  const nav = `<nav class="chnav">${prev ? `<a href="${pad(prev.n)}.html">← ${prev.n}. ${esc(prev.title)}</a>` : "<span></span>"}<a href="../index.html">Contents</a>${next ? `<a href="${pad(next.n)}.html">${next.n}. ${esc(next.title)} →</a>` : "<span></span>"}</nav>`;
  const teaser = nextAny ? `<div class="next-ch"><div class="k">Next · Chapter ${nextAny.n}</div><div class="t">${inl(nextAny.title)}</div>${nextAny.hook ? `<p style="text-align:left">${inl(nextAny.hook)}</p>` : ""}${written.has(nextAny.n) ? `<p style="text-align:left"><a class="v" href="${pad(nextAny.n)}.html">Turn the page</a></p>` : `<p class="hint">In preparation.</p>`}</div>` : "";
  const html = `${HEAD(`${c.n}. ${c.title}`, "../")}
<body data-ch="${c.n}">
<header class="run" role="banner"><a class="home" href="../index.html" aria-label="Contents">☰</a><div class="t"><b>${c.n}</b> &nbsp;·&nbsp; ${esc(c.title)}</div><button type="button" class="aa" id="depth" aria-label="Change how deep the text goes">Aa<span id="depth-name">standard</span></button><div class="prog" id="bar"></div></header>
<div class="book">
<figure class="plate" id="stage"><canvas id="cv" aria-hidden="true"></canvas><figcaption><span id="cap"></span><b id="count"></b></figcaption></figure>
<article class="text">
<header class="opener"><div class="num">${c.n}</div><div class="part">${esc(c.part.label)} · ${esc(c.part.name)}</div><h1>${inl(c.title)}</h1></header>
${body}
${teaser}
${nav}
</article></div>
<script src="../engine.js"></script>
<script>${sm ? sm[1] : ""}</script>
${SW("../")}
</body></html>`;
  fs.writeFileSync(`${OUT}/c/${pad(c.n)}.html`, html);
  files.push(`c/${pad(c.n)}.html`);
}

// library
const lib = `${HEAD("Quantum", "")}
<body class="library">
<header class="run" role="banner"><div class="t"><b>Quantum</b> &nbsp;·&nbsp; contents</div><div class="prog" id="bar"></div></header>
<main class="lib">
<div class="cover"><div class="k">An interactive book</div><h1>Quantum</h1><p class="sub">From the first wave to the frontier of physics, computing and life. ${flat.length} chapters, ${written.size} ready.</p>${fs.readFileSync("book/hero.html","utf8")}<a class="cont" id="cont" href="c/${pad(order[0] ? order[0].n : 1)}.html">Begin reading</a><div class="who"><h3>Who this is for</h3><p>Readers who already have first-year university maths and want to learn quantum mechanics properly, all the way to quantum field theory, quantum computing and quantum biology. It was written with engineers, chemists and life scientists with a quantitative background in mind, and suits physics students who want a second pass.</p><h3>What you need first</h3><p>Comfort with derivatives and integrals of one variable, vectors and matrices, and school-level trigonometry and complex numbers. Part 0 (Chapters 2–21) is a fast refresher of the maths and classical physics the rest relies on. It is not a first course: if calculus or linear algebra is new to you, learn those first, then come back.</p><h3>How to read it</h3><p>Read the parts in order. Every chapter asks you to <em>Predict first</em>: answer before you scroll on, then test your answer on the simulation. The <em>Aa</em> button sets the depth: <em>Intuition</em> keeps the story and hides most equations. Every claim is labelled Established, Debated or Speculative.</p></div></div>
${toc.map(p => `<section class="part"><div class="pl">${esc(p.label)}</div><h2 class="pn">${esc(p.name)}</h2><ol>
${p.chapters.map(c => written.has(c.n)
  ? `<li class="ready" data-n="${c.n}"><a href="c/${pad(c.n)}.html"><span class="n">${c.n}</span><span class="tt">${inl(c.title)}</span><span class="hk">${inl(c.hook)}</span></a></li>`
  : `<li data-n="${c.n}"><span class="n">${c.n}</span><span class="tt">${inl(c.title)}</span><span class="hk">${inl(c.hook)}</span></li>`).join("\n")}
</ol></section>`).join("\n")}
</main>
<script>
(function(){var last=null,ready=[].slice.call(document.querySelectorAll("li.ready"));
ready.forEach(function(li){var n=li.getAttribute("data-n");try{if(localStorage.getItem("qbook.read."+n)){li.classList.add("read");last=n}else if(localStorage.getItem("qbook.ch"+n)&&!last)last=n}catch(e){}});
if(last){var i=ready.findIndex(function(li){return li.getAttribute("data-n")===last});var tgt=ready[i]&&!ready[i].classList.contains("read")?ready[i]:(ready[i+1]||ready[i]);if(tgt){var a=document.getElementById("cont");a.href=tgt.querySelector("a").getAttribute("href");a.textContent="Continue: chapter "+tgt.getAttribute("data-n");}}
addEventListener("scroll",function(){var m=document.documentElement.scrollHeight-innerHeight;document.getElementById("bar").style.width=(m>0?scrollY/m*100:0)+"%"},{passive:true});})();
</script>
${SW("")}
</body></html>`;
fs.writeFileSync(OUT + "/index.html", lib);

// manifest + worker
fs.writeFileSync(OUT + "/manifest.webmanifest", JSON.stringify({ name: "Quantum", short_name: "Quantum", start_url: "./", scope: "./", display: "standalone", background_color: "#000000", theme_color: "#000000",
  icons: [{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] }, null, 2));
const ver = crypto.createHash("sha1").update(files.map(f => f === "./" ? "" : fs.readFileSync(OUT + "/" + f)).join("|")).digest("hex").slice(0, 10);
fs.writeFileSync(OUT + "/sw.js", `const CACHE="quantum-${ver}",CORE=${JSON.stringify(files)};
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);
if(u.hostname==="fonts.googleapis.com"||u.hostname==="fonts.gstatic.com"){e.respondWith(caches.open(CACHE).then(c=>c.match(r).then(h=>h||fetch(r).then(x=>{c.put(r,x.clone());return x}))));return}
if(u.origin!==location.origin)return;
if(r.mode==="navigate"){e.respondWith(fetch(r).then(x=>{const cp=x.clone();caches.open(CACHE).then(c=>c.put(r,cp));return x}).catch(()=>caches.match(r,{ignoreSearch:true}).then(h=>h||caches.match("index.html"))));return}
e.respondWith(caches.match(r,{ignoreSearch:true}).then(h=>h||fetch(r).then(x=>{const cp=x.clone();caches.open(CACHE).then(c=>c.put(r,cp));return x})))});`);
fs.writeFileSync(OUT + "/vercel.json", JSON.stringify({ headers: [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }, { source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] }] }, null, 2));
console.log(`site/: ${written.size} chapters written of ${flat.length}; cache ${ver}`);
