#!/usr/bin/env python3
"""Download the stylesheets found by find_dynamic_css.py, mirroring their real paths."""
import asyncio, base64, json, re
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

PUBLIC = Path("public")


async def fetch(page, url):
    return await page.evaluate(
        """async (u) => {
            const r = await fetch(u);
            if (!r.ok) return { ok: false, status: r.status };
            const buf = new Uint8Array(await r.arrayBuffer());
            let s = ''; const CH = 0x8000;
            for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
            return { ok: true, b64: btoa(s) };
        }""", url)


async def save(page, url):
    res = await fetch(page, url)
    if not res.get("ok"):
        print(f"  HTTP {res.get('status')} {url}")
        return None
    dest = PUBLIC / urlparse(url).path.lstrip("/")
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = base64.b64decode(res["b64"])
    dest.write_bytes(data)
    print(f"  OK {len(data):>7d}  {dest.as_posix()}")
    return data


async def main():
    missing = json.loads(Path("docs/research/missing_css.json").read_text(encoding="utf-8"))
    if not missing:
        print("nothing missing")
        return
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        page = await ctx.new_page()
        await page.goto("https://codeforces.com/contest/2250", wait_until="load", timeout=60000)
        paths = []
        for name, url in missing.items():
            data = await save(page, url)
            if data is None:
                continue
            paths.append(urlparse(url).path)
            # follow url() references (sprites/fonts) so the rules render correctly
            for ref in set(re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", data.decode("utf-8", "ignore"))):
                if ref.startswith("data:"):
                    continue
                await save(page, urljoin(url, ref.split("?")[0]))
        await page.close()

    Path("docs/research/extra_css_paths.json").write_text(
        json.dumps(paths, indent=2), encoding="utf-8")
    print(f"{len(paths)} stylesheet paths recorded for the manifest")


asyncio.run(main())
