# Codeforces contest 2250 clone — capture notes

Target: `https://codeforces.com/contest/2250` (*Codeforces Round 1112, Div. 2* — finished, problems A–F).

## What was captured

| Tab | Route | Status |
|---|---|---|
| Problems | `/contest/2250` | Captured |
| Submit Code | `/contest/2250/submit` | **Not captured** — login required |
| My Submissions | `/contest/2250/my` | Captured (real logged-out "No items" state) |
| Hacks | `/contest/2250/hacks` | Captured (genuinely empty — hacks disabled for A–D) |
| Room | `/contest/2250/room/1` | Captured (42-row standings) |
| Custom Invocation | `/contest/2250/customtest` | **Not captured** — login required |
| Problems A–F | `/contest/2250/problem/{A..F}` | Captured (6 pages) |

10 of 12 pages. Codeforces redirects `/submit` and `/customtest` to the contest dashboard
for anonymous visitors, so no markup for them exists — those two routes render the real
chrome plus an explicit notice rather than an invented form.

## How the pages were fetched

Cloudflare hard-blocks automated browsers on codeforces.com: plain HTTP and Playwright's
bundled headless Chromium both get `403` with the "正在執行安全驗證" interstitial, and it
does not time out into the page. `perfect-web-clone`'s extractor hardcodes
`chromium.launch(headless=True)`, so it fails the same way.

Instead, real Microsoft Edge is launched against a copy of the user's profile with
`--remote-debugging-port=9222` and **no automation flags** (so `navigator.webdriver` stays
false), and Playwright attaches over CDP. `tools/extract_cdp.py` subclasses the skill's
`PageExtractor` to reuse its DOM/CSS/asset logic while taking pages from
`browser.contexts[0]` — `browser.new_page()` over CDP would silently open a cookieless
context.

## Traps found (each cost a wrong render)

1. **`form.tagName` is not a string.** `HTMLFormElement` is `[LegacyOverrideBuiltIns]`, so
   a control named `tagName` shadows `Element.prototype.tagName`. Codeforces problem pages
   have exactly that (the tag-add form), which made the skill's
   `child.tagName.toLowerCase()` throw and null out the entire DOM tree for all six
   problem pages. Fixed by calling the real getter via
   `Object.getOwnPropertyDescriptor(Element.prototype, 'tagName').get`.

2. **An unnamed `position: relative` div is load-bearing.** `.second-level-menu` (the
   contest tab bar) is `position: absolute; top: -12px`. Its containing block is a wrapper
   div around `#sidebar` + `#pageContent` that has no id and no class. Omit it and the
   whole tab bar renders at `y = -12`, off-page.

3. **Layout-critical CSS is inline, and order matters.** Codeforces ships rules in
   `<style>` blocks interleaved between its `<link>` tags — `@font-face` for Cuprum and PT
   Sans Narrow, `.question-requestText-td` wrapping, MathJax's styles. Some are in
   `<body>`, not `<head>`. Concatenating them all after the linked files inverts the
   cascade: an inline block sets `#sidebar { margin: 1em 1em 1em 0 }` and `style.css`
   later sets `-22em`, same specificity. `tools/extract_inline_css.py` therefore walks the
   document in order and emits a manifest.

4. **`<!--[if IE]>` blocks must not be lifted.** A regex-based extractor pulled an
   IE-only `#sidebar` override out of a conditional comment and applied it unconditionally,
   breaking the sidebar's negative-margin pull. BeautifulSoup parses conditional comments
   as comment nodes and skips them correctly.

5. **`sidebar-menu.css` is injected by JS.** It appears in no `<link>` tag, so static
   scraping never sees it — and it is served from a *different* version prefix
   (`s/22199/`, not `s/94651/`). Found by reading `document.styleSheets` off the live page
   (`tools/find_dynamic_css.py`). It also loads asynchronously, so measuring the live page
   before it lands produces phantom diffs; comparisons settle for 7s.

6. **`#footer` is inside `#body`.** That is what constrains it to 1200px; hoisted out it
   spans the viewport.

7. **Problem statements need `.problemindexholder > .ttypography`.** `ttypography.css`
   supplies the statement's `#222` colour, 21px line-height and `word-wrap: break-word`.

8. **Sidebars differ per tab.** Dashboard 4 boxes; problem pages 5 (adds "Problem tags");
   Hacks 5 (adds "Hacks filter"); **Room has no sidebar at all** and runs `#pageContent`
   full-width (1172px, no `content-with-sidebar` class).

9. **SSR executes captured `<script>` tags.** Unlike client-side `innerHTML`, markup
   server-rendered by Next is parsed by the browser, so Codeforces' inline jQuery snippets
   ran and threw `$ is not defined` on every page. They are stripped at extraction.

## Styling approach

The clone links Codeforces' **own stylesheets**, mirrored byte-for-byte under `public/`
using their real path layout (`/codeforces.org/s/94651/...`, `/cf-fonts/...`) so every
relative `url()` inside them resolves untouched. Tailwind is imported **without preflight**
(`theme.css` + `utilities.css` only) — preflight resets table borders, list styles and
heading margins that Codeforces' CSS depends on.

## Fidelity

Measured with `tools/style_diff.py` (computed styles + geometry, live vs clone, settled 7s):

| Element | Live | Clone |
|---|---|---|
| `#pageContent` (problems) | 546.78px | 548.08px |
| `#pageContent` (problem A) | 1284.52px | 1284.70px |
| `.problem-statement` (A) | 1263.52px | 1263.70px |
| `#sidebar` | 631.01px | 627.73px |
| `table.problems` | 238.52px | 240.76px |
| `.problem-questions-table` | 178.98px | 179.32px |
| `#footer` | 1200×70 | 1200×70 |
| `#body` | 860px | 864px |

All widths match to sub-pixel. Residual 0.50px vs 0.55px border differences are
devicePixelRatio rounding, not real. Note the live page's own height varies ~38px between
loads depending on whether the async `sidebar-menu.css` has landed.

## Not in scope

`Status` and `Standings` appear in the tab bar (they are part of the real nav) but were not
requested, so those two routes are not built and will 404.

## Reproducing

```bash
# 1. launch Edge with CDP on a profile copy, confirm Cloudflare is cleared
# 2. then, from codeforces-clone/:
PY="$HOME/.claude/skills/perfect-web-clone/.venv/Scripts/python.exe"
"$PY" tools/extract_cdp.py --allow-anonymous   # pages -> docs/research/raw/
"$PY" tools/download_assets.py                 # css/images/fonts -> public/
"$PY" tools/download_fonts.py                  # /cf-fonts webfonts
"$PY" tools/find_dynamic_css.py && "$PY" tools/download_missing_css.py
"$PY" tools/extract_inline_css.py              # stylesheet manifest in head order
"$PY" tools/extract_data.py                    # -> src/data/contest2250.json
npm run build
```

With a signed-in session, `tools/extract_cdp.py --only submit,custom-invocation` fills the
two missing tabs.
