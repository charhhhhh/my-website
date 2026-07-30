#!/usr/bin/env python3
"""Extract Codeforces' inline @font-face block and download the /cf-fonts/ webfonts.

Cuprum (logo, headings, top nav) and PT Sans Narrow (the contest tab bar) are declared
in an inline <style> in the document head, not in any linked stylesheet, so the
stylesheet sweep in download_assets.py never saw them.
"""
import asyncio, base64, re
from pathlib import Path
from playwright.async_api import async_playwright

PUBLIC = Path("public")
OUT_CSS = PUBLIC / "codeforces.org/s/94651/css/cf-fonts.css"


async def main():
    html = Path("docs/research/html/problems.html").read_text(encoding="utf-8")
    blocks = re.findall(r"<style[^>]*>(.*?)</style>", html, re.S)
    font_css = "\n".join(b for b in blocks if "@font-face" in b and "cf-fonts" in b)
    if not font_css:
        raise SystemExit("no inline @font-face block found")

    urls = sorted(set(re.findall(r"url\((/cf-fonts/[^)]+)\)", font_css)))
    print(f"{len(urls)} webfonts referenced")

    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        page = await ctx.new_page()
        await page.goto("https://codeforces.com/contest/2250", wait_until="load", timeout=60000)
        saved = 0
        for u in urls:
            res = await page.evaluate(
                """async (u) => {
                    const r = await fetch(u);
                    if (!r.ok) return { ok: false, status: r.status };
                    const buf = new Uint8Array(await r.arrayBuffer());
                    let s = ''; const CH = 0x8000;
                    for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
                    return { ok: true, b64: btoa(s) };
                }""", u)
            if not res.get("ok"):
                print(f"  HTTP {res.get('status')} {u}")
                continue
            dest = PUBLIC / u.lstrip("/")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(base64.b64decode(res["b64"]))
            saved += 1
        await page.close()

    OUT_CSS.parent.mkdir(parents=True, exist_ok=True)
    OUT_CSS.write_text(font_css.strip(), encoding="utf-8")
    print(f"{saved}/{len(urls)} fonts saved; @font-face css -> {OUT_CSS.as_posix()}")


asyncio.run(main())
