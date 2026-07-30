#!/usr/bin/env python3
"""Probe which contest tabs render real content vs a login wall, over CDP."""
import asyncio, json, sys
from playwright.async_api import async_playwright

URLS = [
    ("problems",          "https://codeforces.com/contest/2250"),
    ("submit",            "https://codeforces.com/contest/2250/submit"),
    ("my-submissions",    "https://codeforces.com/contest/2250/my"),
    ("hacks",             "https://codeforces.com/contest/2250/hacks"),
    ("room",              "https://codeforces.com/contest/2250/room/1"),
    ("custom-invocation", "https://codeforces.com/contest/2250/customtest"),
    ("problem-A",         "https://codeforces.com/contest/2250/problem/A"),
]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        out = []
        for slug, url in URLS:
            page = await ctx.new_page()
            try:
                resp = await page.goto(url, wait_until="load", timeout=60000)
                await page.wait_for_timeout(1200)
                info = await page.evaluate("""() => ({
                    landed: location.href,
                    title: document.title,
                    loginWall: !!document.querySelector('input[name="handleOrEmail"]'),
                    loggedInAs: (document.querySelector('#header a[href^="/profile/"]') || {}).textContent || null,
                    text: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0, 160)
                })""")
                out.append({"slug": slug, "http": resp.status if resp else None, **info})
            except Exception as e:
                out.append({"slug": slug, "error": str(e)[:140]})
            finally:
                await page.close()
            await asyncio.sleep(3)
        print(json.dumps(out, indent=2, ensure_ascii=False))

asyncio.run(main())
