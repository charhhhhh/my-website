import asyncio, json
from playwright.async_api import async_playwright

JS = """() => {
    const b = document.querySelector('#body');
    return {
        total: Math.round(b.getBoundingClientRect().height),
        children: [...b.children].map(c => {
            const r = c.getBoundingClientRect();
            const cs = getComputedStyle(c);
            return {tag: c.tagName.toLowerCase(), id: c.id || null,
                    cls: (c.getAttribute('class')||'').slice(0,40),
                    h: Math.round(r.height), mt: cs.marginTop, mb: cs.marginBottom};
        }),
    };
}"""

async def main():
    async with async_playwright() as p:
        br = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = br.contexts[0]
        for label, url in [("LIVE", "https://codeforces.com/contest/2250"),
                           ("CLONE", "http://localhost:3000/contest/2250")]:
            page = await ctx.new_page()
            await page.goto(url, wait_until="load", timeout=60000)
            cdp = await ctx.new_cdp_session(page)
            i = await cdp.send("Browser.getWindowForTarget")
            await cdp.send("Browser.setWindowBounds", {"windowId": i["windowId"],
                "bounds": {"windowState": "normal", "width": 1456, "height": 1000}})
            await page.wait_for_timeout(7000)
            print("=" * 16, label)
            print(json.dumps(await page.evaluate(JS), indent=2))
            await page.close()
            await asyncio.sleep(2)

asyncio.run(main())
