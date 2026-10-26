#!/usr/bin/env python3
"""Render a brick's diagrams to PNG with the numbered pins and answer names
overlaid, so a diagram author can LOOK at it (Read the PNG) and fix anything
that is misplaced or unreadable.   py _render.py NN  ->  _renders/brick_NN_dK.png"""
import html, io, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"


def main():
    n = int(sys.argv[1])
    d = json.load(io.open(os.path.join(ROOT, "data", f"brick_{n:02d}.json"), encoding="utf-8"))
    out = os.path.join(ROOT, "_renders"); os.makedirs(out, exist_ok=True)
    for k, dg in enumerate(d["diagrams"]):
        vb = [float(x) for x in dg["viewBox"].split()]
        w = 1000; h = int(w * vb[3] / vb[2])
        pins = ""
        for i, l in enumerate(dg["labels"]):
            px, py = l.get("lx", l["x"]), l.get("ly", l["y"])
            if "lx" in l:
                pins += f'<line x1="{l["x"]}" y1="{l["y"]}" x2="{px}" y2="{py}" stroke="#0b1220" stroke-width="1.6" stroke-dasharray="3 3"/>'
                pins += f'<circle cx="{l["x"]}" cy="{l["y"]}" r="3.5" fill="#0b1220" stroke="#fff" stroke-width="1.5"/>'
            pins += (f'<circle cx="{px}" cy="{py}" r="13" fill="#0b1220" stroke="#fff" stroke-width="2"/>'
                     f'<text x="{px}" y="{py}" fill="#fff" font-size="13" font-weight="700" text-anchor="middle" dominant-baseline="central">{i + 1}</text>')
        key = "".join(f"<li>{i + 1}. {html.escape(l['name'])}</li>" for i, l in enumerate(dg["labels"]))
        page = (f'<html><body style="margin:0;background:#fff;font-family:Segoe UI">'
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{dg["viewBox"]}" width="{w}" height="{h}" style="background:#f8f5ee">{dg["svg"]}{pins}</svg>'
                f'<ol style="list-style:none;columns:3;font-size:15px;padding:8px 16px;margin:0">{key}</ol></body></html>')
        hp = os.path.join(out, f"brick_{n:02d}_d{k + 1}.html"); io.open(hp, "w", encoding="utf-8").write(page)
        png = os.path.join(out, f"brick_{n:02d}_d{k + 1}.png")
        subprocess.run([EDGE, "--headless=new", "--disable-gpu", f"--screenshot={png}",
                        f"--window-size={w},{h + 40 + 22 * ((len(dg['labels']) + 2) // 3)}", "file:///" + hp.replace("\\", "/")],
                       capture_output=True, timeout=60)
        print(png, os.path.exists(png))


if __name__ == "__main__":
    main()
