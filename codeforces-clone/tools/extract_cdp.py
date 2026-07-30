#!/usr/bin/env python3
"""
Extract Codeforces contest pages over CDP, reusing perfect-web-clone's PageExtractor.

The skill's extractor launches its own headless Chromium, which Cloudflare blocks with a
403. This subclass instead attaches to an already-running real browser (Edge) via CDP so
the request comes from a normal browser carrying the user's cf_clearance and session
cookies.

Usage:
    python extract_cdp.py --cdp http://localhost:9222 --contest 2250 --out docs/research
"""

import argparse
import asyncio
import base64
import json
import os
import sys
from pathlib import Path

SKILL_SCRIPTS = r"C:\Users\charl\.claude\skills\perfect-web-clone\scripts"
sys.path.insert(0, SKILL_SCRIPTS)

from extract_page import PageExtractor  # noqa: E402

ORIGIN = "https://codeforces.com"


class _ContextShim:
    """Stands in for a Browser so PageExtractor.extract() gets pages from the REAL
    profile context. browser.new_page() over CDP would spawn a fresh context with no
    cookies, silently logging us out."""

    def __init__(self, context):
        self._context = context

    async def new_page(self, **_ignored):
        # viewport kwarg is dropped: over CDP the page inherits the real window size.
        return await self._context.new_page()


class CdpPageExtractor(PageExtractor):
    def __init__(self, cdp_url: str, **kwargs):
        super().__init__(**kwargs)
        self._cdp_url = cdp_url
        self._real_browser = None
        self.context = None

    async def __aenter__(self):
        from playwright.async_api import async_playwright

        self._playwright = await async_playwright().start()
        self._real_browser = await self._playwright.chromium.connect_over_cdp(self._cdp_url)
        if not self._real_browser.contexts:
            raise RuntimeError("CDP browser exposed no contexts")
        self.context = self._real_browser.contexts[0]
        self._browser = _ContextShim(self.context)
        return self

    async def __aexit__(self, *args):
        # Deliberately NOT closing the browser - it belongs to the user.
        if self._playwright:
            await self._playwright.stop()

    async def _extract_dom_tree(self, page, max_depth: int):
        """Shadow-proof replacement for the skill's version.

        HTMLFormElement is [LegacyOverrideBuiltIns], so a control named `tagName`
        shadows Element.prototype.tagName. Codeforces problem pages have exactly that
        (the tag-add form), which makes the upstream `child.tagName.toLowerCase()`
        throw and silently null out the entire DOM tree. Read the real getter instead.
        """
        return await page.evaluate(
            """(params) => {
            const { maxDepth } = params;

            const TAG_GETTER = Object.getOwnPropertyDescriptor(Element.prototype, 'tagName').get;
            function tagOf(el) {
                try { return String(TAG_GETTER.call(el)).toLowerCase(); }
                catch (e) { return String(el.nodeName || 'unknown').toLowerCase(); }
            }

            const STYLE_PROPS = [
                'display', 'position', 'float',
                'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignContent', 'gap',
                'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow',
                'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
                'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
                'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'top', 'right', 'bottom', 'left', 'zIndex',
                'backgroundColor', 'backgroundImage', 'color', 'border', 'borderRadius',
                'boxShadow', 'opacity', 'overflow', 'visibility',
                'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign',
                'transform'
            ];
            const INTERACTIVE = ['a', 'button', 'input', 'select', 'textarea'];
            const IMPORTANT_ATTRS = ['href', 'src', 'alt', 'title', 'type', 'name', 'placeholder', 'role', 'value', 'colspan'];

            function camelToSnake(s) { return s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(); }

            function isVisible(el, styles) {
                if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') return false;
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            }

            function getDirectText(el) {
                let text = '';
                for (const node of el.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
                }
                return text.trim().slice(0, 400);
            }

            function extractElement(el, depth, path) {
                if (depth > maxDepth) return null;
                const tag = tagOf(el);
                const styles = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();

                const styleObj = {};
                for (const prop of STYLE_PROPS) {
                    const v = styles[prop];
                    if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px') {
                        styleObj[camelToSnake(prop)] = v;
                    }
                }

                const attrs = {};
                for (const a of IMPORTANT_ATTRS) {
                    if (el.hasAttribute && el.hasAttribute(a)) attrs[a] = el.getAttribute(a);
                }

                let classes = [];
                try {
                    const c = el.getAttribute && el.getAttribute('class');
                    if (c) classes = c.trim().split(/\\s+/).filter(Boolean);
                } catch (e) {}

                const children = [];
                let i = 0;
                for (const child of el.children) {
                    const info = extractElement(child, depth + 1, path + '/' + tagOf(child) + '[' + i + ']');
                    if (info) children.push(info);
                    i++;
                }

                return {
                    tag: tag,
                    id: el.id || null,
                    classes: classes,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                            top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
                    styles: styleObj,
                    text_content: getDirectText(el),
                    inner_html_length: el.innerHTML ? el.innerHTML.length : 0,
                    attributes: attrs,
                    is_visible: isVisible(el, styles),
                    is_interactive: INTERACTIVE.includes(tag),
                    children: children,
                    children_count: el.children.length,
                    xpath: path
                };
            }

            return extractElement(document.body, 1, '/body');
        }""",
            {"maxDepth": max_depth},
        )


async def check_login(context) -> dict:
    page = await context.new_page()
    try:
        await page.goto(f"{ORIGIN}/contest/2250", wait_until="load", timeout=60000)
        await page.wait_for_timeout(1500)
        return await page.evaluate(
            """() => ({
                handle: (document.querySelector('#header a[href^="/profile/"]') || {}).textContent || null,
                hasEnterLink: !!document.querySelector('#header a[href*="/enter"]'),
                title: document.title,
                status: document.title.includes('Codeforces') ? 'ok' : 'unknown'
            })"""
        )
    finally:
        await page.close()


async def preflight(context, url: str) -> dict:
    """Record where the URL actually lands. Codeforces silently redirects gated tabs to
    the dashboard when logged out, so a 200 alone proves nothing."""
    page = await context.new_page()
    try:
        resp = await page.goto(url, wait_until="load", timeout=60000)
        await page.wait_for_timeout(1000)
        landed = await page.evaluate("() => location.href")
        return {
            "http": resp.status if resp else None,
            "landed": landed,
            "redirected": landed.rstrip("/") != url.rstrip("/"),
        }
    except Exception as exc:
        return {"http": None, "landed": None, "redirected": None, "error": str(exc)[:160]}
    finally:
        await page.close()


async def discover(context, contest: str) -> list:
    """Read the real nav + problem list off the live page. Never guess URLs."""
    page = await context.new_page()
    try:
        await page.goto(f"{ORIGIN}/contest/{contest}", wait_until="load", timeout=60000)
        await page.wait_for_timeout(1500)
        data = await page.evaluate(
            """() => ({
                tabs: [...document.querySelectorAll('.second-level-menu a, .second-level-menu-list a')]
                        .map(a => ({ label: a.textContent.trim(), href: a.getAttribute('href') })),
                problems: [...document.querySelectorAll('table.problems td.id a')]
                        .map(a => ({ label: a.textContent.trim(), href: a.getAttribute('href') }))
            })"""
        )
    finally:
        await page.close()

    wanted = {
        "Problems": "problems",
        "Submit Code": "submit",
        "My Submissions": "my-submissions",
        "Hacks": "hacks",
        "Room": "room",
        "Custom Invocation": "custom-invocation",
    }

    targets = []
    seen = set()
    for tab in data["tabs"]:
        slug = wanted.get(tab["label"])
        if slug and tab["href"] not in seen:
            seen.add(tab["href"])
            targets.append({"slug": slug, "label": tab["label"], "url": ORIGIN + tab["href"]})

    for prob in data["problems"]:
        if prob["href"] not in seen:
            seen.add(prob["href"])
            targets.append(
                {
                    "slug": f"problem-{prob['label']}",
                    "label": f"Problem {prob['label']}",
                    "url": ORIGIN + prob["href"],
                }
            )

    missing = [label for label in wanted if label not in {t["label"] for t in targets}]
    return targets, missing


async def shoot(context, url: str, out_dir: Path, slug: str):
    """Full-page screenshots at desktop and mobile widths for visual QA."""
    for width, tag in ((1440, "desktop"), (390, "mobile")):
        page = await context.new_page()
        try:
            try:
                await page.set_viewport_size({"width": width, "height": 900})
            except Exception as exc:  # CDP pages can refuse viewport override
                print(f"    viewport {width} not settable ({exc}); using window size")
            await page.goto(url, wait_until="load", timeout=60000)
            await page.wait_for_timeout(2500)
            await page.screenshot(path=str(out_dir / f"{slug}-{tag}.png"), full_page=True)
        except Exception as exc:
            print(f"    screenshot {tag} failed: {exc}")
        finally:
            await page.close()
        await asyncio.sleep(2)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cdp", default="http://localhost:9222")
    ap.add_argument("--contest", default="2250")
    ap.add_argument("--out", default="docs/research")
    ap.add_argument("--delay", type=float, default=4.0, help="seconds between pages; CF rate-limits")
    ap.add_argument("--skip-screenshots", action="store_true")
    ap.add_argument("--allow-anonymous", action="store_true",
                    help="capture what is public instead of aborting when logged out")
    ap.add_argument("--only", help="comma-separated slugs to restrict the run to")
    args = ap.parse_args()

    out = Path(args.out)
    raw_dir = out / "raw"
    shots_dir = Path("docs/design-references")
    raw_dir.mkdir(parents=True, exist_ok=True)
    shots_dir.mkdir(parents=True, exist_ok=True)

    async with CdpPageExtractor(args.cdp, viewport_width=1440, viewport_height=900) as ex:
        login = await check_login(ex.context)
        anon = login["hasEnterLink"] or not login["handle"]
        print(f"Login: handle={login['handle']!r} anonymous={anon}")
        if anon and not args.allow_anonymous:
            print("ABORT: not logged in. Log in in the CDP browser window, or pass --allow-anonymous.")
            sys.exit(2)
        if anon:
            print("WARNING: running anonymously - login-gated tabs will be recorded as redirected.")

        targets, missing = await discover(ex.context, args.contest)
        if args.only:
            keep = {s.strip() for s in args.only.split(",")}
            targets = [t for t in targets if t["slug"] in keep]
        print(f"Discovered {len(targets)} pages; missing tabs: {missing or 'none'}")

        (out / "URLS.md").write_text(
            "# Discovered URLs (read from the live contest nav)\n\n"
            + f"Logged in as: {login['handle']}\n\n"
            + "\n".join(f"- **{t['label']}** — `{t['url']}` → `raw/{t['slug']}.json`" for t in targets)
            + (f"\n\nTabs not present in nav: {missing}\n" if missing else "\n"),
            encoding="utf-8",
        )

        results = []
        for i, t in enumerate(targets, 1):
            print(f"[{i}/{len(targets)}] {t['label']}  {t['url']}")
            pre = await preflight(ex.context, t["url"])
            await asyncio.sleep(args.delay)
            if pre.get("redirected"):
                print(f"    SKIP: redirected to {pre['landed']} (needs login)")
                results.append({"slug": t["slug"], "label": t["label"], "success": False,
                                "reason": "redirected", "landed": pre["landed"]})
                continue

            data = await ex.extract(url=t["url"], wait_time=2500, max_depth=20, full_screenshot=True)
            data["_target"] = t
            data["_preflight"] = pre
            (raw_dir / f"{t['slug']}.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            ok = data.get("success")
            title = (data.get("metadata") or {}).get("title", "")
            print(f"    success={ok} title={title!r}")
            results.append({"slug": t["slug"], "label": t["label"], "success": ok, "title": title})
            await asyncio.sleep(args.delay)

        captured = {r["slug"] for r in results if r["success"]}
        if not args.skip_screenshots:
            for t in targets:
                if t["slug"] not in captured:
                    continue
                print(f"screenshots: {t['slug']}")
                await shoot(ex.context, t["url"], shots_dir, t["slug"])

        (out / "EXTRACTION_SUMMARY.json").write_text(
            json.dumps({"login": login["handle"], "anonymous": anon,
                        "missing_tabs": missing, "pages": results},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print("\nDone.")
        for r in results:
            detail = r.get("title") or r.get("reason", "")
            print(f"  {'OK  ' if r['success'] else 'SKIP'} {r['label']}: {detail}")


if __name__ == "__main__":
    asyncio.run(main())
