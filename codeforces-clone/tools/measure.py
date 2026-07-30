import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        page = await ctx.new_page()
        await page.goto("https://codeforces.com/contest/2250", wait_until="load", timeout=60000)
        await page.wait_for_timeout(2000)
        print(json.dumps(await page.evaluate("""() => {
            const r = s => { const e=document.querySelector(s); if(!e) return null;
                const b=e.getBoundingClientRect(); return {x:b.x,w:b.width,right:b.right}; };
            return {
                innerWidth: window.innerWidth,
                outerWidth: window.outerWidth,
                dpr: window.devicePixelRatio,
                screenW: screen.width,
                docScrollW: document.documentElement.scrollWidth,
                bodyScrollW: document.body.scrollWidth,
                zoom: document.documentElement.style.zoom || getComputedStyle(document.body).zoom,
                viewportMeta: (document.querySelector('meta[name=viewport]')||{}).content,
                body: r('#body'), sidebar: r('#sidebar'), content: r('#pageContent'), footer: r('#footer')
            };
        }"""), indent=2))
        await page.close()

asyncio.run(main())
