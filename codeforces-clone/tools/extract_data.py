#!/usr/bin/env python3
"""Pull the real row/field content out of the captured HTML into JSON fixtures."""
import json, re, sys
from pathlib import Path
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HTML = Path("docs/research/html")


def soup(slug):
    return BeautifulSoup((HTML / f"{slug}.html").read_text(encoding="utf-8"), "html.parser")


def txt(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


def localize(html: str) -> str:
    """Point embedded markup at our local asset mirror, and drop Codeforces' scripts.

    The <script> strip matters: these fragments are server-rendered by Next, so unlike
    client-side innerHTML the browser really does parse and execute any inline script in
    them. Codeforces' snippets assume jQuery, which we do not load, so they throw
    "$ is not defined" on every page. None of them affect layout.
    """
    html = html.replace("//codeforces.com/codeforces.org/s/94651/", "/codeforces.org/s/94651/")
    html = html.replace("https://codeforces.com/codeforces.org/s/94651/", "/codeforces.org/s/94651/")
    html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S | re.I)
    return html


def problems():
    s = soup("problems")
    rows = []
    for tr in s.select("table.problems tr"):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 4:
            continue
        idx = txt(tds[0])
        name_a = tds[1].find("a")
        solved_a = tds[3].find("a")
        # div.notice holds two lines: an inner <div> with the I/O mode, then the
        # time/memory limits as a bare text node after it.
        notice = tds[1].select_one("div.notice")
        io_mode, limits = "", ""
        if notice:
            inner = notice.find("div")
            io_mode = txt(inner)
            if inner:
                inner.extract()
            limits = txt(notice)
        submit_a = tds[2].find("a")
        rows.append({
            "index": idx,
            "name": txt(name_a),
            "href": name_a["href"] if name_a else None,
            "ioMode": io_mode,
            "limits": limits,
            "submitHref": submit_a["href"] if submit_a else None,
            "solvedCount": txt(solved_a),
            "solvedHref": solved_a["href"] if solved_a else None,
        })
    return rows


def questions():
    s = soup("problems")
    out = []
    for tr in s.select("table.problem-questions-table tr"):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 3:
            continue
        out.append({
            "time": txt(tds[0]),
            "question": txt(tds[1]),
            # Keep both inner markups: the `monospaced` cells carry <code> and <br>
            # structure that flattened text would destroy.
            "questionHtml": localize(tds[1].decode_contents().strip()),
            "answerHtml": localize(tds[2].decode_contents().strip()),
        })
    return out


def sidebar_boxes(slug="problems"):
    """Sidebars differ per tab: the dashboard shows 4 boxes, problem pages and Hacks show
    5, and the Room page has no sidebar at all (its #pageContent runs full width)."""
    s = soup(slug)
    boxes = []
    for box in s.select("#sidebar > div.roundbox"):
        cap = box.find(class_="caption")
        boxes.append({
            "caption": txt(cap),
            "classes": " ".join(box.get("class", [])),
            "html": localize(box.decode_contents().strip()),
        })
    return boxes


def all_sidebars():
    out = {}
    for f in sorted(HTML.glob("*.html")):
        out[f.stem] = sidebar_boxes(f.stem)
    return out


def table_rows(slug, selector):
    s = soup(slug)
    table = s.select_one(selector)
    if not table:
        return {"found": False, "headers": [], "rows": []}
    trs = table.find_all("tr")
    headers = [txt(th) for th in trs[0].find_all(["th", "td"])] if trs else []
    rows = []
    for tr in trs[1:]:
        cells = tr.find_all(["td", "th"])
        if cells:
            rows.append([txt(c) for c in cells])
    # Keep the raw table markup too: verdict colours, user-rank link classes and the
    # per-problem cell structure all live in class names that flat text would discard.
    return {"found": True, "headers": headers, "rows": rows, "html": localize(str(table))}


def page_content_html(slug):
    """Inner HTML of #pageContent minus the tab bar and scripts.

    Used for pages whose body is a one-off assembly rather than a reusable table - the
    Room page for instance stacks a room chooser, a "Final standings" title, a hint line
    and the standings datatable, none of which recur elsewhere. Rebuilding those by hand
    would be guesswork with no reuse to show for it.
    """
    s = soup(slug)
    pc = s.select_one("#pageContent")
    if not pc:
        return None
    for tag in pc.select(".second-level-menu"):
        tag.decompose()
    return localize(pc.decode_contents().strip())


def contest_meta():
    s = soup("problems")
    box = s.select_one("#sidebar .rtable")
    title_a = box.find("a") if box else None
    return {
        "id": "2250",
        "title": txt(title_a) or "Codeforces Round 1112 (Div. 2)",
        "phase": txt(box.find_all("tr")[1]) if box and len(box.find_all("tr")) > 1 else "Finished",
    }


def problem_statements():
    out = {}
    for f in sorted(HTML.glob("problem-*.html")):
        idx = f.stem.split("-")[1]
        s = BeautifulSoup(f.read_text(encoding="utf-8"), "html.parser")
        stmt = s.select_one("div.problem-statement")
        if not stmt:
            continue
        out[idx] = {
            "index": idx,
            "title": txt(stmt.select_one("div.title")),
            "timeLimit": txt(stmt.select_one("div.time-limit")),
            "memoryLimit": txt(stmt.select_one("div.memory-limit")),
            "inputFile": txt(stmt.select_one("div.input-file")),
            "outputFile": txt(stmt.select_one("div.output-file")),
            "html": localize(str(stmt)),
        }
    return out


data = {
    "contest": contest_meta(),
    "problems": problems(),
    "questions": questions(),
    "sidebar": sidebar_boxes(),
    "sidebars": all_sidebars(),
    # Hacks and My Submissions both render their real "No items" empty state: hacks were
    # disabled for A-D in this round, and My Submissions is empty for a logged-out viewer.
    "hacks": table_rows("hacks", "table.challenges-frame-datatable"),
    "mySubmissions": table_rows("my-submissions", "table.status-frame-datatable"),
    # Room #1 is a standings table, not a submissions table.
    "room": table_rows("room", "table.standings"),
    "roomContentHtml": page_content_html("room"),
    "statements": problem_statements(),
}

Path("src/data").mkdir(parents=True, exist_ok=True)
Path("src/data/contest2250.json").write_text(
    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
)

print("contest:", data["contest"])
print("problems:", len(data["problems"]))
for p in data["problems"]:
    print("   ", p["index"], p["name"], "|", p["limits"], "|", p["solvedCount"])
print("questions:", len(data["questions"]))
print("sidebar boxes:", [b["caption"] for b in data["sidebar"]])
for k in ("hacks", "mySubmissions", "room"):
    d = data[k]
    print(f"{k}: found={d['found']} headers={d['headers']} rows={len(d['rows'])}")
print("statements:", {k: v["title"] for k, v in data["statements"].items()})
