#!/usr/bin/env python3
"""Build the offline English-translation pack from a Sefaria-Export checkout.

Reads only the local checkout (no network). Writes:

    <out>/manifest.json            global index + source/license table
    <out>/chunks/<key>.json        per-work segments, chunked by chapter/daf
    <out>/plugin-data/*.js         <script>-wrapped copies of the two above
    <reports>/licenses.{json,csv,md}
    <reports>/coverage.{json,csv,md}
    <reports>/size-report.{json,md}
    <reports>/merge-fidelity.{json,md}

Usage:
    python3 build/pipeline.py --export-root ref/Sefaria-Export-Archive \
        --out dist/pack --reports reports \
        --stages tanakh,mishnah --talmud Berakhot,Shabbat \
        --policy open

``--policy open`` (the default, and what the shipped pack uses) keeps only
versions whose licence is Public Domain / CC0 / CC-BY / CC-BY-SA **and** whose
real language is English. ``--policy include-nc`` additionally keeps CC-BY-NC
for personal builds; ``unknown`` is never kept by either. See docs/LICENSING.md.
"""

from __future__ import annotations

import argparse
import csv
import glob
import io
import json
import os
import sys
import time
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sanitize_html import plain_text, sanitize_english  # noqa: E402
from scope import (  # noqa: E402
    DEFAULT_OVERRIDES,
    STAGE_ORDER,
    schema_of_section_names,
)
from sefaria_text import (  # noqa: E402
    flatten_text,
    flatten_text_with_paths,
    normalize_hebrew,
    rle_encode,
)

PACK_FORMAT_VERSION = 1

OPEN_LICENSES = {"public domain", "cc0", "cc-by", "cc-by-sa"}
NC_LICENSES = {"cc-by-nc"}

# Licence-family metadata is retained for internal provenance and maintainer
# reports; the reader UI does not display a source/licence browser.
LICENSE_FAMILY = {
    "public domain": "pd",
    "cc0": "pd",
    "cc-by": "by",
    "cc-by-sa": "by-sa",
    "cc-by-nc": "by-nc",
    "unknown": "unknown",
}


def allowed_licences(policy: str) -> set:
    if policy == "include-nc":
        return OPEN_LICENSES | NC_LICENSES
    return set(OPEN_LICENSES)


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def _load_json(path: str):
    with io.open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def discover_book_dirs(export_root: str, stages: List[str], only_titles: Optional[List[str]]) -> List[Tuple[str, str, str]]:
    """Return work directories under the selected roots, walking nested categories."""
    from scope import STAGE_GLOBS

    out: List[Tuple[str, str, str]] = []
    seen = set()
    for stage in stages:
        for root in STAGE_GLOBS.get(stage, []):
            start = os.path.join(export_root, root)
            if not os.path.isdir(start):
                continue
            for current, dirs, _files in os.walk(start):
                # English/Hebrew are data folders, never book/category roots.
                dirs[:] = sorted(d for d in dirs if d not in ("English", "Hebrew"))
                if not os.path.isdir(os.path.join(current, "English")):
                    continue
                rel = os.path.relpath(current, export_root)
                if rel in seen:
                    continue
                seen.add(rel)
                out.append((rel, current, stage))
    out.sort(key=lambda row: (STAGE_ORDER.index(row[2]), row[0].casefold()))
    if only_titles:
        want = {t.strip() for t in only_titles if t.strip()}
        out = [r for r in out if os.path.basename(r[1]) in want]
    return out


def load_versions(english_dir: str) -> List[dict]:
    """Every per-version file in an ``English/`` directory, merged excluded."""
    out = []
    for path in sorted(glob.glob(os.path.join(english_dir, "*.json"))):
        if os.path.basename(path) == "merged.json":
            continue
        try:
            data = _load_json(path)
        except Exception as exc:  # pragma: no cover - corrupt export entry
            sys.stderr.write(f"  ! skipping unreadable version {path}: {exc}\n")
            continue
        data["_file"] = os.path.basename(path)
        out.append(data)
    return out


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


def version_sort_key(v: dict) -> tuple:
    """Sefaria's merge order: explicit priority first, then completeness.

    Sefaria stores ``priority`` on versions that were ranked; versions without it
    behave as priority 0. Ties are broken by how much text a version actually
    carries, then by title, so the result is deterministic across runs.
    """
    prio = v.get("priority")
    try:
        prio = float(prio)
    except (TypeError, ValueError):
        prio = 0.0
    segs = sum(len(c) for c in flatten_text(v.get("text")))
    return (-prio, -segs, str(v.get("versionTitle") or v.get("_file") or ""))


def version_is_usable(v: dict, keep: set) -> Tuple[bool, str]:
    """Filter on real language and licence. Returns ``(ok, reason)``."""
    actual = (v.get("actualLanguage") or "en").lower()
    if actual not in ("en",):
        return False, f"language:{actual}"
    lic = str(v.get("license") or "unknown").strip()
    if lic.lower() not in keep:
        return False, f"license:{lic.lower()}"
    return True, ""


def merge_versions(versions: List[dict], shape: List[List[str]]) -> Tuple[List[List[Tuple[str, int]]], List[int]]:
    """Per-segment mosaic for the legacy two-dimensional helper API."""
    merged: List[List[Tuple[str, int]]] = [[("", -1) for _ in ch] for ch in shape]
    counts: Dict[int, int] = {}
    for vi in range(len(versions)):
        vtext = flatten_text(versions[vi].get("text"))
        for ci, chapter in enumerate(vtext):
            if ci >= len(merged):
                break
            for si, seg in enumerate(chapter):
                if si >= len(merged[ci]):
                    break
                if merged[ci][si][0] == "" and isinstance(seg, str) and seg.strip():
                    merged[ci][si] = (seg, vi)
                    counts[vi] = counts.get(vi, 0) + 1
    used = [vi for vi, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    return merged, used


def merge_versions_by_path(version_rows, shape_rows):
    """Merge versions by their nested Sefaria address, not flattened position.

    This keeps a commentator's text on the same verse/mishnah/halakhah when one
    version omits a comment that another version contains.
    """
    merged = [[(path, "", -1) for path, _text in row] for row in shape_rows]
    indexes = [{path: i for i, (path, _text) in enumerate(row)} for row in shape_rows]
    counts: Dict[int, int] = {}
    for version_index, rows in enumerate(version_rows):
        for unit_index, row in enumerate(rows[:len(merged)]):
            for path, text in row:
                target = indexes[unit_index].get(path)
                if target is None or not isinstance(text, str) or not text.strip():
                    continue
                old_path, old_text, _old_version = merged[unit_index][target]
                if not old_text:
                    merged[unit_index][target] = (old_path, text, version_index)
                    counts[version_index] = counts.get(version_index, 0) + 1
    used = [index for index, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]
    return merged, used


def schema_for_version(version: dict, rel: str) -> str:
    """Infer the reader address style, including Sefaria's complex schema exports."""
    section_names = version.get("sectionNames") or []
    if not section_names:
        schema_node = version.get("schema") or {}

        def find_section_names(node):
            if not isinstance(node, dict):
                return []
            names = node.get("sectionNames")
            if isinstance(names, list) and names:
                return names
            for child in node.get("nodes") or []:
                found = find_section_names(child)
                if found:
                    return found
            return []

        section_names = find_section_names(schema_node)
    if section_names:
        return schema_of_section_names(section_names, len(section_names))

    identity = " ".join(
        [str(rel or ""), str(version.get("title") or ""), str(version.get("heTitle") or "")]
        + [str(c) for c in (version.get("categories") or [])]
    ).casefold()
    if "mishnah berurah" in identity or "shulchan arukh" in identity or "seif" in identity:
        return "siman"
    if "mishneh torah" in identity or "משנה תורה" in identity:
        return "halakha"
    return "chapter"


# ---------------------------------------------------------------------------
# Per-book build
# ---------------------------------------------------------------------------


def build_book(rel: str, abs_dir: str, stage: str, keep: set, want_fidelity: bool) -> Optional[dict]:
    en_dir = os.path.join(abs_dir, "English")
    he_merged_path = os.path.join(abs_dir, "Hebrew", "merged.json")
    en_merged_path = os.path.join(en_dir, "merged.json")

    versions = load_versions(en_dir)
    if not versions:
        return None

    usable: List[dict] = []
    dropped: List[Tuple[dict, str]] = []
    for v in versions:
        ok, reason = version_is_usable(v, keep)
        if ok:
            usable.append(v)
        else:
            dropped.append((v, reason))
    if not usable:
        return None

    usable.sort(key=version_sort_key)

    # Use the most complete version as a shape template, retaining nested verse /
    # mishnah / halakhah / comment addresses so partial versions merge safely.
    version_rows = [flatten_text_with_paths(v.get("text")) for v in usable]
    shape_rows = max(version_rows, key=lambda rows: (len(rows), sum(len(row) for row in rows)))
    merged, used = merge_versions_by_path(version_rows, shape_rows)

    # Hebrew pack text is used for selection matching and as a quiet fallback
    # whenever the reader's own Hebrew cannot be aligned to the English entries.
    he_rows = []
    he_titles: List[str] = []
    if os.path.exists(he_merged_path):
        try:
            he = _load_json(he_merged_path)
            he_rows = [
                [(path, normalize_hebrew(text)) for path, text in row]
                for row in flatten_text_with_paths(he.get("text"))
            ]
            he_titles = [str(x[0]) for x in (he.get("versions") or []) if isinstance(x, list) and x]
        except Exception as exc:  # pragma: no cover
            sys.stderr.write(f"  ! {rel}: Hebrew merged unreadable: {exc}\n")

    # Merge fidelity: rebuild Sefaria's merge and compare it segment by segment
    # with the merged.json Sefaria ships. This is the check that our
    # understanding of Sefaria's merge logic is right, not assumed.
    #
    # FINDING (measured, not assumed): Sefaria's merge is LANGUAGE-SCOPED. A
    # work's `English/` directory holds files whose `actualLanguage` is de/fr/pt,
    # and some of them carry a high `priority`. Merging every file in the
    # directory makes Mishnah Berakhot come out in French while Sefaria's own
    # merged.json is English — 0% identical. Restricting to `actualLanguage`
    # en/absent reproduces merged.json exactly (see reports/merge-fidelity.md).
    fidelity = None
    if want_fidelity and os.path.exists(en_merged_path):
        try:
            ref = flatten_text(_load_json(en_merged_path).get("text"))
            all_versions = sorted(
                [v for v in versions if (v.get("actualLanguage") or "en").lower() == "en"],
                key=version_sort_key,
            )
            all_shapes = [flatten_text(v.get("text")) for v in all_versions]
            all_shape = max(all_shapes, key=lambda s: (len(s), sum(len(c) for c in s))) if all_shapes else []
            ours, _ = merge_versions(all_versions, all_shape)
            same = total = 0
            for ci, chapter in enumerate(ref):
                for si, seg in enumerate(chapter):
                    total += 1
                    if ci < len(ours) and si < len(ours[ci]):
                        if plain_text(sanitize_english(seg)[0]) == plain_text(
                            sanitize_english(ours[ci][si][0])[0]
                        ):
                            same += 1
            fidelity = {"segments": total, "identical": same}
        except Exception as exc:  # pragma: no cover
            sys.stderr.write(f"  ! {rel}: fidelity check failed: {exc}\n")

    sample = usable[0]
    section_names = sample.get("sectionNames") or []
    schema = schema_for_version(sample, rel)
    if not section_names and schema == "siman":
        section_names = ["Siman", "Seif"]
    elif not section_names and schema == "halakha":
        section_names = ["Chapter", "Halakhah"]

    units = []
    aligned_units = 0
    misaligned_units = 0
    total_segments = 0
    missing_segments = 0
    per_source_segments: Dict[int, int] = {}
    notes_total = 0

    for ci, chapter in enumerate(merged):
        if not chapter:
            continue
        eng: List[str] = []
        notes: List[List[str]] = []
        prov: List[int] = []
        heb: List[str] = []
        groups: List[int] = []
        he_row = he_rows[ci] if ci < len(he_rows) else []
        he_by_path = {path: text for path, text in he_row}
        for path, raw, vi in chapter:
            safe, seg_notes = sanitize_english(raw)
            eng.append(safe)
            notes.append(seg_notes)
            notes_total += len(seg_notes)
            prov.append(vi if vi >= 0 else -1)
            heb.append(he_by_path.get(path, ""))
            groups.append(path[0] if path else len(groups) + 1)
            if vi >= 0:
                per_source_segments[vi] = per_source_segments.get(vi, 0) + 1
            else:
                missing_segments += 1
        total_segments += len(eng)
        # Only claim exact 1:1 alignment when the same nested addresses exist and
        # neither the English nor Hebrew entry is blank.
        unit_aligned = (
            len(he_row) == len(chapter)
            and all(h for h in heb)
            and all(e for e in eng)
        )
        if unit_aligned:
            aligned_units += 1
        else:
            misaligned_units += 1
        unit = {
            "a": [ci + 1],
            "e": eng,
            "p": rle_encode(prov),
            "al": 1 if unit_aligned else 0,
        }
        if any(len(path) > 1 for path, _raw, _vi in chapter):
            unit["g"] = rle_encode(groups)
        if any(notes):
            unit["n"] = notes
        if unit_aligned:
            unit["h"] = heb
        units.append(unit)

    if not units:
        return None

    title = str(sample.get("title") or os.path.basename(abs_dir))
    he_title = str(sample.get("heTitle") or "")
    sources = []
    for vi in used:
        v = usable[vi]
        sources.append(
            {
                "versionIndex": vi,
                "title": str(v.get("versionTitle") or v.get("_file")),
                "license": str(v.get("license") or "unknown"),
                "licenseFamily": LICENSE_FAMILY.get(str(v.get("license") or "unknown").strip().lower(), "unknown"),
                "url": str(v.get("versionSource") or ""),
                "priority": v.get("priority"),
                "segments": per_source_segments.get(vi, 0),
            }
        )

    return {
        "rel": rel,
        "stage": stage,
        "title": title,
        "heTitle": he_title,
        "categories": list(sample.get("categories") or []),
        "sectionNames": list(section_names),
        "schema": schema,
        "units": units,
        "sources": sources,
        "heSources": he_titles,
        "stats": {
            "segments": total_segments,
            "missingSegments": missing_segments,
            "alignedUnits": aligned_units,
            "misalignedUnits": misaligned_units,
            "notes": notes_total,
            "versionsTotal": len(versions),
            "versionsUsable": len(usable),
            "versionsDropped": [{"title": str(v.get("versionTitle") or v.get("_file")),
                                 "license": str(v.get("license") or "unknown"),
                                 "reason": reason} for v, reason in dropped],
        },
        "fidelity": fidelity,
    }


# ---------------------------------------------------------------------------
# Title index
# ---------------------------------------------------------------------------

_GERESH = "\u05f3"
_GERSHAYIM = "\u05f4"


def normalize_title(title: str) -> str:
    """Normalise a Hebrew/Latin book title for lookup.

    Drops gershayim/geresh, quotes, the leading word ``משנה``/``מסכת`` (so
    ``משנה ברכות`` also answers to ``ברכות``) and collapses whitespace.
    """
    t = (title or "").strip().lower()
    for ch in (_GERSHAYIM, _GERESH, "'", '"', "\u2019", "\u2018", "\u00b4"):
        t = t.replace(ch, "")
    for ch in (",", ".", ":", ";", "\u060c", "\u061b"):
        t = t.replace(ch, " ")
    t = t.replace("\u05be", " ")
    parts = t.split()
    while parts:
        if parts[:2] == ["\u05de\u05e9\u05e0\u05d4", "\u05ea\u05d5\u05e8\u05d4"]:
            parts = parts[2:]
        elif parts[0] in ("\u05de\u05e9\u05e0\u05d4", "\u05de\u05e1\u05db\u05ea", "\u05e8\u05de\u05d1\u05dd"):
            parts = parts[1:]
        else:
            break
    return " ".join(parts).strip()


def build_title_index(books: List[dict], overrides: dict) -> Dict[str, object]:
    """Normalised title -> work key, or a list when the title is ambiguous.

    Otzaria calls Bavli Berakhot and Mishnah Berakhot both "ברכות", and
    normalising "משנה ברכות" produces the same key. Picking one silently would
    show the wrong book, so a collision is stored as a list and the runtime asks
    the user which one they mean. An explicit override resolves it instead.
    """
    buckets: Dict[str, List[str]] = {}

    def add(normalised: str, key: str) -> None:
        if not normalised:
            return
        bucket = buckets.setdefault(normalised, [])
        if key not in bucket:
            bucket.append(key)

    for b in books:
        key = b["title"]
        for raw in (b["heTitle"], b["title"]):
            add(normalize_title(raw), key)
        for alias in (overrides.get("aliases", {}) or {}).get(b["title"], []):
            add(normalize_title(alias), key)
    for otz_title, work in (overrides.get("byOtzariaTitle", {}) or {}).items():
        n = normalize_title(otz_title)
        if n:
            buckets[n] = [work]
    return {n: (v[0] if len(v) == 1 else v) for n, v in buckets.items()}


# Best-effort Hebrew rendering of Sefaria's category path, emitted as `catHe`.
# It is a HINT for disambiguation only — Otzaria's own Hebrew category names are
# not something this build can verify, so nothing ever decides on it alone.
CATEGORY_HE = {
    "Tanakh": "תנ״ך",
    "Torah": "תורה",
    "Prophets": "נביאים",
    "Writings": "כתובים",
    "Mishnah": "משנה",
    "Talmud": "תלמוד",
    "Halakhah": "הלכה",
    "Musar": "מוסר",
    "Commentary": "מפרשים",
    "Acharonim on Tanakh": "אחרונים על תנ״ך",
    "Rishonim on Tanakh": "ראשונים על תנ״ך",
    "Modern Commentary on Tanakh": "פרשנות מודרנית לתנ״ך",
    "Acharonim on Mishnah": "אחרונים על משנה",
    "Rishonim on Mishnah": "ראשונים על משנה",
    "Modern Commentary on Mishnah": "פרשנות מודרנית למשנה",
    "Mishneh Torah": "משנה תורה",
    "Shulchan Arukh": "שולחן ערוך",
    "Mishnah Berurah": "משנה ברורה",
    "Bavli": "בבלי",
    "Yerushalmi": "ירושלמי",
    "Seder Zeraim": "סדר זרעים",
    "Seder Moed": "סדר מועד",
    "Seder Nashim": "סדר נשים",
    "Seder Nezikin": "סדר נזיקין",
    "Seder Kodashim": "סדר קדשים",
    "Seder Tohorot": "סדר טהרות",
}


def categories_he(categories: List[str]) -> List[str]:
    return [CATEGORY_HE.get(c, c) for c in (categories or [])]



# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------


def _write_json(path: str, obj) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return len(text.encode("utf-8"))


def write_js_wrapper(path: str, expr: str, obj) -> int:
    """Write `<expr><json>);` as a classic script.

    `expr` opens a call (it ends in `(` or `,`), so the terminator MUST close it.
    This used to emit `;` without the `)`, which made every generated data file a
    JavaScript syntax error — the pipeline still exited 0, and the plugin simply
    had no data. Read the file back and assert the shape so it cannot regress.
    """
    body = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    text = expr + body + ");\n"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    with io.open(path, encoding="utf-8") as fh:
        check = fh.read()
    if not (check.startswith(expr) and check.rstrip().endswith(");")):
        raise AssertionError("emitted %s is not a closed call expression" % path)
    if len(check.rstrip("\n")) - len(expr) - 2 != len(body):
        raise AssertionError("emitted %s payload length mismatch" % path)
    return len(text.encode("utf-8"))


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024.0
    return f"{n:.1f} GB"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--export-root", required=True)
    ap.add_argument("--out", required=True, help="pack output directory")
    ap.add_argument("--plugin-data", default=None, help="where to write the <script> data files (default: <out>/../plugin/data)")
    ap.add_argument("--reports", default="reports")
    ap.add_argument("--stages", default=",".join(STAGE_ORDER), help="comma-separated export sections (default: all supported sections)")
    ap.add_argument("--talmud", default="", help="optional comma-separated Talmud work names to limit the talmud stage")
    ap.add_argument("--policy", choices=["open", "include-nc"], default="open")
    ap.add_argument("--overrides", default=None, help="JSON overrides file (default: build/otzaria_title_overrides.json)")
    ap.add_argument("--commit", default="unknown", help="Sefaria-Export commit hash to record")
    ap.add_argument("--commit-date", default="unknown")
    ap.add_argument("--no-fidelity", action="store_true")
    ap.add_argument("--no-plugin-scripts", action="store_true", help="write JSON pack files only (for external .otzenpack libraries)")
    ap.add_argument("--chunk-target-bytes", type=int, default=24 * 1024, help="soft cap per chunk file")
    args = ap.parse_args(argv)

    started = time.time()
    stages = [s.strip() for s in args.stages.split(",") if s.strip()]
    for s in stages:
        if s not in STAGE_ORDER:
            ap.error(f"unknown stage {s!r}")
    keep = allowed_licences(args.policy)

    overrides_path = args.overrides or os.path.join(os.path.dirname(os.path.abspath(__file__)), "otzaria_title_overrides.json")
    overrides = DEFAULT_OVERRIDES
    if os.path.exists(overrides_path):
        with io.open(overrides_path, "r", encoding="utf-8") as fh:
            loaded = json.load(fh)
        overrides = {**DEFAULT_OVERRIDES, **loaded}

    dirs = discover_book_dirs(args.export_root, stages, None)
    if "talmud" in stages and args.talmud:
        want = {t.strip() for t in args.talmud.split(",") if t.strip()}
        dirs = [d for d in dirs if d[2] != "talmud" or os.path.basename(d[1]) in want]

    sys.stderr.write(f"[pipeline] {len(dirs)} candidate book directories, policy={args.policy}\n")

    books: List[dict] = []
    skipped: List[dict] = []
    for rel, abs_dir, stage in dirs:
        built = build_book(rel, abs_dir, stage, keep, want_fidelity=not args.no_fidelity)
        if built is None:
            skipped.append({"rel": rel, "stage": stage, "reason": "no usable English version under this policy"})
            continue
        books.append(built)
        sys.stderr.write(f"  + {built['title']:28s} {built['stats']['segments']:6d} segs\n")

    if not books:
        sys.stderr.write("[pipeline] nothing to build\n")
        return 1

    # ---- global source table ------------------------------------------------
    source_key: Dict[tuple, int] = {}
    sources: List[dict] = []
    for b in books:
        remap: Dict[int, int] = {}
        for s in b["sources"]:
            key = (s["title"], s["license"], s["url"])
            if key not in source_key:
                source_key[key] = len(sources)
                sources.append(
                    {
                        "id": len(sources),
                        "title": s["title"],
                        "license": s["license"],
                        "licenseFamily": s["licenseFamily"],
                        "url": s["url"],
                        "priority": s["priority"],
                        "segments": 0,
                        "books": 0,
                    }
                )
            sid = source_key[key]
            sources[sid]["segments"] += s["segments"]
            sources[sid]["books"] += 1
            remap[s["versionIndex"]] = sid
        for u in b["units"]:
            u["p"] = [[c, remap.get(v, -1) if v >= 0 else -1] for c, v in u["p"]]
        b["sources"] = [remap[s["versionIndex"]] for s in b["sources"]]

    # ---- chunks -------------------------------------------------------------
    os.makedirs(args.out, exist_ok=True)
    chunks_dir = os.path.join(args.out, "chunks")
    os.makedirs(chunks_dir, exist_ok=True)
    plugin_data = None
    if not args.no_plugin_scripts:
        plugin_data = args.plugin_data or os.path.join(os.path.dirname(args.out.rstrip("/")), "plugin", "data")
        os.makedirs(plugin_data, exist_ok=True)
        for old in glob.glob(os.path.join(plugin_data, "chunk-*.js")):
            os.remove(old)

    book_entries: Dict[str, dict] = {}
    sizes = {"manifest": 0, "chunks": 0, "jsManifest": 0, "jsChunks": 0}
    for b in books:
        key = b["title"]
        safe = key.replace("/", "_").replace(" ", "_")
        chunk_payload = {"book": key, "units": b["units"]}
        sizes["chunks"] += _write_json(os.path.join(chunks_dir, safe + ".json"), chunk_payload)
        if plugin_data:
            sizes["jsChunks"] += write_js_wrapper(
                os.path.join(plugin_data, "chunk-" + safe + ".js"),
                "window.__OTZ_EN.chunk(%s," % json.dumps(safe),
                chunk_payload,
            )
        book_entries[key] = {
            "he": b["heTitle"],
            "cat": b["categories"],
            "catHe": categories_he(b["categories"]),
            "schema": b["schema"],
            "sec": b["sectionNames"],
            "stage": b["stage"],
            "n": b["stats"]["segments"],
            "src": b["sources"],
            "aligned": b["stats"]["alignedUnits"],
            "partial": b["stats"]["misalignedUnits"],
            "missing": b["stats"]["missingSegments"],
            "notes": b["stats"]["notes"],
            "heSrc": b["heSources"],
            "chunk": safe,
            "dir": b["rel"],
        }

    title_index = build_title_index(books, overrides)
    manifest = {
        "formatVersion": PACK_FORMAT_VERSION,
        "generator": "otsaplugin/build/pipeline.py",
        "policy": args.policy,
        "sefaria": {
            "commit": args.commit,
            "commitDate": args.commit_date,
            "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "exportLayout": "json/<categories>/<Book>/<Language>/<versionTitle>.json",
        },
        "stages": stages,
        "books": book_entries,
        "sources": sources,
        "titleIndex": title_index,
        "stats": {
            "books": len(books),
            "segments": sum(b["stats"]["segments"] for b in books),
            "missingSegments": sum(b["stats"]["missingSegments"] for b in books),
            "alignedUnits": sum(b["stats"]["alignedUnits"] for b in books),
            "partialUnits": sum(b["stats"]["misalignedUnits"] for b in books),
            "notes": sum(b["stats"]["notes"] for b in books),
            "skipped": len(skipped),
        },
    }
    sizes["manifest"] = _write_json(os.path.join(args.out, "manifest.json"), manifest)
    if plugin_data:
        sizes["jsManifest"] = write_js_wrapper(
            os.path.join(plugin_data, "manifest.js"), "window.__OTZ_EN.manifest(", manifest
        )

    write_reports(args.reports, manifest, books, skipped, sizes, args, time.time() - started)
    sys.stderr.write(
        f"[pipeline] {len(books)} books, {manifest['stats']['segments']} segments, "
        f"{human(sizes['manifest'] + sizes['chunks'])} JSON in {time.time()-started:.1f}s\n"
    )
    return 0


def write_reports(reports_dir, manifest, books, skipped, sizes, args, elapsed) -> None:
    os.makedirs(reports_dir, exist_ok=True)

    # --- source / licence table ---------------------------------------------
    rows = sorted(
        manifest["sources"], key=lambda s: (s["licenseFamily"], -s["segments"])
    )
    with io.open(os.path.join(reports_dir, "licenses.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "versionTitle", "license", "licenseFamily", "segments", "books", "sourceUrl"])
        for s in rows:
            w.writerow([s["id"], s["title"], s["license"], s["licenseFamily"], s["segments"], s["books"], s["url"]])
    _write_json(os.path.join(reports_dir, "licenses.json"), rows)
    with io.open(os.path.join(reports_dir, "licenses.md"), "w", encoding="utf-8") as fh:
        fh.write("# Source versions in the shipped pack\n\n")
        fh.write(f"Policy: `{args.policy}` · Sefaria-Export commit `{manifest['sefaria']['commit']}` · built {manifest['sefaria']['builtAt']}\n\n")
        fh.write("| Version | Licence | Family | Segments | Books | Source |\n|---|---|---|---|---|---|\n")
        for s in rows:
            fh.write(f"| {s['title']} | {s['license']} | {s['licenseFamily']} | {s['segments']} | {s['books']} | {s['url'] or '—'} |\n")
        fam: Dict[str, int] = {}
        for s in rows:
            fam[s["licenseFamily"]] = fam.get(s["licenseFamily"], 0) + s["segments"]
        fh.write("\n## Segments per licence family\n\n| Family | Segments |\n|---|---|\n")
        for k in sorted(fam):
            fh.write(f"| {k} | {fam[k]} |\n")

    # --- coverage -----------------------------------------------------------
    with io.open(os.path.join(reports_dir, "coverage.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["stage", "sefariaTitle", "hebrewTitle", "schema", "segments", "missingSegments",
                    "alignedUnits", "partialUnits", "versionsUsable", "versionsTotal", "inTitleIndex",
                    "ambiguousWith"])
        idx = set()
        ambiguous: Dict[str, List[str]] = {}
        for name, val in manifest["titleIndex"].items():
            if isinstance(val, list):
                idx.update(val)
                ambiguous[name] = val
            else:
                idx.add(val)
        for b in sorted(books, key=lambda x: (x["stage"], x["title"])):
            # Works that share a normalised title with another work. The runtime
            # asks the user which one is meant instead of choosing.
            clash = ""
            for name, works in ambiguous.items():
                if b["title"] in works:
                    clash = name + " => " + "/".join(w for w in works if w != b["title"])
                    break
            w.writerow([b["stage"], b["title"], b["heTitle"], b["schema"], b["stats"]["segments"],
                        b["stats"]["missingSegments"], b["stats"]["alignedUnits"], b["stats"]["misalignedUnits"],
                        b["stats"]["versionsUsable"], b["stats"]["versionsTotal"], b["title"] in idx,
                        clash])
    with io.open(os.path.join(reports_dir, "coverage.md"), "w", encoding="utf-8") as fh:
        fh.write("# Mapping coverage: Sefaria works in the pack\n\n")
        fh.write("This is the *pack* side of the mapping. The Otzaria side is resolved at\n"
                 "runtime from `library.getTree`; see `docs/MAPPING.md`.\n\n")
        by_stage: Dict[str, List[dict]] = {}
        for b in books:
            by_stage.setdefault(b["stage"], []).append(b)
        for stage in sorted(by_stage):
            lst = by_stage[stage]
            fh.write(f"## {stage} — {len(lst)} works, {sum(b['stats']['segments'] for b in lst)} segments\n\n")
            fh.write("| Sefaria title | Hebrew | Schema | Segments | Missing | Units aligned | Units partial |\n|---|---|---|---|---|---|---|\n")
            for b in sorted(lst, key=lambda x: x["title"]):
                s = b["stats"]
                fh.write(f"| {b['title']} | {b['heTitle']} | {b['schema']} | {s['segments']} | "
                         f"{s['missingSegments']} | {s['alignedUnits']} | {s['misalignedUnits']} |\n")
            fh.write("\n")
        if ambiguous:
            fh.write("## Ambiguous Otzaria titles\n\n")
            fh.write(
                "These normalised titles match more than one work in the pack. Otzaria calls\n"
                "Bavli Berakhot and Mishnah Berakhot by the same name, and normalising\n"
                "`משנה ברכות` produces the same key again. The plugin therefore **asks** which\n"
                "book is meant rather than picking one — showing the wrong book's translation\n"
                "is exactly the failure this project must not have.\n\n"
            )
            fh.write("| Normalised title | Works it could mean |\n|---|---|\n")
            for name in sorted(ambiguous):
                fh.write(f"| {name} | {' / '.join(ambiguous[name])} |\n")
            fh.write("\n")
        if skipped:
            fh.write("## Works skipped (no usable English version under this policy)\n\n")
            for s in skipped:
                fh.write(f"- `{s['rel']}` ({s['stage']}) — {s['reason']}\n")
        dropped: List[dict] = []
        for b in books:
            for d in b["stats"]["versionsDropped"]:
                dropped.append({"book": b["title"], **d})
        if dropped:
            fh.write("\n## Versions excluded by the policy\n\n| Book | Version | Licence | Reason |\n|---|---|---|---|\n")
            for d in dropped:
                fh.write(f"| {d['book']} | {d['title']} | {d['license']} | {d['reason']} |\n")

    # --- merge fidelity -----------------------------------------------------
    fid = [b for b in books if b.get("fidelity")]
    with io.open(os.path.join(reports_dir, "merge-fidelity.md"), "w", encoding="utf-8") as fh:
        fh.write("# Merge fidelity: our rebuild vs Sefaria's own `merged.json`\n\n")
        fh.write("For every work we re-run Sefaria's merge and compare the result, segment by\n"
                 "segment, with the `merged.json` Sefaria ships. An exact match is the evidence\n"
                 "that the priority mosaic in `build/pipeline.py` is the same algorithm Sefaria\n"
                 "uses, rather than a plausible guess at it.\n\n"
                 "**How the merge is modelled.** Versions are ordered by `priority` descending\n"
                 "(absent = 0), ties broken by segment count then title; per segment the first\n"
                 "non-empty value wins. Only versions whose `actualLanguage` is English take\n"
                 "part, and no licence filter is applied — Sefaria builds `merged.json`\n"
                 "regardless of licence.\n\n"
                 "**Why the language filter matters (measured).** A work's `English/` directory\n"
                 "also holds German, French and Portuguese files, and some of them carry a high\n"
                 "`priority`. Merging every file in the directory makes Mishnah Berakhot come out\n"
                 "*in French* while Sefaria's `merged.json` is English: 0/57 segments identical.\n"
                 "Every other work happens to have no such collision, which is why the naive\n"
                 "version of this check looked fine at ~99.8% overall. Restricting to\n"
                 "`actualLanguage` en/absent reproduces `merged.json` exactly. Sefaria's merge is\n"
                 "language-scoped; this build now models it that way.\n\n")
        if not fid:
            fh.write("_No fidelity data (run without `--no-fidelity`)._\n")
        else:
            tot = sum(b["fidelity"]["segments"] for b in fid)
            same = sum(b["fidelity"]["identical"] for b in fid)
            fh.write(f"**Overall: {same}/{tot} segments identical ({100.0*same/max(tot,1):.2f}%).**\n\n")
            fh.write("| Work | Segments | Identical | % |\n|---|---|---|---|\n")
            for b in sorted(fid, key=lambda x: x["title"]):
                f = b["fidelity"]
                pct = 100.0 * f["identical"] / max(f["segments"], 1)
                fh.write(f"| {b['title']} | {f['segments']} | {f['identical']} | {pct:.2f} |\n")

    # --- size ---------------------------------------------------------------
    total = sizes["manifest"] + sizes["chunks"]
    with io.open(os.path.join(reports_dir, "size-report.md"), "w", encoding="utf-8") as fh:
        fh.write("# Pack size\n\n")
        fh.write("| Part | Bytes |\n|---|---|\n")
        fh.write(f"| manifest.json | {sizes['manifest']} ({human(sizes['manifest'])}) |\n")
        fh.write(f"| chunks/*.json (all) | {sizes['chunks']} ({human(sizes['chunks'])}) |\n")
        fh.write(f"| **total JSON** | **{total} ({human(total)})** |\n")
        fh.write(f"| manifest.js (script wrapper) | {sizes['jsManifest']} ({human(sizes['jsManifest'])}) |\n")
        fh.write(f"| chunk-*.js (script wrappers) | {sizes['jsChunks']} ({human(sizes['jsChunks'])}) |\n")
        fh.write("\nPer-work chunk sizes:\n\n| Work | Segments |\n|---|---|\n")
        for b in sorted(books, key=lambda x: -x["stats"]["segments"])[:25]:
            fh.write(f"| {b['title']} | {b['stats']['segments']} |\n")
    _write_json(os.path.join(reports_dir, "size-report.json"), {
        "sizes": sizes, "totalJson": total, "elapsedSeconds": round(elapsed, 2),
        "policy": args.policy, "books": len(books),
    })


if __name__ == "__main__":
    raise SystemExit(main())
