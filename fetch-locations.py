import json
import urllib.request
import ssl
import os
import re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch_page(offset):
    data = json.dumps({
        "query": [{"Country": "*"}],
        "limit": 1000,
        "offset": offset,
    }).encode()
    req = urllib.request.Request(
        "https://ybkzmrytbgohhtjorkpu.supabase.co/functions/v1/fm-proxy/Event/layouts/Locality/_find",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        return json.loads(resp.read().decode())

def normalize_country(s):
    # Conservative country normalization: trim, collapse spaces, case-fold for grouping
    return re.sub(r"\s+", " ", s.strip()).lower()

all_records = []
offset = 1
while True:
    print(f"Fetching offset {offset}")
    res = fetch_page(offset)
    data = res.get("response", {}).get("data", [])
    if not data:
        break
    for r in data:
        f = r.get("fieldData", {})
        all_records.append({
            "country": f.get("Country", ""),
            "province": f.get("province", ""),
            "locality": f.get("locality", ""),
        })
    if len(data) < 1000:
        break
    offset += 1000
    if offset > 30000:
        break

# Group countries by normalized form
# variant_to_canonical: maps every raw spelling -> canonical display name
# canonical_variants: maps canonical -> list of all raw spellings (for search)
country_groups = {}  # normalized -> {variants: set, count: int}
for r in all_records:
    raw = r["country"]
    if not raw:
        continue
    norm = normalize_country(raw)
    if norm not in country_groups:
        country_groups[norm] = {"variants": {}, "best": raw}
    g = country_groups[norm]
    g["variants"][raw] = g["variants"].get(raw, 0) + 1

# Pick the most common spelling as the canonical display name for each group
canonical_to_variants = {}
variant_to_canonical = {}
for norm, g in country_groups.items():
    # Sort variants by frequency descending, pick the most common
    sorted_variants = sorted(g["variants"].items(), key=lambda x: -x[1])
    canonical = sorted_variants[0][0]
    canonical_to_variants[canonical] = list(g["variants"].keys())
    for v in g["variants"].keys():
        variant_to_canonical[v] = canonical

# Build provinces and localities indexed by canonical country
provinces_by_country = {}
localities_by_province = {}
for r in all_records:
    raw_country = r["country"]
    canonical_country = variant_to_canonical.get(raw_country, raw_country)
    if canonical_country and r["province"]:
        provinces_by_country.setdefault(canonical_country, set()).add(r["province"])
    if r["province"] and r["locality"]:
        key = canonical_country + "|" + r["province"]
        localities_by_province.setdefault(key, set()).add(r["locality"])

out = {
    "countries": sorted(canonical_to_variants.keys()),
    "countryVariants": canonical_to_variants,
    "provincesByCountry": {k: sorted(v) for k, v in provinces_by_country.items()},
    "localitiesByProvince": {k: sorted(v) for k, v in localities_by_province.items()},
}

os.makedirs("Frontend/shared", exist_ok=True)
with open("Frontend/shared/locations.json", "w") as f:
    json.dump(out, f, indent=2)

print(f"Wrote {len(all_records)} records -> {len(canonical_to_variants)} canonical countries")
print(f"(deduped from {sum(len(v) for v in canonical_to_variants.values())} raw variants)")
