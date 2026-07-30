import asyncio, json
from playwright.async_api import async_playwright

JS = """() => {
    const sb = document.querySelector('#sidebar');
    if (!sb) return {error: 'no sidebar'};
    return {
        childCount: sb.children.length,
        children: [...sb.children].map(c => {
            const b = c.getBoundingClientRect();
            const cs = getComputedStyle(c);
            return {
                tag: c.tagName.toLowerCase(),
                cls: (c.getAttribute('class') || '').slice(0, 60),
                h: Math.round(b.height),
                marginBottom: cs.marginBottom,
                caption: (c.querySelector('.caption') || {}).textContent?.trim().slice(0, 30) || null,
            };
        }),
        totalH: Math.round(sb.getBoundingClientRect().height),
    };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        for label, url in [("LIVE", "https://codeforces.com/contest/2250"),
                           ("CLONE", "http://localhost:3000/contest/2250")]:
            page = await ctx.new_page()
            await page.goto(url, wait_until="load", timeout=60000)
            cdp = await ctx.new_cdp_session(page)
            info = await cdp.send("Browser.getWindowForTarget")
            await cdp.send("Browser.setWindowBounds", {"windowId": info["windowId"],
                "bounds": {"windowState": "normal", "width": 1456, "height": 1000}})
            await page.wait_for_timeout(2500)
            print("=" * 18, label)
            print(json.dumps(await page.evaluate(JS), indent=2, ensure_ascii=False))
            await page.close()
            await asyncio.sleep(2)

asyncio.run(main())
