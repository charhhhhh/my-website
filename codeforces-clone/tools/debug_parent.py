import asyncio, json
from playwright.async_api import async_playwright

JS = """() => {
    const m = document.querySelector('.second-level-menu');
    if (!m) return {error: 'no menu'};
    const chain = [];
    let e = m.parentElement;
    while (e && chain.length < 8) {
        const cs = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        chain.push({
            tag: e.tagName.toLowerCase(),
            id: e.id || null,
            cls: (e.getAttribute('class') || '').slice(0, 50),
            position: cs.position,
            transform: cs.transform,
            filter: cs.filter,
            contain: cs.contain,
            y: Math.round(b.y),
        });
        e = e.parentElement;
    }
    return {
        offsetParent: m.offsetParent ? (m.offsetParent.id || m.offsetParent.tagName) : null,
        menuY: Math.round(m.getBoundingClientRect().y),
        prevSibling: m.previousElementSibling ? m.previousElementSibling.tagName + '.' + (m.previousElementSibling.getAttribute('class')||'') : null,
        ancestors: chain,
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
            await page.wait_for_timeout(2500)
            print("=" * 20, label)
            print(json.dumps(await page.evaluate(JS), indent=2))
            await page.close()
            await asyncio.sleep(2)

asyncio.run(main())
