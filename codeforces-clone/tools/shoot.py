#!/usr/bin/env python3
"""Re-take full-page screenshots at exact widths.

page.set_viewport_size() is a no-op on CDP-attached pages (Playwright leaves viewport
null and defers to the real window), which clipped the first run at the Edge window's
~1295px. Drive Emulation.setDeviceMetricsOverride directly instead.
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("docs/design-references")

# Codeforces' desktop layout is fixed width: #body is width/max-width 1200px,
# min-width 920px, centered. There is no fluid desktop breakpoint to capture - mobile
# users are served the separate m1.codeforces.com site instead. So a single desktop
# capture wide enough to contain 1200px + margins is the complete picture.
TARGET_WIDTH = 1440


async def resize_window(ctx, page, width, height=1000):
    """Resize the real browser window. Emulation.setDeviceMetricsOverride does not
    survive on CDP-attached pages - Playwright clears it - but window bounds are not
    something Playwright manages, so they stick."""
    cdp = await ctx.new_cdp_session(page)
    info = await cdp.send("Browser.getWindowForTarget")
    await cdp.send("Browser.setWindowBounds", {
        "windowId": info["windowId"],
        "bounds": {"windowState": "normal", "width": width, "height": height},
    })
    await page.wait_for_timeout(600)


async def shoot(ctx, slug, url):
    for tag in ("desktop",):
        page = await ctx.new_page()
        try:
            await page.goto(url, wait_until="load", timeout=60000)
            # +16 for the window chrome/scrollbar so innerWidth lands on TARGET_WIDTH.
            await resize_window(ctx, page, TARGET_WIDTH + 16)
            await page.wait_for_timeout(2000)
            got = await page.evaluate("() => window.innerWidth")
            # Screenshot the #body wrapper rather than the page: a full_page capture on a
            # CDP page is scaled by devicePixelRatio in a way that crops the right edge,
            # which was cutting the sidebar off. The element capture is exact.
            body = page.locator("#body")
            await body.screenshot(path=str(OUT / f"{slug}-{tag}.png"), scale="css")
            box = await body.bounding_box()
            print(f"  {slug}-{tag}: innerWidth={got} body={box['width']:.0f}x{box['height']:.0f}")
        except Exception as exc:
            print(f"  {slug}-{tag} FAILED: {exc}")
        finally:
            await page.close()
        await asyncio.sleep(2)


async def main():
    targets = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        for t in targets:
            await shoot(ctx, t["slug"], t["url"])


asyncio.run(main())
