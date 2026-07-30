#!/usr/bin/env python3
"""Dump the HTML of specific page regions so components can be ported faithfully."""
import sys
from pathlib import Path
from bs4 import BeautifulSoup

# Codeforces markup contains Cyrillic; the Windows console is cp950 here.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REGIONS = {
    "header": ("id", "header"),
    "topmenu": ("class", "menu-box"),
    "secondlevel": ("class", "second-level-menu"),
    "sidebar": ("id", "sidebar"),
    "content": ("id", "pageContent"),
    "footer": ("id", "footer"),
}


def main():
    slug = sys.argv[1]
    which = sys.argv[2] if len(sys.argv) > 2 else None
    html = Path(f"docs/research/html/{slug}.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")

    items = {which: REGIONS[which]} if which else REGIONS
    for name, (kind, val) in items.items():
        el = soup.find(id=val) if kind == "id" else soup.find(class_=val)
        print(f"\n{'=' * 70}\n== {name}\n{'=' * 70}")
        print(el.prettify()[: int(sys.argv[3]) if len(sys.argv) > 3 else 6000] if el else "NOT FOUND")


main()
