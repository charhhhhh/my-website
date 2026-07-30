#!/usr/bin/env python3
"""Screenshot the local clone with the same #body element capture used on the original,
so the two sets are directly comparable."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("docs/design-references/clone")
BASE = "http://localhost:3000"
TARGET_WIDTH = 1440

PAGES = [
    ("problems", "/contest/2250"),
    ("my-submissions", "/contest/2250/my"),
    ("hacks", "/contest/2250/hacks"),
    ("room", "/contest/2250/room/1"),
    ("submit", "/contest/2250/submit"),
    ("custom-invocation", "/contest/2250/customtest"),
    ("problem-A", "/contest/2250/problem/A"),
    ("problem-B", "/contest/2250/problem/B"),
    ("problem-C", "/contest/2250/problem/C"),
    ("problem-D", "/contest/2250/problem/D"),
    ("problem-E", "/contest/2250/problem/E"),
    ("problem-F", "/contest/2250/problem/F"),
]


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        errors = []
        for slug, path in PAGES:
            page = await ctx.new_page()
            msgs = []
            page.on("console", lambda m: msgs.append((m.type, m.text)) if m.type == "error" else None)
            page.on("pageerror", lambda e: msgs.append(("pageerror", str(e))))
            try:
                resp = await page.goto(BASE + path, wait_until="load", timeout=60000)
                cdp = await ctx.new_cdp_session(page)
                info = await cdp.send("Browser.getWindowForTarget")
                await cdp.send("Browser.setWindowBounds", {
                    "windowId": info["windowId"],
                    "bounds": {"windowState": "normal", "width": TARGET_WIDTH + 16, "height": 1000},
                })
                await page.wait_for_timeout(2000)
                body = page.locator("#body")
                n = await body.count()
                if n == 0:
                    print(f"  {slug}: NO #body (status {resp.status if resp else '?'})")
                    errors.append(slug)
                else:
                    await body.screenshot(path=str(OUT / f"{slug}.png"), scale="css")
                    box = await body.bounding_box()
                    print(f"  {slug}: {box['width']:.0f}x{box['height']:.0f}"
                          + (f"  console-errors={len(msgs)}" if msgs else ""))
                for t, m in msgs[:3]:
                    print(f"       [{t}] {m[:150]}")
            except Exception as exc:
                print(f"  {slug}: FAILED {str(exc)[:140]}")
                errors.append(slug)
            finally:
                await page.close()
        if errors:
            print("FAILED:", errors)


asyncio.run(main())
