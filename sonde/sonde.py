"""Sonde : télécharge des pages de sites d'annonces pour en étudier la structure."""
import json, re, sys
from pathlib import Path
from curl_cffi import requests

OUT = Path(__file__).parent / "pages"
OUT.mkdir(exist_ok=True)
urls = [l.strip() for l in open(Path(__file__).parent / "urls.txt") if l.strip() and not l.startswith("#")]
resume = []
for i, u in enumerate(urls):
    try:
        r = requests.get(u, timeout=40, impersonate="chrome", allow_redirects=True)
        (OUT / f"{i:02d}.html").write_text(r.text[:3_000_000], encoding="utf-8", errors="replace")
        resume.append({"i": i, "url": u, "final": str(r.url), "code": r.status_code, "taille": len(r.text)})
    except Exception as e:
        resume.append({"i": i, "url": u, "erreur": str(e)[:200]})
    print(resume[-1], flush=True)
(OUT / "resume.json").write_text(json.dumps(resume, indent=1, ensure_ascii=False))
