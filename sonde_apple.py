"""Sonde temporaire : décrit la structure des sites Apple de La Réunion (lancée à la main)."""
import re, json
from curl_cffi import requests

def court(s, n):
    return re.sub(r"\s+", " ", s)[:n]

def montre(u, n=700, **kw):
    print("=" * 30, u)
    try:
        r = requests.request(kw.pop("methode", "GET"), u, timeout=40, impersonate="chrome", **kw)
    except Exception as e:
        print("ERREUR", e); return
    h = r.text
    print("status", r.status_code, "url", r.url, "taille", len(h), r.headers.get("content-type"))
    indices = [k for k in ["Shopify", "woocommerce", "wp-content", "prestashop", "PrestaShop", "Magento", "sylius", "Sylius",
                           "__NEXT_DATA__", "wix", "ld+json", "product-miniature", "datadome", "captcha"] if k in h]
    print("  indices", indices)
    if "json" in (r.headers.get("content-type") or ""):
        print("  JSON", court(h, n))
    liens = sorted(set(re.findall(r'href="([^"#]*(?:iphone|apple|ipad|macbook|produit|product)[^"#]*)"', h, re.I)))
    print("  liens", len(liens), liens[:25])
    i = h.find("€")
    if i > 0:
        print("  PRIX", court(h[max(0, i - n):i + 100], n + 100))

for site in ["https://delbosinformatique.re/magasin?rayon=apple", "https://leclic.re/taxons/electromenager-high-tech/high-tech-12/telephonie-3",
             "https://isleden.re/1000025613-apple-iphone-reconditionne", "https://telroi.re/", "https://ordiroi.re/iphone/",
             "https://smart974.re/", "https://pineapple.re/", "https://www.sfr.re/", "https://boutique.orange.re/", "https://www.orange.re/",
             "https://www.zeop.re/"]:
    montre(site)
for base in ["https://smart974.re", "https://pineapple.re", "https://telroi.re", "https://ordiroi.re", "https://isleden.re"]:
    montre(base + "/products.json?limit=3", 400)
    montre(base + "/wp-json/wc/store/v1/products?search=iphone&per_page=3", 400)
montre("https://www.leboncoin.fr/recherche?text=iphone&locations=d_974", 400)
montre("https://api.leboncoin.fr/finder/search", 600, methode="POST",
       headers={"api_key": "ba0c2dad52b3ec", "Content-Type": "application/json"},
       data=json.dumps({"limit": 5, "filters": {"keywords": {"text": "iphone"}, "location": {"departments": ["974"]}, "category": {}}}))
