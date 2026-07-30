#!/usr/bin/env python3
"""Rebuild Codeforces' <head> stylesheet order exactly.

Codeforces ships layout-critical CSS in inline <style> blocks interleaved between its
<link> tags - @font-face for Cuprum / PT Sans Narrow, .question-requestText-td wrapping,
MathJax's generated styles. Order matters: an inline block defines
`#sidebar { margin: 1em 1em 1em 0 }` and style.css later defines
`#sidebar { margin: 1em 1em 1em -22em }`. Same specificity, so whichever comes last wins.
Concatenating all inline CSS after the links (the obvious approach) silently inverts that
and breaks the sidebar's negative-margin pull.

So: walk the head in document order, emit each <style> to its own numbered file, and
write a manifest the app links in that same sequence.
"""
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

HTML = Path("docs/research/html")
CSS_DIR = Path("public/codeforces.org/s/94651/css")
MANIFEST = Path("src/data/stylesheets.json")
STATIC_PREFIX = "/codeforces.org/s/94651"


def localize_href(href: str) -> str:
    href = href.replace("//codeforces.com/codeforces.org/s/94651", STATIC_PREFIX)
    href = href.replace("https://codeforces.com/codeforces.org/s/94651", STATIC_PREFIX)
    return href


def main():
    CSS_DIR.mkdir(parents=True, exist_ok=True)
    soup = BeautifulSoup((HTML / "problems.html").read_text(encoding="utf-8"), "html.parser")
    head = soup.head or soup

    order: list[str] = []
    seen_inline: set[str] = set()
    n = 0
    skipped: list[str] = []

    # Head first, then body: Codeforces puts several rules (including the
    # .question-requestText-td wrapping used by the announcements table) in <style> blocks
    # inside <body>, which cascade after everything in <head>.
    # Note BeautifulSoup parses <!--[if IE]> blocks as comments, so the IE-only
    # `#sidebar { margin: 1em 1em 1em 0 }` override is correctly skipped - lifting it out
    # with a regex would clobber style.css's negative-margin sidebar pull.
    elements = head.find_all(["link", "style"], recursive=True)
    if soup.body:
        elements += soup.body.find_all("style", recursive=True)

    for el in elements:
        if el.name == "link":
            if "stylesheet" not in (el.get("rel") or []):
                continue
            href = localize_href(el.get("href", ""))
            if not href.startswith(STATIC_PREFIX):
                continue
            local = Path("public") / href.lstrip("/")
            if not local.exists():
                skipped.append(href)  # e.g. markitup skins we never downloaded
                continue
            order.append(href)
        else:
            body = (el.string or "").strip()
            if not body:
                continue
            seen_inline.add(re.sub(r"\s+", " ", body))
            name = f"cf-inline-{n:02d}.css"
            (CSS_DIR / name).write_text(body, encoding="utf-8")
            order.append(f"{STATIC_PREFIX}/css/{name}")
            n += 1

    # Other pages (problem statements especially) carry extra MathJax style blocks that
    # the dashboard does not. Those are additive, so they can safely go last.
    extra: list[str] = []
    for f in sorted(HTML.glob("*.html")):
        if f.name == "problems.html":
            continue
        s = BeautifulSoup(f.read_text(encoding="utf-8"), "html.parser")
        page_styles = (s.head or s).find_all("style")
        if s.body:
            page_styles += s.body.find_all("style", recursive=True)
        for el in page_styles:
            body = (el.string or "").strip()
            if not body:
                continue
            key = re.sub(r"\s+", " ", body)
            if key in seen_inline:
                continue
            seen_inline.add(key)
            name = f"cf-inline-{n:02d}.css"
            (CSS_DIR / name).write_text(body, encoding="utf-8")
            extra.append(f"{STATIC_PREFIX}/css/{name}")
            n += 1

    # Stylesheets Codeforces injects with JS at runtime. They are absent from the saved
    # HTML entirely (no <link> tag to crawl), so find_dynamic_css.py reads them off
    # document.styleSheets on the live page instead. sidebar-menu.css is one, and it is
    # even served from a different version prefix (s/22199 rather than s/94651).
    dynamic_file = Path("docs/research/extra_css_paths.json")
    dynamic = json.loads(dynamic_file.read_text(encoding="utf-8")) if dynamic_file.exists() else []
    order.extend(dynamic)
    order.extend(extra)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(order, indent=2), encoding="utf-8")

    print(f"{len(order)} stylesheets in head order -> {MANIFEST.as_posix()}")
    print(f"  {n} inline blocks extracted ({len(extra)} appended from other pages)")
    if skipped:
        print(f"  skipped (not mirrored locally): {skipped}")
    for h in order[: len(order) - len(extra)]:
        print("   ", h.rsplit("/", 1)[-1])


main()
