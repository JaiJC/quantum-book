// Builds dist/index.html: one self-contained page (math pre-rendered, KaTeX fonts inlined).
import fs from "node:fs";
import katex from "katex";
let html = fs.readFileSync("src/app.html", "utf8");
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
let css = fs.readFileSync("node_modules/katex/dist/katex.min.css", "utf8");
css = css.replace(/src:url\(fonts\/([^)]+?\.woff2)\) format\("woff2"\)[^;}]*/g, (_, f) =>
  `src:url(data:font/woff2;base64,${fs.readFileSync("node_modules/katex/dist/fonts/" + f).toString("base64")}) format("woff2")`);
if (/url\(fonts\//.test(css)) throw new Error("unreplaced font url");
out = out.replace("/*__KATEX_CSS__*/", () => css).replace("/*__APP_JS__*/", () => fs.readFileSync("src/app.js", "utf8"));
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", out);
console.log("dist/index.html", Math.round(out.length / 1024), "KB");
// Local preview: mimic the publish skeleton (doctype, viewport, small reset).
fs.writeFileSync("dist/preview.html", `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${out}</body></html>`);
