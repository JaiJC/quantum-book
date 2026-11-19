# Quantum

**An interactive book on quantum physics, from the first wave to the frontier of computing and life.**

214 chapters. Each one has a live simulation, a question to answer before you read on, and a worked problem at the end. It works offline on your phone or computer once you've opened it.

**Read it:** https://quantum-book-phi.vercel.app

---

## Contents

- [What's in the book](#whats-in-the-book)
- [Who it's for](#who-its-for)
- [Use it offline on your device](#use-it-offline-on-your-device)
- [How the repository is organised](#how-the-repository-is-organised)
- [Build and run it yourself](#build-and-run-it-yourself)
- [How a chapter works](#how-a-chapter-works)
- [Contributing](#contributing)
- [Reporting an error](#reporting-an-error)
- [Licence](#licence)

---

## What's in the book

| Part | Chapters | Topic |
|---|---|---|
| Zero | 1–21 | Foundations: the maths and classical physics the rest relies on |
| One | 22–54 | Quantum mechanics, from Planck to interpretations |
| Two | 55–92 | Quantum field theory and the Standard Model |
| Three | 93–155 | Quantum information, computing, error correction and hardware |
| Four | 156–181 | Quantum biology: what is established, debated and speculative |
| Five | 182–207 | Quantum computing applied to chemistry, biology and medicine |
| Capstones | 208–214 | Projects, exams and debates |

Every chapter has the same shape:

1. **An opening puzzle** and a live simulation, called the *plate*, at the top of the screen.
2. **A "Predict first" question.** Tap an answer, see whether you were right and why, then test it on the plate.
3. **Short sections** you can read at three depths. The **Aa** button switches between *Intuition* (mostly story), *Standard* and *Deep* (full derivations).
4. **Three questions to carry with you**, and **one problem to work out**, checked instantly.
5. **Sources**, and a note on what was checked by computer.

Every claim is labelled **Established**, **Debated** or **Speculative**.

All 214 chapters were reviewed in November 2026:

- every exercise was recomputed in code;
- derivations were checked;
- the numbers each simulation shows were re-run independently;
- recent claims were checked against primary sources.

**How it was made:** the text, simulations and code were written with an AI model (Anthropic's Claude), directed, checked and edited by the author. That is why the checking described above matters, and why corrections are so valuable.

It has not yet had a review by a professional physicist. Corrections are very welcome (see [Reporting an error](#reporting-an-error)).

## Who it's for

Readers who already have **first-year university maths** and want to learn quantum mechanics properly: engineers, chemists, life scientists with a quantitative background, and physics students who want a second pass.

You'll need to be comfortable with:

- derivatives and integrals of one variable;
- vectors and matrices;
- school-level trigonometry and complex numbers.

Part Zero is a fast refresher, not a first course. If calculus or linear algebra is new to you, learn those first, then come back.

---

## Use it offline on your device

The book is a **Progressive Web App**: a website your browser can save and run like an app. Open it once while online, and every chapter, simulation and equation is saved on your device (about 9 MB). After that it works with no internet connection.

### iPhone or iPad (Safari)

1. Open https://quantum-book-phi.vercel.app in **Safari**.
2. Tap the **Share** button (the square with an arrow).
3. Tap **Add to Home Screen**, then **Add**.
4. Open it from the new **Quantum** icon. It runs full-screen, like an app.

### Android (Chrome)

1. Open https://quantum-book-phi.vercel.app in **Chrome**.
2. Tap the **⋮** menu.
3. Tap **Install app** (or **Add to Home screen**).
4. Open it from the new icon.

### Computer (Chrome or Edge)

1. Open https://quantum-book-phi.vercel.app.
2. Click the **install** icon at the right of the address bar, or open the menu and choose **Install Quantum** (Edge: **Apps → Install this site as an app**).

### Mac (Safari)

1. Open the site in Safari.
2. Choose **File → Add to Dock**.

### Check that it works offline

Open the app once while online, then turn on airplane mode and open any chapter. It should load normally.

### Good to know

- **Updates** download automatically whenever you open the app while online.
- **Your reading progress** (last chapter, chapters read, your answers) is stored only on your device. There are no accounts and no analytics. The only outside request is for the text fonts, from Google Fonts, on first load.
- If you **clear your browser's website data**, the saved copy goes too. Open the site online once to download it again.
- Opening the files in `site/` straight from your disk won't work offline the same way. Use the website, or run the local server described below.

---

## How the repository is organised

```
book/
  chapters/001.html … 214.html   ← the book's source: one file per chapter
  engine.js                       ← shared runtime: scrolling, plates, controls, simulators
  book.css                        ← all styling (black background, amber accents)
  hero.html                       ← the live double-slit experiment on the landing page
  icons/                          ← app icons for the home screen
toc.json                          ← parts, chapter titles, one-line hooks
build-book.mjs                    ← builds book/ into site/
site/                             ← the built app that gets deployed (generated, don't edit)
  index.html, c/NNN.html, engine.js, book.css, katex.css, sw.js, manifest.webmanifest, icons/
audit/                            ← review notes: the numbers checked for each chapter
src/, build.mjs, epub.py,
package_epub.py, pwa.py           ← early prototypes (EPUB and a single-page version), no longer used
```

**Always edit `book/`, never `site/`.** `site/` is regenerated on every build.

The build:

1. Reads `toc.json` and every chapter in `book/chapters/`.
2. Renders all maths with KaTeX in advance, so pages need no maths library at run time.
3. Wraps each chapter in the page template and writes `site/c/NNN.html`.
4. Builds the landing page, `site/index.html`, from `toc.json` and `book/hero.html`.
5. Writes the offline worker (`site/sw.js`), which pre-caches every page.

---

## Build and run it yourself

You need **Node.js 18 or newer** and **Python 3** (for the local server).

```bash
git clone https://github.com/JaiJC/quantum-book.git
```

```bash
cd quantum-book
```

```bash
npm install
```

```bash
npm run build
```

```bash
npm run serve
```

Then open http://localhost:8804.

When you change something, run `npm run build` again and reload the page. If the old version keeps showing, the offline worker is serving its saved copy. Do a hard reload, or open the page in a private window.

To deploy your own copy, `site/` is a plain static folder that any static host can serve: Vercel, Netlify, GitHub Pages, Cloudflare Pages and so on. With Vercel:

```bash
cd site && vercel deploy --prod
```

---

## How a chapter works

A chapter file in `book/chapters/` has two parts.

**1. Text, in sections called *beats*:**

```html
<section class="beat" data-beat="1">
  <h2>Two spots</h2>
  <p>Set the field to <span class="tangle" data-var="B" data-min="0" data-max="3"
     data-step="0.1" data-dec="1" data-value="1.0">…</span> tesla and
     <button type="button" class="v" data-act="fire">fire the beam</button>.</p>
  <p>The energy is {{tex:E = h f}}, or in display form: {{texd:E_n = -13.6/n^2\ \text{eV}}}</p>
</section>
```

- `{{tex:…}}` is inline maths and `{{texd:…}}` is displayed maths (LaTeX, rendered at build time).
- `.tangle` is a number the reader can drag; `data-act` is a word that does something on the plate; `data-pick="group:value"` is a tappable choice.
- `data-if-pick="group:value"` shows an element only after that choice is made.
- As the reader scrolls, the plate learns which beat is on screen.

**2. The plate, a small script that draws the simulation:**

```html
<script type="plate">
Book.plate({
  init(kit, state) { /* set up */ },
  beat(i)         { /* the reader scrolled to beat i */ },
  set(name, v)    { /* a draggable number changed */ },
  act(name)       { /* a data-act word was tapped */ },
  pick(group, v)  { /* a data-pick choice was made */ },
  caption()       { return "What the plate shows"; },
  readout()       { return "live numbers"; },
  draw(kit, now)  { /* draw a frame with kit.axes, kit.plot, kit.line, kit.circle, kit.text … */ }
});
</script>
```

The engine also provides shared simulators that plates reuse:

- `Book.QSim(n)`: an n-qubit state-vector simulator, with qubit 0 as the leftmost bit.
- `Book.H2(R)`: exact STO-3G integrals for the hydrogen molecule.
- `Book.Solver`: a split-step Schrödinger solver.

**"Predict first" cards** sit just before the section that reveals the answer, and use the pick group `pr`:

```html
<!--predict--><div class="predict"><span class="pk">Predict first</span>
  <p>Question? <button type="button" class="v" data-pick="pr:a">answer A</button> or …</p>
  <p class="hint" data-if-nopick="pr">Choose before you scroll on.</p>
  <p class="pfb" data-if-pick="pr:a" hidden><span class="ok">Right.</span> Why. Now check it on the plate.</p>
  …
</div><!--/predict-->
```

---

## Contributing

Contributions are welcome, especially corrections from people who know the physics. The book's value depends on being right, so the rules are mostly about checking.

### The rules

1. **Accuracy first.** Every number, date, name and citation must be checkable. Recompute any number you add or change, and say how you checked it in the pull request.
2. **Label every claim.** Use `<span class="tag">Established</span>`, `Debated` or `Speculative`. Don't promote a debated result to established.
3. **Cite primary sources** in the chapter's `p.sources` line: the original paper or an authoritative review, with journal, volume, page and year. Don't invent page numbers or author lists. If you're unsure, leave the detail out.
4. **Keep the voice.** Write short sentences in plain British English and explain before you formalize. Address the reader as "you". Avoid jargon without a definition.
5. **Keep it interactive and never stuck.** Every chapter keeps one "Predict first" card placed before its answer, a working plate, three questions and one checked problem. Nothing may block a reader from scrolling on.
6. **Keep the look.** Black background and warm amber accents. No blue or bluish tints. Use the existing CSS variables in `book.css`.
7. **Edit `book/`, not `site/`.** Rebuild and include the regenerated `site/` files in the same pull request so the live site matches.
8. **One topic per pull request.** For example, fix one chapter, or change one engine feature.
9. **Cross-references must be right.** If you write "Chapter N", check that N's title in `toc.json` matches what you mean.

### Before you open a pull request

- [ ] `npm run build` finishes without errors.
- [ ] The chapter loads at `localhost:8804/c/NNN.html` with no errors in the browser console.
- [ ] Every beat's plate draws something, and every control (drag, tap, pick) responds.
- [ ] The "Predict first" card shows the right feedback for each answer.
- [ ] The end-of-chapter problem accepts the correct answer.
- [ ] Nothing overflows sideways at phone width (375 px) or desktop width.
- [ ] Every changed number has been recomputed, and the pull request says how.

### Workflow

1. Fork the repository and create a branch named for your change, for example `fix-ch43-hom-dip`.
2. Make your change in `book/`, run `npm run build`, and test as above.
3. Open a pull request that explains **what** changed, **why**, and **how you checked it**. Link the source for any new fact.
4. Pull requests are reviewed by the maintainer before merging.

---

## Reporting an error

Found a mistake? Please [open an issue](https://github.com/JaiJC/quantum-book/issues) and include:

- **the chapter number and section heading**;
- **what it says now**, quoted;
- **what it should say**, and why;
- **a source**, such as a paper, textbook page or calculation.

Typos, confusing explanations and broken simulations are all worth reporting.

---

## Licence

The book uses two licences, one for its content and one for its code.

- **Content: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).** This covers the text, questions, exercises and explanations (`book/chapters/`, `toc.json`, `audit/`, and the chapter pages in `site/c/`). You may share, translate and adapt it for free if you:
  - **credit** the book and link to it;
  - **don't use it commercially**;
  - **release adaptations under the same licence**.

  Full text: [LICENSE-CONTENT](LICENSE-CONTENT).
- **Code: [MIT](LICENSE).** This covers the engine, styles, build script, landing-page simulation and the simulation scripts inside each chapter. You can reuse it for anything, as long as you keep the copyright notice.

**Contributions** are accepted under the same terms: code under MIT, content under CC BY-NC-SA 4.0. By opening a pull request you agree to this.

For commercial use of the content, such as a paid course or a print edition, please [open an issue](https://github.com/JaiJC/quantum-book/issues) to ask.

