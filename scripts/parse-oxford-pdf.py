#!/usr/bin/env python3
"""Parse Oxford 5000 Korean-English PDF into oxfordKoEn JSON for Firebase + the app."""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(
    "/home/ubuntu/.cursor/projects/workspace/uploads/"
    "Oxford_5000_Final_Newest_edition_2024.pdf-20240319170406_ee42.pdf"
)
CSV_PATH = ROOT / "data" / "Oxford.csv"
CATEGORIZED_PATH = ROOT / "scripts" / "_oxford_categorized.csv"
OUT_PATH = ROOT / "src" / "data" / "oxfordKoEn.json"

ENTRY_HEAD = re.compile(
    r"^(\d+)\s+(?:([ABC][12])\s+)?(.+)$"
)
IPA_LINE = re.compile(r"IPA", re.I)
HANGUL = re.compile(r"[\uac00-\ud7a3]")
POS_TAG = re.compile(r"^\[([^\]]+)\]")
ENGLISH_START = re.compile(
    r"""^(?:[A-Z"'“‘]|I\b|I'm\b|I've\b|I'd\b|I'll\b|\d)""",
)

POS_MAP = {
    "명": "noun",
    "동": "verb",
    "형": "adjective",
    "부": "adverb",
}

LEVEL_TO_CATEGORY = {
    "A1": ("입문", 1),
    "A2": ("초급", 2),
    "B1": ("중급", 3),
    "B2": ("중급", 4),
    "C1": ("고급", 5),
}

SITUATION_CATS = {"여행", "비즈니스", "쇼핑", "위기탈출"}


def parse_csv_rows(path: Path) -> dict[int, dict[str, str]]:
    out: dict[int, dict[str, str]] = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                n = int((row.get("No") or row.get("no") or "").strip())
            except ValueError:
                continue
            out[n] = row
    return out


def parse_categorized(path: Path) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (row.get("word") or "").strip().lower()
            if key:
                out[key] = row
    return out


def extract_korean_gloss(sense: str) -> str:
    s = POS_TAG.sub(" ", sense)
    s = re.sub(r"\[[^\]]*\]", " ", s)
    for _ in range(3):
        s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"(mainly UK|mainly US|informal|formal|figurative|dated|slang)", " ", s, flags=re.I)
    chunks = re.findall(r"[~\uac00-\ud7a3/,·\-\s]+", s)
    gloss = " ".join(c.strip(" -/,") for c in chunks if c.strip(" -/,"))
    gloss = re.sub(r"\s+", " ", gloss).strip(" ,/-")
    if gloss.startswith("을 ") or gloss.startswith("를 ") or gloss.startswith("에 "):
        gloss = "~" + gloss
    return gloss


def map_pos(tag: str) -> str | None:
    tag = tag.strip()
    for prefix, pos in POS_MAP.items():
        if tag.startswith(prefix):
            return pos
    return None


IPA_CHARS = re.compile(r"[ˈˌɪæɑəɛʌʊθʃŋʒðɚɝː]")


def looks_ipa_fragment(line: str) -> bool:
    s = line.strip()
    if s.lower().startswith("ipa"):
        return True
    if s.startswith("/") or s.endswith("/"):
        return True
    if IPA_CHARS.search(s) and not HANGUL.search(s) and len(s) < 80:
        return True
    return False


def looks_english_example(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if s.startswith("["):
        return False
    if s.lower() in {"usa", "pronunciation:", "네이버발음"}:
        return False
    if looks_ipa_fragment(s):
        return False
    hangul_ratio = len(HANGUL.findall(s)) / max(len(s), 1)
    if hangul_ratio > 0.25:
        return False
    return bool(ENGLISH_START.match(s)) or (
        hangul_ratio < 0.05 and any(c.isalpha() for c in s) and " " in s
    )


def parse_entry_block(block: str) -> dict | None:
    lines = [ln.strip() for ln in block.splitlines()]
    lines = [ln for ln in lines if ln]
    head_i = None
    m_head = None
    for i, ln in enumerate(lines):
        m = ENTRY_HEAD.match(ln)
        if m:
            # skip table header "No. Lv ..."
            if m.group(1) == "No" or not m.group(1).isdigit():
                continue
            # skip lines that are clearly continuation numbers inside examples
            rest = (m.group(3) or "").strip()
            if rest.lower() in {"lv", "단어"}:
                continue
            head_i = i
            m_head = m
            break
    if m_head is None or head_i is None:
        return None

    no = int(m_head.group(1))
    level = (m_head.group(2) or "").strip() or None
    word = (m_head.group(3) or "").strip()
    word = re.sub(r"\s+", " ", word)
    # word line should not be a long sentence
    if len(word) > 40 or looks_english_example(word):
        return None

    body = lines[head_i + 1 :]
    ipa_parts: list[str] = []
    in_ipa = False
    senses: list[str] = []
    examples: list[str] = []
    cur_sense: list[str] = []
    cur_ex: list[str] = []

    def flush_sense() -> None:
        nonlocal cur_sense
        if cur_sense:
            senses.append(" ".join(cur_sense))
            cur_sense = []

    def flush_ex() -> None:
        nonlocal cur_ex
        if cur_ex:
            examples.append(" ".join(cur_ex))
            cur_ex = []

    for ln in body:
        low = ln.lower()
        if low in {"usa", "pronunciation:", "네이버발음"}:
            continue
        if IPA_LINE.search(ln) or in_ipa or looks_ipa_fragment(ln):
            if ln.startswith("[") or (looks_english_example(ln) and not looks_ipa_fragment(ln)):
                in_ipa = False
            else:
                ipa_parts.append(ln)
                in_ipa = True
                continue
        if ln.startswith("["):
            flush_sense()
            flush_ex()
            cur_sense = [ln]
            continue
        if cur_sense and not looks_english_example(ln):
            cur_sense.append(ln)
            continue
        if looks_english_example(ln) or cur_ex:
            flush_sense()
            if looks_english_example(ln) and cur_ex:
                # new sentence
                if ln[:1].isupper() or ln[:1] in "\"'“‘":
                    flush_ex()
            cur_ex.append(ln)
            continue
        if cur_sense:
            cur_sense.append(ln)
    flush_sense()
    flush_ex()

    pos = None
    glosses: list[str] = []
    for sense in senses:
        if "알파벳" in sense or "first letter of alphabet" in sense.lower():
            continue
        tag_m = POS_TAG.match(sense)
        if pos is None and tag_m:
            pos = map_pos(tag_m.group(1))
        g = extract_korean_gloss(sense)
        if g and g not in glosses:
            glosses.append(g)
        if len(glosses) >= 2:
            break

    korean_meaning = " / ".join(glosses)
    english_example = examples[0] if examples else ""
    # trim overly long example (keep first sentence-ish)
    if len(english_example) > 220:
        cut = re.split(r"(?<=[.!?])\s+", english_example)
        english_example = cut[0][:220]

    ipa = " ".join(ipa_parts)
    ipa = re.sub(r"pronunciation:\s*", "", ipa, flags=re.I)
    ipa = re.sub(r"^IPA", "", ipa).strip(" :")

    return {
        "no": no,
        "level": level,
        "word": word,
        "pos": pos,
        "korean_meaning": korean_meaning,
        "english_example": english_example,
        "ipa": ipa,
    }


def pdf_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    chunks: list[str] = []
    for i, page in enumerate(reader.pages):
        if i < 3:
            continue
        text = page.extract_text() or ""
        # stop at appendix word lists
        if "The Oxford 3000" in text and "by CEFR level" in text and i > 380:
            break
        if "The Oxford 5000" in text and "by CEFR level" in text and "thread n." in text:
            break
        chunks.append(text)
    return "\n".join(chunks)


def main() -> int:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    print(f"Reading PDF: {pdf_path}")
    raw = pdf_text(pdf_path)
    blocks = re.split(r"네이버발음", raw)
    parsed: dict[int, dict] = {}
    for block in blocks:
        entry = parse_entry_block(block)
        if not entry:
            continue
        parsed[entry["no"]] = entry

    csv_rows = parse_csv_rows(CSV_PATH)
    categorized = parse_categorized(CATEGORIZED_PATH)

    # Prefer CSV numbering (stable) as the spine
    numbers = sorted(set(csv_rows) | set(parsed))
    rows: list[dict] = []
    missing_meaning = 0
    used_pdf = 0
    used_cat_meaning = 0

    for n in numbers:
        csv_row = csv_rows.get(n, {})
        pdf_row = parsed.get(n, {})
        word = (csv_row.get("Word") or pdf_row.get("word") or "").strip()
        if not word:
            continue
        if word.lower() in {"no.", "lv", "단어"}:
            continue
        level = (csv_row.get("Level") or pdf_row.get("level") or "").strip() or None
        cat_row = categorized.get(word.lower()) or categorized.get(
            re.sub(r"\s*\([^)]*\)\s*", "", word).lower()
        )

        korean_meaning = (pdf_row.get("korean_meaning") or "").strip()
        if korean_meaning:
            used_pdf += 1
        elif cat_row and cat_row.get("korean_meaning"):
            korean_meaning = cat_row["korean_meaning"].strip()
            used_cat_meaning += 1
        else:
            missing_meaning += 1
            korean_meaning = word

        english_example = (pdf_row.get("english_example") or "").strip()
        if english_example and looks_ipa_fragment(english_example):
            english_example = ""
        if not english_example and cat_row:
            english_example = (cat_row.get("english_translation") or "").strip()

        korean_example = ""
        if cat_row:
            korean_example = (cat_row.get("korean_example") or "").strip()

        cefr_cat, cefr_diff = LEVEL_TO_CATEGORY.get(level or "", ("입문", 1))
        category = cefr_cat
        difficulty = cefr_diff
        if cat_row:
            ccat = (cat_row.get("category") or "").strip()
            if ccat in SITUATION_CATS:
                category = ccat
            elif ccat in {"입문", "초급", "중급", "고급"}:
                category = ccat
            try:
                difficulty = int(cat_row.get("difficulty") or difficulty)
            except ValueError:
                pass

        pos = pdf_row.get("pos")
        created = "2024-03-19T00:00:00.000Z"
        rows.append(
            {
                "id": f"ox-{n:04d}",
                "word": word,
                "korean_meaning": korean_meaning[:180],
                "level": level,
                "pos": pos,
                "english_example": english_example[:240] or None,
                "korean_example": korean_example[:240] or None,
                "word_audio_url": None,
                "meaning_audio_url": None,
                "english_example_audio_url": None,
                "korean_example_audio_url": None,
                "image_url": None,
                "order_index": n,
                "category": category,
                "difficulty": difficulty,
                "word_pron_ko": None,
                "created_at": created,
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pos_counts: dict[str, int] = {}
    level_counts: dict[str, int] = {}
    cat_counts: dict[str, int] = {}
    for r in rows:
        pos_counts[str(r["pos"])] = pos_counts.get(str(r["pos"]), 0) + 1
        level_counts[str(r["level"])] = level_counts.get(str(r["level"]), 0) + 1
        cat_counts[str(r["category"])] = cat_counts.get(str(r["category"]), 0) + 1

    print(f"Wrote {len(rows)} rows → {OUT_PATH}")
    print(f"PDF entries parsed: {len(parsed)}")
    print(f"korean_meaning from PDF: {used_pdf}, from categorized: {used_cat_meaning}, fallback: {missing_meaning}")
    print("levels", level_counts)
    print("pos", pos_counts)
    print("category", cat_counts)
    print("sample[0]", json.dumps(rows[0], ensure_ascii=False, indent=2))
    print("sample[8]", json.dumps(rows[8], ensure_ascii=False, indent=2))
    print("sample[513]", json.dumps(rows[513], ensure_ascii=False, indent=2) if len(rows) > 513 else "n/a")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
