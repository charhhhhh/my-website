import asyncio, json, sys
from playwright.async_api import async_playwright

JS = """(sel) => {
    const el = document.querySelector(sel);
    if (!el) return {error: 'not found'};
    const hits = [];
    for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (e) { hits.push({sheet: sheet.href, error: 'CORS'}); continue; }
        for (const r of rules || []) {
            if (!r.selectorText) continue;
            let m = false;
            try { m = el.matches(r.selectorText); } catch (e) {}
            if (m) hits.push({
                sheet: (sheet.href || 'INLINE <style>').split('/').slice(-1)[0],
                selector: r.selectorText,
                css: r.style.cssText.slice(0, 220),
            });
        }
    }
    return {tag: el.tagName, hits};
}"""

async def main():
    sel = sys.argv[1]
    url = sys.argv[2]
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        page = await ctx.new_page()
        await page.goto(url, wait_until="load", timeout=60000)
        await page.wait_for_timeout(2500)
        print(json.dumps(await page.evaluate(JS, sel), indent=2, ensure_ascii=False))
        await page.close()

asyncio.run(main())
