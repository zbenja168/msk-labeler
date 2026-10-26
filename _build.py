#!/usr/bin/env python3
"""Build the MSK Diagram Labeler site: data/manifest.json + index.html (grouped
Week -> Session in class order from msk_build/bricks.tsv), and inject the AT
badge into play.html. Validates every data/brick_NN.json first."""
import csv, glob, html, io, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
TSV = os.path.join(os.path.dirname(ROOT), "msk_build", "bricks.tsv")


def validate(p):
    d = json.load(io.open(p, encoding="utf-8"))
    errs = []
    assert d.get("diagrams"), "no diagrams"
    for k, dg in enumerate(d["diagrams"]):
        vb = [float(x) for x in dg["viewBox"].split()]
        labs = dg["labels"]
        if not 5 <= len(labs) <= 14:
            errs.append(f"diagram {k}: {len(labs)} labels (want 5-14)")
        names = [l["name"] for l in labs]
        funcs = [l.get("function", "") for l in labs]
        if len(set(names)) != len(names): errs.append(f"diagram {k}: duplicate names")
        if len(set(funcs)) != len(funcs) or not all(funcs): errs.append(f"diagram {k}: missing/duplicate functions")
        for l in labs:
            for c in ("x", "y") + (("lx", "ly") if "lx" in l else ()):
                v = l[c]; lo, hi = (vb[0], vb[0] + vb[2]) if c in ("x", "lx") else (vb[1], vb[1] + vb[3])
                if not lo <= v <= hi: errs.append(f"diagram {k}: {l['name']} {c}={v} outside viewBox")
        if re.search(r"<script|on\w+\s*=", dg["svg"], re.I): errs.append(f"diagram {k}: script/handler in svg")
    return d, errs


def main():
    rows = list(csv.DictReader(io.open(TSV, encoding="utf-8"), delimiter="\t"))
    manifest, bad = [], False
    for r in rows:
        p = os.path.join(ROOT, "data", f"brick_{int(r['num']):02d}.json")
        if not os.path.exists(p):
            continue
        d, errs = validate(p)
        for e in errs:
            print(f"  brick {r['num']}: {e}"); bad = True
        manifest.append({"num": int(r["num"]), "week": int(r["week"]), "session": int(r["session"]),
                         "title": d["title"], "diagrams": len(d["diagrams"]),
                         "labels": sum(len(x["labels"]) for x in d["diagrams"])})
    if bad and "--force" not in sys.argv:
        sys.exit("validation failed")
    io.open(os.path.join(ROOT, "data", "manifest.json"), "w", encoding="utf-8").write(json.dumps(manifest, indent=1))

    badge = io.open(os.path.join(ROOT, "_badge.html"), encoding="utf-8").read()
    body, wk, ss = "", None, None
    for m in manifest:
        if m["week"] != wk:
            if wk is not None: body += "</div></section>\n"
            body += f'<section class="week"><div class="week-head">Week {m["week"]}</div>'
            wk, ss = m["week"], None
        if m["session"] != ss:
            if ss is not None: body += "</div>"
            body += f'<div class="sess">Session {m["session"]}</div><div class="cards">'
            ss = m["session"]
        body += (f'<a class="card" href="play.html?b={m["num"]}"><b>{html.escape(m["title"])}</b>'
                 f'<span>{m["diagrams"]} diagram{"s" if m["diagrams"] != 1 else ""} &middot; {m["labels"]} structures</span></a>')
    if wk is not None: body += "</div></section>\n"
    total = sum(m["labels"] for m in manifest)
    page = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MSK Diagram Labeler</title><link rel="stylesheet" href="style.css">
<script defer src="https://activetransport.app/static/tool-track.js"></script></head>
<body>
{badge}
<header class="hero">
  <div class="eyebrow">Skin, Musculoskeletal &amp; Connective Tissue</div>
  <h1>MSK Diagram Labeler</h1>
  <p>Label simple diagrams for every brick, three ways: type each structure's name, drag names from a word bank, or match each structure to its function. {len(manifest)} bricks, {total} structures.</p>
</header>
<main>
{body}</main>
</body></html>
'''
    io.open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(page)
    pp = os.path.join(ROOT, "play.html"); s = io.open(pp, encoding="utf-8").read()
    if "<!--BADGE-->" in s:
        io.open(pp, "w", encoding="utf-8").write(s.replace("<!--BADGE-->", badge))
    print(f"built: {len(manifest)} bricks, {total} structures")


if __name__ == "__main__":
    main()
