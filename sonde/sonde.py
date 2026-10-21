import json
from pathlib import Path
from curl_cffi import requests
OUT = Path(__file__).parent / "pages"; OUT.mkdir(exist_ok=True)
res = []
for i, u in enumerate(l.strip() for l in open(Path(__file__).parent / "urls.txt") if l.strip()):
    try:
        r = requests.get(u, timeout=40, impersonate="chrome")
        (OUT / f"{i:02d}.html").write_text(r.text[:2_000_000], encoding="utf-8", errors="replace")
        res.append({"i": i, "url": u, "code": r.status_code, "taille": len(r.text), "debut": r.text[:300]})
    except Exception as e:
        res.append({"i": i, "url": u, "erreur": str(e)[:200]})
(OUT / "resume.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
