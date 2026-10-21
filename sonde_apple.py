"""Sonde temporaire : décrit la structure des sites Apple de La Réunion (lancée à la main)."""
import re
from curl_cffi import requests

def court(s, n):
    return re.sub(r"\s+", " ", s)[:n]

def montre(u, marques=(), n=1500, liens=None):
    print("=" * 30, u)
    try:
        r = requests.get(u, timeout=40, impersonate="chrome")
    except Exception as e:
        print("ERREUR", e); return
    h = r.text
    print("status", r.status_code, "url", r.url, "taille", len(h))
    for m in marques:
        i = h.find(m)
        print("  MARQUE", m, i, court(h[max(0, i - 200):i + n], n + 200) if i >= 0 else "")
    if liens:
        t = sorted(set(re.findall(liens, h)))
        print("  LIENS", len(t), t[:40])

montre("https://delbosinformatique.re/magasin?rayon=apple", ["/magasin/apple-airpods-5"], 2500, r'href="(/magasin[^"]*)"')
montre("https://delbosinformatique.re/magasin?rayon=apple&page=2", [], 10, r'href="(/magasin/[^"?]+)"')
montre("https://delbosinformatique.re/magasin/apple-airpods-5", ["ld+json", "Caract"], 2000)
montre("https://leclic.re/taxons/electromenager-high-tech/high-tech-12/telephonie-3", ["apple-airpods-pro-3rd", "page=2"], 2500, r'href="(/taxons/[^"]+)"')
montre("https://leclic.re/search?q=apple", ["/products/"], 800)
montre("https://zeopstore.re/", ["€"], 1500, r'href="([^"]+\.htm)"')
montre("https://www.zeopstore.re/apple-macbook-pro-gris-sideral,3786.htm", ["€", "ld+json"], 1500)
montre("https://smart974.re/iphone-13.html", ["€", "<h1"], 2500)
montre("https://pineapple.re/catalogue/smartphones/", ["class=\"product", "page/2"], 2000)
montre("https://isleden.re/1000025613-apple-iphone-reconditionne", ["product-miniature"], 2000)
montre("https://ordiroi.re/7-apple", ["product-miniature"], 600, r'href="(https://ordiroi\.re/\d+-[a-z0-9-]+)"')
montre("https://www.easycash.fr/magasins", [], 10, r'href="([^"]*(?:reunion|saint-pierre|le-port|saint-denis|sainte-clotilde|saint-paul|974)[^"]*)"')
montre("https://www.easycash.fr/recherche?q=iphone", ["€"], 1500)
