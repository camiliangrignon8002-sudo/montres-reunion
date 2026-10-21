"""Sonde temporaire : comment Isleden et Zeop Store chargent leurs produits (lancée à la main)."""
import re
from curl_cffi import requests

def court(s, n):
    return re.sub(r"\s+", " ", s)[:n]

def montre(u, marques=(), n=1500, liens=None, **kw):
    print("=" * 30, u, kw.get("headers", ""))
    try:
        r = requests.get(u, timeout=40, impersonate="chrome", **kw)
    except Exception as e:
        print("ERREUR", e); return ""
    h = r.text
    print("status", r.status_code, "url", r.url, "taille", len(h), r.headers.get("content-type"))
    for m in marques:
        for i in [x.start() for x in re.finditer(re.escape(m), h)][:2]:
            print("  MARQUE", m, i, court(h[max(0, i - 300):i + n], n + 300))
    if liens:
        t = sorted(set(re.findall(liens, h)))
        print("  LIENS", len(t), t[:40])
    return h

XHR = {"Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest"}
montre("https://isleden.re/1000025655-iphone-11", ["<article", "js-product-list", "products"], 1200, r'href="(https://isleden\.re/[^"]+\.html)"')
montre("https://isleden.re/1000025655-iphone-11?from-xhr", ["rendered_products", "product-miniature"], 1500, headers=XHR)
montre("https://isleden.re/recherche?controller=search&s=iphone", ["<article", "product-miniature"], 1200, r'href="(https://isleden\.re/[^"]+\.html)"')
h = montre("https://www.zeopstore.re/", ["preloader", "ajax", ".php", "fetch("], 600, r'href="([^"]+)"')
montre("https://www.zeopstore.re/apple-macbook-pro-gris-sideral,3786.htm", ["preloader", "ajax", ".php", "/api/"], 800, r'href="([^"]+)"')
for u in re.findall(r'(?:src|href)="(/[^"]+\.js[^"]*)"', h)[:6]:
    montre("https://www.zeopstore.re" + u, ["ajax", "preloader", ".php", "url:"], 400)
