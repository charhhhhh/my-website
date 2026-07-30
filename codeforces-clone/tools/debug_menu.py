import asyncio, json
from playwright.async_api import async_playwright

async def probe(page, label):
    return await page.evaluate("""() => {
        const m = document.querySelector('.second-level-menu');
        const ul = document.querySelector('.second-level-menu-list');
        const lis = [...document.querySelectorAll('.second-level-menu-list > li')];
        const cs = e => e ? getComputedStyle(e) : null;
        const box = e => { if(!e) return null; const b=e.getBoundingClientRect();
            return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
        const s = cs(m);
        return {
            menuExists: !!m,
            menuBox: box(m),
            menuStyles: s ? {display:s.display, height:s.height, overflow:s.overflow, position:s.position,
                             visibility:s.visibility, background:s.backgroundImage.slice(0,80)} : null,
            ulBox: box(ul),
            liCount: lis.length,
            firstLis: lis.slice(0,3).map(li => ({cls: li.className, text: li.textContent.trim().slice(0,20),
                box: box(li), display: cs(li).display, float: cs(li).cssFloat})),
        };
    }""")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        for label, url in [("CLONE", "http://localhost:3000/contest/2250"),
                           ("LIVE",  "https://codeforces.com/contest/2250")]:
            page = await ctx.new_page()
            await page.goto(url, wait_until="load", timeout=60000)
            await page.wait_for_timeout(2500)
            print("=" * 24, label)
            print(json.dumps(await probe(page, label), indent=2))
            await page.close()
            await asyncio.sleep(2)

asyncio.run(main())
