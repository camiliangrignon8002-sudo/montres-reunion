"""Sonde temporaire : Zeop Store (lancée à la main)."""
import re
from curl_cffi import requests

def court(s, n):
    return re.sub(r"\s+", " ", s)[:n]

for u in ["https://www.zeopstore.re/apple", "https://www.zeopstore.re/x,3783.htm", "https://www.zeopstore.re/produit,3783.htm",
          "https://www.zeopstore.re/apple?page=2"]:
    print("=" * 30, u)
    try:
        r = requests.get(u, timeout=40, impersonate="chrome", allow_redirects=True)
    except Exception as e:
        print("ERREUR", e); continue
    h = r.text
    print("status", r.status_code, "url", r.url, "taille", len(h))
    print("  produits", sorted(set(re.findall(r'href="(/[a-z0-9-]+,\d+\.htm)"', h)))[:40])
    print("  wd-products", re.findall(r'wd-products="([^"]+)"', h)[:5])
    t = re.search(r"<title>(.*?)</title>", h, re.S); print("  titre", t and court(t.group(1), 120))
    print("  ld", court(" ".join(re.findall(r'"name": "([^"]+)"', h)[:3]), 200), re.findall(r'"price": "([^"]+)"', h)[:2])
