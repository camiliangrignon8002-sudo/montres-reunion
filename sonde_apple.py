"""Sonde temporaire : décrit la structure des sites Apple de La Réunion (lancée à la main)."""
import re, sys
from curl_cffi import requests

def court(s, n):
    return re.sub(r"\s+", " ", s)[:n]

def montre(u, marques, n=2500):
    print("=" * 30, u)
    r = requests.get(u, timeout=40, impersonate="chrome")
    h = r.text
    print("status", r.status_code, "taille", len(h))
    for m in marques:
        idx = [x.start() for x in re.finditer(re.escape(m), h)][:3]
        for i in idx:
            print("  MARQUE", m, i, court(h[max(0, i - 300):i + n], n + 300))

montre("https://microstor.fr/macbook_air/1629-5237-macbook-air-13-m5.html", ["product-variants", "data-product-attribute"], 3000)
montre("https://ishop.re/trouver-un-magasin", ["card-header"], 900)
montre("https://phenix-store.com/magasins", ["974", "store"], 1200)
montre("https://ishop.re/produit/iphone-17e,350", ["<select", "attribute"], 1500)
