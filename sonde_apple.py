"""Sonde temporaire : décrit la structure des sites Apple de La Réunion (lancée à la main)."""
import re, sys, json
from urllib.parse import urljoin
from curl_cffi import requests

def court(s, n):
    return re.sub(r"\s+", " ", s)[:n]

def montre(u, marque=None, n=3000, entetes=None, liens=None):
    print("=" * 30, u, marque or "")
    try:
        r = requests.get(u, timeout=40, impersonate="chrome", headers=entetes or {})
    except Exception as e:
        print("ERREUR", e); return ""
    h = r.text
    print("status", r.status_code, "url", r.url, "taille", len(h), r.headers.get("content-type"))
    if "json" in (r.headers.get("content-type") or ""):
        print(court(h, n)); return h
    for l in re.findall(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', h, re.S)[:6]:
        print("  LD", court(l, 1500))
    if marque:
        i = h.find(marque)
        print("  MARQUE", i, court(h[max(0, i - 200):i + n], n) if i >= 0 else "")
    if liens:
        tous = sorted(set(re.findall(liens, h)))
        print("  LIENS", len(tous), tous[:60])
    return h

montre("https://microstor.fr/56-iphone", 'class="product-miniature', 3500, liens=r'href="(https://microstor\.fr/[^"]+\.html)"')
montre("https://microstor.fr/56-iphone?page=2", None, 2500, entetes={"Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest"})
montre("https://microstor.fr/iphone-17-pro/1439-iphone-17-pro-max.html", 'product-prices', 2500)
montre("https://microstor.fr/content/6-trouver-un-magasin", "Sainte", 3000)
montre("https://phenix-store.com/6-reconditionne", 'product-miniature', 2500, liens=r'href="(https://phenix-store\.com/[^"]+\.html)"')
montre("https://phenix-store.com/reconditionne/956-apple-iphone-13-pro-max-128-go-reconditionne-bleu-alpin-0194252698600.html", 'product-prices', 2500)
montre("https://phenix-store.com/magasins", "97", 2500)
montre("https://ishop.re/apple/iphone/iphone-17", '/produit/', 4000, liens=r'href="([^"]*/(?:produit|decouvrir)/[^"]+)"')
montre("https://ishop.re/produit/iphone-16,302", 'product_price', 5000)
montre("https://ishop.re/produit/airtag,175", '€', 3000)
montre("https://ishop.re/produits-reconditionnes/iphone/iphone", '/produit', 4000, liens=r'href="([^"]*/produit[^"]*)"')
montre("https://ishop.re/trouver-un-magasin", "974", 3000)
h = montre("https://reunion.darty-dom.com/c/iphone", 'product-box-line', 4000, liens=r'href="(/p/[^"]+|https://reunion\.darty-dom\.com/p/[^"]+)"')
montre("https://reunion.darty-dom.com/c/info-apple", None, 100, liens=r'href="([^"]+)"[^>]*>[^<]*(?:MacBook|iPad|iMac|Apple)')
montre("https://www.cashexpress.fr/c-1001/magasin/sainte-clotilde/iphone", 'class="product-card"', 2500)
montre("https://www.cashexpress.fr/c-1001/magasin/saint-pierre/iphone", None, 100, liens=r'class="product-card__name">([^<]+)<')
montre("https://www.cashexpress.fr/magasins", None, 100, liens=r'href="([^"]*magasin[^"]*(?:reunion|saint|sainte|le-port|tampon)[^"]*)"')
montre("https://www.paruvendu.re/vente-occasion/?q=iphone&p=2", "<app-annonce", 2500)
montre("https://www.paruvendu.re/vente-occasion/sainte-clotilde-97490/iphone-13-pro-max/1294598189/", "Description", 3000)
