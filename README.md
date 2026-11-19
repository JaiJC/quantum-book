# Quantum

An interactive 214-chapter book on quantum mechanics, quantum field theory, quantum computing and quantum biology, with a live simulation ("plate") in every chapter. It installs as an offline web app.

Live: https://quantum-book-phi.vercel.app

## Layout

- `book/chapters/NNN.html` — chapter sources: `<section class="beat">` blocks plus a `<script type="plate">` simulation. TeX is written as `{{tex:…}}` / `{{texd:…}}` and rendered by KaTeX at build time.
- `build-book.mjs` — builds everything into `site/`.
- `site/` — the built, deployable app (`engine.js`, `book.css`, `c/NNN.html`, service worker).
- `audit/` — review notes.

## Build and deploy

```bash
npm install katex
node build-book.mjs
cd site && vercel deploy --prod
```

## Status

Every chapter was reviewed in November 2026. That review recomputed every exercise in code, checked derivations, re-ran the numbers the chapters quote from their simulations, and checked recent citations against primary sources. Claims carry Established / Debated / Speculative labels.
