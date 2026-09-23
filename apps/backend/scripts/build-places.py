#!/usr/bin/env python3
"""
Builds SkyAtlas's place dataset from the GeoNames dump.

Runs on the Frankfurt box, not the development machine: GeoNames' download
server stalls large transfers to Russian addresses — the HEAD succeeds and then
the body never arrives — and pulling 600 MB back through an SSH tunnel would
take an hour. Filtering here and shipping the result moves about 5% as many
bytes.

Written for a 1 GB box that is also serving other things, so nothing is held in
memory that grows with the data: the two "which ids matter" sets are bitsets of
a couple of megabytes each, and every pass streams straight out of the zip
without unpacking it to disk.

Output (both gzipped, tab-separated):
  places.tsv.gz   id, name, category, lat, lon, elevation, population, prominence
  names.tsv.gz    id, lang, kind (name|wiki), value
"""

import gzip
import io
import os
import sys
import urllib.parse
import urllib.request
import zipfile

BASE = "https://download.geonames.org/export/dump/"
FILES = {"allCountries.zip": "allCountries.txt", "alternateNames.zip": "alternateNames.txt"}
LANGS = ("en", "ru", "de", "fr", "es", "ja")

# GeoNames feature codes → our categories. Codes absent here are dropped, which
# is most of the file: administrative divisions, farms, wells, bus stops.
CATEGORY = {}
for code in ("PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC", "PPLG"):
    CATEGORY[code] = "city"
for code in ("MT", "MTS", "PK", "PKS", "RDGE", "HLL"):
    CATEGORY[code] = "mountain"
CATEGORY["VLC"] = "volcano"
for code in ("LK", "LKS", "RSV", "LGN"):
    CATEGORY[code] = "lake"
for code in ("STM", "STMS"):
    CATEGORY[code] = "river"
for code in ("SEA", "OCN", "GULF", "BAY", "STRT"):
    CATEGORY[code] = "sea"
for code in ("ISL", "ISLS", "ATOL"):
    CATEGORY[code] = "island"
for code in ("PRK", "RESN", "RESV", "RESF", "FRST"):
    CATEGORY[code] = "park"
for code in ("MNMT", "CSTL", "RUIN", "ANS", "PYR", "PYRS", "TMPL", "HSTS"):
    CATEGORY[code] = "historic"
for code in ("DSRT", "GLCR", "VAL", "CNYN", "FLLS", "CAPE", "PLAT", "MESA"):
    CATEGORY[code] = "landmark"

# Seas and volcanoes are few and always worth naming. Everything else has to
# earn its place, or a corridor over Europe returns ten thousand ponds.
ALWAYS = {"SEA", "OCN", "GULF", "STRT", "VLC"}

MAX_ID = 14_000_000  # GeoNames ids sit below this; the bitsets are sized from it


class BitSet:
    """A few megabytes instead of a few hundred: ids are dense small integers."""

    __slots__ = ("bits",)

    def __init__(self, size):
        self.bits = bytearray((size >> 3) + 1)

    def add(self, i):
        if 0 <= i <= MAX_ID:
            self.bits[i >> 3] |= 1 << (i & 7)

    def __contains__(self, i):
        return 0 <= i <= MAX_ID and bool(self.bits[i >> 3] & (1 << (i & 7)))


def download(name):
    if os.path.exists(name) and os.path.getsize(name) > 1_000_000:
        print(f"  {name} already here ({os.path.getsize(name) // 1048576} MB)", flush=True)
        return
    print(f"  fetching {name}…", flush=True)
    urllib.request.urlretrieve(BASE + name, name)
    print(f"  {name}: {os.path.getsize(name) // 1048576} MB", flush=True)


def stream(zip_name):
    """Lines of the single text member, read straight out of the archive."""
    with zipfile.ZipFile(zip_name) as z:
        with z.open(FILES[zip_name]) as raw:
            for line in io.TextIOWrapper(raw, encoding="utf-8", errors="replace"):
                yield line.rstrip("\n")


def wiki_lang_and_title(url):
    """`https://ru.wikipedia.org/wiki/Ипох` → ('ru', 'Ипох')."""
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.netloc
        if not host.endswith(".wikipedia.org"):
            return None
        lang = host.split(".", 1)[0]
        if lang not in LANGS:
            return None
        path = parsed.path
        marker = "/wiki/"
        if marker not in path:
            return None
        title = urllib.parse.unquote(path.split(marker, 1)[1]).replace("_", " ")
        return (lang, title) if title else None
    except ValueError:
        return None


def prominence_of(category, population, elevation, linked):
    bonus = 10_000 if linked else 0
    if category == "city":
        return (population or 0) + bonus
    if category in ("mountain", "volcano"):
        return (elevation * 40 if elevation else 60_000) + bonus
    base = {
        "sea": 300_000,
        "island": 80_000,
        "landmark": 60_000,
        "lake": 60_000,
        "river": 50_000,
        "park": 40_000,
        "historic": 30_000,
    }
    return base.get(category, 20_000) + bonus


def main():
    print("Downloading…", flush=True)
    for name in FILES:
        download(name)

    # Pass 1 — which places somebody thought worth an article. This is the
    # notability signal; without it the dataset is dominated by unnamed creeks.
    print("Pass 1/3: Wikipedia links…", flush=True)
    linked = BitSet(MAX_ID)
    seen = 0
    for line in stream("alternateNames.zip"):
        seen += 1
        cols = line.split("\t")
        if len(cols) < 4 or cols[2] != "link":
            continue
        if ".wikipedia.org" not in cols[3]:
            continue
        try:
            linked.add(int(cols[1]))
        except ValueError:
            pass
    print(f"  scanned {seen:,} alternate names", flush=True)

    # Pass 2 — the places themselves.
    print("Pass 2/3: places…", flush=True)
    kept = BitSet(MAX_ID)
    written = 0
    by_category = {}
    with gzip.open("places.tsv.gz", "wt", encoding="utf-8") as out:
        for line in stream("allCountries.zip"):
            cols = line.split("\t")
            if len(cols) < 17:
                continue
            code = cols[7]
            category = CATEGORY.get(code)
            if category is None:
                continue
            try:
                gid = int(cols[0])
            except ValueError:
                continue

            population = int(cols[14]) if cols[14].isdigit() else 0
            elevation = int(cols[15]) if cols[15].lstrip("-").isdigit() else 0
            if not elevation and cols[16].lstrip("-").isdigit():
                dem = int(cols[16])
                # -9999 is GeoNames' "no data" marker in the DEM column.
                elevation = dem if dem > -1000 else 0
            is_linked = gid in linked

            if code in ALWAYS:
                keep = True
            elif category == "city":
                keep = population >= 15_000 or (population >= 3_000 and is_linked)
            elif category in ("mountain",):
                keep = elevation >= 1_500 or is_linked
            else:
                keep = is_linked
            if not keep:
                continue

            try:
                lat = float(cols[4])
                lon = float(cols[5])
            except ValueError:
                continue

            kept.add(gid)
            written += 1
            by_category[category] = by_category.get(category, 0) + 1
            out.write(
                "\t".join(
                    (
                        str(gid),
                        cols[1].replace("\t", " "),
                        category,
                        f"{lat:.5f}",
                        f"{lon:.5f}",
                        str(elevation),
                        str(population),
                        str(prominence_of(category, population, elevation, is_linked)),
                    )
                )
                + "\n"
            )
    print(f"  kept {written:,} places", flush=True)
    for name, count in sorted(by_category.items(), key=lambda kv: -kv[1]):
        print(f"    {name:10s} {count:,}", flush=True)

    # Pass 3 — names and article titles, only for what survived pass 2.
    print("Pass 3/3: names…", flush=True)
    names = 0
    with gzip.open("names.tsv.gz", "wt", encoding="utf-8") as out:
        for line in stream("alternateNames.zip"):
            cols = line.split("\t")
            if len(cols) < 4:
                continue
            try:
                gid = int(cols[1])
            except ValueError:
                continue
            if gid not in kept:
                continue

            lang = cols[2]
            value = cols[3]
            if lang == "link":
                found = wiki_lang_and_title(value)
                if found:
                    out.write(f"{gid}\t{found[0]}\twiki\t{found[1]}\n")
                    names += 1
                continue
            if lang not in LANGS:
                continue
            # Historic and colloquial variants are wrong on a card: nobody wants
            # a mountain labelled with the name it had under a former empire.
            historic = len(cols) > 7 and cols[7] == "1"
            colloquial = len(cols) > 6 and cols[6] == "1"
            if historic or colloquial:
                continue
            preferred = "1" if (len(cols) > 4 and cols[4] == "1") else "0"
            out.write(f"{gid}\t{lang}\tname{preferred}\t{value}\n")
            names += 1
    print(f"  wrote {names:,} names", flush=True)

    for f in ("places.tsv.gz", "names.tsv.gz"):
        print(f"{f}: {os.path.getsize(f) // 1048576} MB", flush=True)


if __name__ == "__main__":
    sys.exit(main())
