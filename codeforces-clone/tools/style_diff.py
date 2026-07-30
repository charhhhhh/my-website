#!/usr/bin/env python3
"""Diff computed styles + geometry between the live page and the clone.

Visual comparison by eye misses inherited properties (text-align, word-wrap) that only
show up on long content. This walks a list of selectors on both pages and reports every
property that differs.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

PROPS = [
    "display", "position", "width", "height", "textAlign", "verticalAlign",
    "fontFamily", "fontSize", "fontWeight", "lineHeight", "color", "backgroundColor",
    "padding", "margin", "border", "borderCollapse", "whiteSpace", "wordWrap",
    "overflowWrap", "wordBreak", "overflow", "float", "textTransform", "letterSpacing",
]

JS = """(sels) => {
    const out = {};
    for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) { out[sel] = null; continue; }
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        const o = { _box: `${Math.round(b.width)}x${Math.round(b.height)}` };
        for (const p of %PROPS%) o[p] = cs[p];
        out[sel] = o;
    }
    return out;
}""".replace("%PROPS%", json.dumps(PROPS))


async def grab(ctx, url, sels):
    page = await ctx.new_page()
    try:
        await page.goto(url, wait_until="load", timeout=60000)
        cdp = await ctx.new_cdp_session(page)
        info = await cdp.send("Browser.getWindowForTarget")
        await cdp.send("Browser.setWindowBounds", {
            "windowId": info["windowId"],
            "bounds": {"windowState": "normal", "width": 1456, "height": 1000}})
        # Codeforces injects sidebar-menu.css with JS after load; measuring too early
        # catches the pre-injection layout and produces phantom diffs.
        await page.wait_for_timeout(7000)
        return await page.evaluate(JS, sels)
    finally:
        await page.close()


async def main():
    live_url, clone_url = sys.argv[1], sys.argv[2]
    sels = sys.argv[3].split("|")
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        live = await grab(ctx, live_url, sels)
        await asyncio.sleep(2)
        clone = await grab(ctx, clone_url, sels)

    for sel in sels:
        lv, cv = live.get(sel), clone.get(sel)
        if lv is None or cv is None:
            print(f"\n### {sel}\n  MISSING on {'live' if lv is None else ''}{'clone' if cv is None else ''}")
            continue
        diffs = {k: (lv[k], cv[k]) for k in lv if lv[k] != cv[k]}
        if not diffs:
            print(f"\n### {sel}\n  identical ({lv['_box']})")
            continue
        print(f"\n### {sel}")
        for k, (a, c) in diffs.items():
            print(f"  {k:16s} live={a!r}  clone={c!r}")


asyncio.run(main())
