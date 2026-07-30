#!/usr/bin/env python3
"""Find stylesheets the live page loads at runtime and that static HTML scraping misses.

Codeforces injects some stylesheets with JS (sidebar-menu.css is one), so they never
appear as <link> tags in the saved HTML. Ask the live document.styleSheets instead, then
diff against what we already mirrored.
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

PAGES = [
    "https://codeforces.com/contest/2250",
    "https://codeforces.com/contest/2250/room/1",
    "https://codeforces.com/contest/2250/problem/A",
]


async def main():
    have = {p.name for p in Path("public/codeforces.org/s/94651/css").glob("*.css")}
    found: dict[str, str] = {}

    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        for url in PAGES:
            page = await ctx.new_page()
            try:
                await page.goto(url, wait_until="load", timeout=60000)
                await page.wait_for_timeout(3000)
                sheets = await page.evaluate(
                    "() => [...document.styleSheets].map(s => s.href).filter(Boolean)"
                )
                for href in sheets:
                    found[href.rsplit("/", 1)[-1].split("?")[0]] = href
            finally:
                await page.close()
            await asyncio.sleep(3)

    missing = {n: h for n, h in found.items() if n not in have}
    print(f"{len(found)} stylesheets live, {len(have)} mirrored")
    print(f"MISSING ({len(missing)}):")
    for n, h in sorted(missing.items()):
        print(f"   {n}   <- {h}")
    Path("docs/research/missing_css.json").write_text(
        json.dumps(missing, indent=2), encoding="utf-8"
    )


asyncio.run(main())
