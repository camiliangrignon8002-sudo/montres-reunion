"""Sonde temporaire : décrit la structure des sites Apple de La Réunion (lancée à la main)."""
import re, sys, json
from urllib.parse import urljoin
from curl_cffi import requests

URLS = sys.argv[1:] or [
    "https://microstor.fr/", "https://microstor.fr/56-iphone", "https://microstor.fr/113-reconditionnes",
    "https://ishop.re/", "https://ishop.re/apple/iphone/iphone-16", "https://ishop.re/produit/iphone-16-plus,303",
    "https://ishop.re/produits-reconditionnes/produit-reconditionnes/mac",
    "https://reunion.darty-dom.com/c/iphone", "https://phenix-store.com/",
    "https://www.cashexpress.fr/c-19/magasin/sainte-clotilde/montres-marques",
    "https://www.paruvendu.re/vente-occasion/?q=iphone",
]
for u in URLS:
    print("=" * 30, u)
    try:
        r = requests.get(u, timeout=40, impersonate="chrome")
    except Exception as e:
        print("ERREUR", e); continue
    h = r.text
    print("status", r.status_code, "url", r.url, "taille", len(h))
    for m in re.findall(r'<meta[^>]+name="generator"[^>]*>', h)[:3]: print("gen", m)
    for k in ["Shopify", "woocommerce", "prestashop", "Magento", "wix", "PrestaShop", "next/static", "__NUXT", "shopware", "wp-content"]:
        if k in h: print("indice", k)
    lds = re.findall(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', h, re.S)
    print("ld+json", len(lds))
    for l in lds[:3]: print("  ", re.sub(r"\s+", " ", l)[:500])
    liens = sorted(set(urljoin(u, x) for x in re.findall(r'href="([^"#]+)"', h)))
    hote = re.match(r"https?://[^/]+", u).group(0)
    internes = [l for l in liens if l.startswith(hote)]
    print("liens internes", len(internes))
    for l in internes[:150]: print("  L", l)
    i = h.find("€")
    for m in list(re.finditer(r"€|&euro;", h))[:4]:
        print("  PRIX…", re.sub(r"\s+", " ", h[max(0, m.start()-400):m.start()+80]))
