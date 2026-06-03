#!/usr/bin/env python3
"""Split nasb2020.json into per-chapter files for the e-reader firmware.

Outputs `devo/nasb-split/`:
  index.json                       → {"BOOKNAME": chapter_count, ...}
  <slug>/<chapter>.json            → {"1": "verse 1", "2": "verse 2", ...}

Slug rule (matches the C3 firmware's bookSlug helper):
  lowercase + spaces → '-'.
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, "nasb2020.json")
OUT  = os.path.join(HERE, "nasb-split")

def slugify(name: str) -> str:
    return re.sub(r"\s+", "-", name.lower())

def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    index = {}
    n_chapters = 0
    for book_name, chapters in data.items():
        slug = slugify(book_name)
        index[book_name] = len(chapters)
        book_dir = os.path.join(OUT, slug)
        os.makedirs(book_dir, exist_ok=True)
        for ch_num, verses in chapters.items():
            with open(os.path.join(book_dir, f"{ch_num}.json"), "w", encoding="utf-8") as f:
                json.dump(verses, f, ensure_ascii=False, separators=(",", ":"))
            n_chapters += 1

    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {len(index)} books, {n_chapters} chapter files to {OUT}")

if __name__ == "__main__":
    sys.exit(main())
