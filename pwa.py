"""Build the offline Home Screen app from dist/index.html into pwa-out/."""
import hashlib, json, os, shutil
from PIL import Image, ImageDraw, ImageFilter

OUT = "pwa-out"
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT + "/icons")
page = open("dist/index.html").read()

# ---- icons: dark screen with glowing interference stripes ----
def icon(size, path, pad=0.0):
    im = Image.new("RGB", (size, size), (5, 7, 15))
    glow = Image.new("RGB", (size, size), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    xs = [0.5, 0.36, 0.64, 0.22, 0.78]
    br = [1.0, 0.75, 0.75, 0.42, 0.42]
    inner = size * (1 - 2 * pad)
    for x, b in zip(xs, br):
        cx = size * pad + inner * x
        w = inner * 0.07
        col = (int(255 * b), int(181 * b), int(71 * b))
        d.rounded_rectangle([cx - w / 2, size * (pad + 0.2 * (1 - 2 * pad)), cx + w / 2, size * (1 - pad - 0.2 * (1 - 2 * pad))], radius=w / 2, fill=col)
    blur = glow.filter(ImageFilter.GaussianBlur(size * 0.03))
    im = Image.blend(im, blur, 0.6)
    im.paste(glow, (0, 0), glow.convert("L").point(lambda v: 255 if v > 20 else 0))
    im.save(path)

icon(180, OUT + "/icons/apple-touch-icon.png")
icon(192, OUT + "/icons/icon-192.png")
icon(512, OUT + "/icons/icon-512.png")
icon(512, OUT + "/icons/icon-maskable-512.png", pad=0.1)

manifest = {
    "name": "Quantum Book",
    "short_name": "Quantum",
    "description": "An interactive book on quantum physics, computing and biology.",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#0b0f1c",
    "theme_color": "#0b0f1c",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
json.dump(manifest, open(OUT + "/manifest.webmanifest", "w"), indent=2)

head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0f1c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Quantum">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>
/* Home Screen app: keep content clear of the status bar, home bar and rounded corners. */
body { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);
       padding-left: max(env(safe-area-inset-left), 0px); padding-right: max(env(safe-area-inset-right), 0px); }
html { -webkit-text-size-adjust: 100%; overscroll-behavior-y: none; }
</style>
"""
register = """
<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
</script>
"""
split = page.index("<header")  # everything before the first header is title, fonts and styles
html = head + page[:split] + "\n</head>\n<body>\n" + page[split:] + register + "</body>\n</html>\n"
# the built page keeps its own <style> and markup after the title; move <link>/<style> into head is not needed: browsers accept them in body.
open(OUT + "/index.html", "w").write(html)

files = ["./", "index.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"]
ver = hashlib.sha1(html.encode()).hexdigest()[:10]
sw = """const CACHE = "qbook-%s";
const CORE = %s;
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Fonts: keep a copy so the book looks the same offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Pages: try the network briefly for updates, fall back to the saved copy offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return res; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
});
""" % (ver, json.dumps(files))
open(OUT + "/sw.js", "w").write(sw)
json.dump({"headers": [{"source": "/sw.js", "headers": [{"key": "Cache-Control", "value": "no-cache"}]},
                       {"source": "/(.*)", "headers": [{"key": "X-Robots-Tag", "value": "noindex"}]}]},
          open(OUT + "/vercel.json", "w"), indent=2)
print("OK", OUT, ver, round(len(html) / 1024), "KB")
