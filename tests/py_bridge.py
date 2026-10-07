#!/usr/bin/env python3
"""Answer test cases from the Node suite by importing the real build modules.

Usage:
    python3 tests/py_bridge.py <case> [json-args]

Every case imports `build.*` directly — the tests exercise the shipped pipeline
code, not a re-implementation.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from build import pipeline, sanitize_html, scope, sefaria_text  # noqa: E402


def case_rle(args):
    out = []
    for values in args["cases"]:
        enc = sefaria_text.rle_encode(values)
        out.append({"values": values, "encoded": enc, "decoded": sefaria_text.rle_decode(enc)})
    return out


def case_daf(args):
    out = []
    for section in args["sections"]:
        label = sefaria_text.daf_from_section(section)
        out.append(
            {
                "section": section,
                "label": label,
                "roundTrip": sefaria_text.daf_to_section(label),
            }
        )
    for label in args.get("labels", []):
        out.append({"label": label, "section": sefaria_text.daf_to_section(label)})
    return out


def case_hebrew_numeral(args):
    return [
        {"input": s, "value": sefaria_text.hebrew_numeral_to_int(s)} for s in args["cases"]
    ]


def case_normalize_hebrew(args):
    return [{"input": s, "value": sefaria_text.normalize_hebrew(s)} for s in args["cases"]]


def case_sanitize(args):
    out = []
    for raw in args["cases"]:
        text, notes = sanitize_html.sanitize_english(raw)
        out.append({"input": raw, "text": text, "notes": notes, "plain": sanitize_html.plain_text(text)})
    return out


def case_licence(args):
    out = []
    for policy, version in args["cases"]:
        keep = pipeline.allowed_licences(policy)
        ok, reason = pipeline.version_is_usable(version, keep)
        out.append({"policy": policy, "version": version, "ok": ok, "reason": reason})
    return out


def case_sort_key(args):
    versions = args["versions"]
    ordered = sorted(versions, key=pipeline.version_sort_key)
    return {"order": [v.get("versionTitle") for v in ordered]}


def case_normalize_title(args):
    return [{"input": s, "value": pipeline.normalize_title(s)} for s in args["cases"]]


def case_schema(args):
    return [
        {
            "sectionNames": names,
            "depth": depth,
            "schema": scope.schema_of_section_names(names, depth),
        }
        for names, depth in args["cases"]
    ]


def case_stage(args):
    return [{"dir": d, "stage": scope.stage_of_book_dir(d)} for d in args["cases"]]


def case_merge_fidelity(args):
    """Re-derive Sefaria's merge and compare against its own merged.json.

    Mirrors build_book: priority mosaic over the versions whose `actualLanguage`
    is English, no licence filter (Sefaria's merged.json is built regardless of
    licence). Sefaria's merge is language-scoped — including the de/fr/pt files
    that also live under `English/` makes the rebuild come out in the wrong
    language entirely.
    """
    results = []
    for rel in args["dirs"]:
        eng = os.path.join(args["exportRoot"], rel, "English")
        if not os.path.isdir(eng):
            results.append({"dir": rel, "error": "missing English dir"})
            continue
        all_versions = pipeline.load_versions(eng)
        if not all_versions:
            results.append({"dir": rel, "error": "no versions"})
            continue
        versions = sorted(
            [v for v in all_versions if (v.get("actualLanguage") or "en").lower() == "en"],
            key=pipeline.version_sort_key,
        )
        if not versions:
            results.append({"dir": rel, "error": "no english versions"})
            continue
        shapes = [sefaria_text.flatten_text(v.get("text")) for v in versions]
        shape = max(shapes, key=lambda s: (len(s), sum(len(c) for c in s)))
        ours, _ = pipeline.merge_versions(versions, shape)

        merged_path = os.path.join(eng, "merged.json")
        with open(merged_path, encoding="utf-8") as fh:
            theirs = sefaria_text.flatten_text(json.load(fh).get("text"))

        same = total = 0
        for ci, row in enumerate(ours):
            theirs_row = theirs[ci] if ci < len(theirs) else []
            for si, (seg, _idx) in enumerate(row):
                want = theirs_row[si] if si < len(theirs_row) else ""
                total += 1
                if seg == want:
                    same += 1
        results.append(
            {
                "dir": rel,
                "identical": same,
                "total": total,
                "versions": len(versions),
                "firstChoice": versions[0].get("versionTitle"),
            }
        )
    return results


CASES = {
    "rle": case_rle,
    "daf": case_daf,
    "hebrew_numeral": case_hebrew_numeral,
    "normalize_hebrew": case_normalize_hebrew,
    "sanitize": case_sanitize,
    "licence": case_licence,
    "sort_key": case_sort_key,
    "normalize_title": case_normalize_title,
    "schema": case_schema,
    "stage": case_stage,
    "merge_fidelity": case_merge_fidelity,
}


def main(argv) -> int:
    if len(argv) < 2 or argv[1] not in CASES:
        sys.stderr.write("unknown case: %s\nknown: %s\n" % (argv[1] if len(argv) > 1 else "?", ", ".join(sorted(CASES))))
        return 2
    args = json.loads(argv[2]) if len(argv) > 2 else {}
    result = CASES[argv[1]](args)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
