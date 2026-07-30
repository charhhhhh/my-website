#!/usr/bin/env python3
"""Download Codeforces static assets through the CDP browser.

Fetching codeforces.com directly from Python gets a Cloudflare 403, so every request is
issued from inside a real page context via fetch(). Assets are mirrored under public/
using Codeforces' own path layout (/codeforces.org/s/<ver>/... and /cf-fonts/...) so the
relative url() references inside their stylesheets resolve untouched.
"""
import asyncio, base64, json, re, sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright

ORIGIN = "https://codeforces.com"
PUBLIC = Path("public")

CSS_FILES = [
    "font-awesome.min.css", "line-awesome.min.css", "prettify.css", "clear.css",
    "style.css", "ttypography.css", "problem-statement.css", "second-level-menu.css",
    "roundbox.css", "datatable.css", "table-form.css", "topic.css",
    "jquery.jgrowl.css", "facebox.css", "jquery.autocomplete.css", "colorbox.css",
    "community.css",
]


def local_path(url: str) -> Path:
    """Map an absolute CF url to a path under public/ preserving CF's own layout."""
    p = urlparse(url).path.lstrip("/")
    return PUBLIC / p


async def fetch_binary(page, url: str):
    """Fetch inside the page so Cloudflare sees a normal same-origin browser request."""
    return await page.evaluate(
        """async (u) => {
            const r = await fetch(u, { credentials: 'include' });
            if (!r.ok) return { ok: false, status: r.status };
            const buf = new Uint8Array(await r.arrayBuffer());
            let s = '';
            const CH = 0x8000;
            for (let i = 0; i < buf.length; i += CH) {
                s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
            }
            return { ok: true, status: r.status, b64: btoa(s), type: r.headers.get('content-type') };
        }""",
        url,
    )


async def save(page, url: str, seen: set, log: list) -> bytes | None:
    if url in seen:
        return None
    seen.add(url)
    dest = local_path(url)
    try:
        res = await fetch_binary(page, url)
    except Exception as exc:
        log.append(f"ERROR {url} :: {str(exc)[:90]}")
        return None
    if not res.get("ok"):
        log.append(f"HTTP {res.get('status')} {url}")
        return None
    data = base64.b64decode(res["b64"])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    log.append(f"OK   {len(data):>8d}  {dest.as_posix()}")
    return data


async def main():
    base = sys.argv[1] if len(sys.argv) > 1 else f"{ORIGIN}/codeforces.org/s/94651"
    seen, log = set(), []

    # Collect every asset URL the extractor saw across all captured pages.
    page_assets = set()
    for f in sorted(Path("docs/research/raw").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for group in ("images", "stylesheets", "fonts"):
            for item in (d.get("assets") or {}).get(group, []):
                u = item["url"]
                if u.startswith("//"):
                    u = "https:" + u
                if u.startswith("http") and "codeforces" in u:
                    page_assets.add(u)

    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        ctx = b.contexts[0]
        page = await ctx.new_page()
        await page.goto(f"{ORIGIN}/contest/2250", wait_until="load", timeout=60000)

        # 1. Stylesheets, then follow their url() references (fonts, sprites).
        for name in CSS_FILES:
            url = f"{base}/css/{name}"
            data = await save(page, url, seen, log)
            if not data:
                continue
            css = data.decode("utf-8", "ignore")
            for ref in set(re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", css)):
                if ref.startswith("data:"):
                    continue
                ref = ref.split("?")[0].split("#")[0]
                if not ref:
                    continue
                await save(page, urljoin(url, ref), seen, log)

        # 2. Images and fonts observed on the live pages.
        for url in sorted(page_assets):
            await save(page, url, seen, log)

        await page.close()

    Path("docs/research").mkdir(parents=True, exist_ok=True)
    Path("docs/research/ASSETS.log").write_text("\n".join(log), encoding="utf-8")
    ok = sum(1 for line in log if line.startswith("OK"))
    print(f"{ok} saved / {len(log)} attempted -> public/")
    for line in log:
        if not line.startswith("OK"):
            print("  " + line)


asyncio.run(main())
