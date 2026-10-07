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


def case_discover_nested(args):
    import tempfile

    paths = [
        "json/Tanakh/Rishonim on Tanakh/Rashi/Torah/Rashi on Genesis",
        "json/Mishnah/Rishonim on Mishnah/Rambam/Seder Zeraim/Rambam on Mishnah Berakhot",
        "json/Talmud/Yerushalmi/Seder Moed/Jerusalem Talmud Shabbat",
        "json/Halakhah/Mishneh Torah/Sefer Madda/Mishneh Torah, Repentance",
        "json/Halakhah/Shulchan Arukh/Commentary/Mishnah Berurah/Mishnah Berurah",
        "json/Musar/Acharonim/Mesillat Yesharim",
    ]
    with tempfile.TemporaryDirectory() as root:
        for rel in paths:
            os.makedirs(os.path.join(root, rel, "English"), exist_ok=True)
        found = pipeline.discover_book_dirs(root, scope.STAGE_ORDER, None)
        return [{"dir": rel, "stage": stage} for rel, _path, stage in found]


def case_flatten_paths(args):
    return [
        [[list(path), text] for path, text in row]
        for row in sefaria_text.flatten_text_with_paths(args["text"])
    ]


def case_nested_book_build(args):
    import tempfile

    def write_json(path, payload):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)

    with tempfile.TemporaryDirectory() as root:
        commentary_rel = "json/Tanakh/Rishonim on Tanakh/Rashi/Torah/Rashi on Genesis"
        commentary_dir = os.path.join(root, commentary_rel)
        commentary_en = {
            "title": "Rashi on Genesis",
            "heTitle": "רש\u05f4י על בראשית",
            "categories": ["Tanakh", "Rishonim on Tanakh", "Rashi", "Torah"],
            "sectionNames": ["Chapter", "Verse", "Comment"],
            "versionTitle": "Test commentary translation",
            "versionSource": "https://example.org/test",
            "actualLanguage": "en",
            "license": "CC0",
            "text": [[[
                "Comment one on verse one.",
                "Comment two on verse one.",
            ], ["Comment one on verse two."]]],
        }
        commentary_he = [[[
            "בראשית", "ברא",
        ], ["אלהים"]]]
        commentary_sparse = dict(commentary_en)
        commentary_sparse.update(
            {
                "versionTitle": "Higher priority sparse translation",
                "priority": 1,
                "text": [[
                    ["Preferred comment on verse one."],
                    ["Preferred comment on verse two."],
                ]],
            }
        )
        commentary_fallback = dict(commentary_en)
        commentary_fallback.update(
            {
                "versionTitle": "Complete fallback translation",
                "priority": 0,
                "text": [[
                    ["Fallback comment one on verse one.", "Fallback comment two on verse one."],
                    ["Fallback comment on verse two."],
                ]],
            }
        )
        write_json(os.path.join(commentary_dir, "English", "Test.json"), commentary_sparse)
        write_json(os.path.join(commentary_dir, "English", "Fallback.json"), commentary_fallback)
        write_json(os.path.join(commentary_dir, "Hebrew", "merged.json"), {"text": commentary_he})
        commentary = pipeline.build_book(
            commentary_rel, commentary_dir, "tanakh", pipeline.allowed_licences("open"), False
        )

        berurah_rel = "json/Halakhah/Shulchan Arukh/Commentary/Mishnah Berurah/Mishnah Berurah"
        berurah_dir = os.path.join(root, berurah_rel)
        berurah_text = {
            "Introduction": [],
            "": [["Paragraph one.", "Paragraph two."], ["Paragraph three."]],
        }
        berurah_en = {
            "title": "Mishnah Berurah",
            "heTitle": "משנה ברורה",
            "categories": ["Halakhah", "Shulchan Arukh", "Commentary", "Mishnah Berurah"],
            "schema": {"key": "Mishnah Berurah", "nodes": [{"enTitle": ""}]},
            "versionTitle": "Test Mishnah Berurah translation",
            "versionSource": "https://example.org/test",
            "actualLanguage": "en",
            "license": "CC0",
            "text": berurah_text,
        }
        berurah_he = {"text": {"Introduction": [], "": [["הלכה אחת", "הלכה שתיים"], ["הלכה שלוש"]]}}
        write_json(os.path.join(berurah_dir, "English", "Test.json"), berurah_en)
        write_json(os.path.join(berurah_dir, "Hebrew", "merged.json"), berurah_he)
        berurah = pipeline.build_book(
            berurah_rel, berurah_dir, "halakhah", pipeline.allowed_licences("open"), False
        )

        rambam_rel = "json/Halakhah/Mishneh Torah/Sefer Madda/Mishneh Torah, Repentance"
        rambam_dir = os.path.join(root, rambam_rel)
        rambam_en = {
            "title": "Mishneh Torah, Repentance",
            "heTitle": "משנה תורה הלכות תשובה",
            "categories": ["Halakhah", "Mishneh Torah", "Sefer Madda"],
            "versionTitle": "Test Rambam translation",
            "actualLanguage": "en",
            "license": "CC0",
            "text": [["Chapter one, halakhah one.", "Chapter one, halakhah two."]],
        }
        write_json(os.path.join(rambam_dir, "English", "Test.json"), rambam_en)
        write_json(
            os.path.join(rambam_dir, "Hebrew", "merged.json"),
            {"text": [["הלכה ראשונה", "הלכה שנייה"]]},
        )
        rambam = pipeline.build_book(
            rambam_rel, rambam_dir, "halakhah", pipeline.allowed_licences("open"), False
        )
        return {
            "commentary": commentary,
            "berurah": berurah,
            "rambam": rambam,
        }


def case_pipeline_smoke(args):
    import tempfile

    def write_json(path, payload):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)

    def add_work(root, rel, title, he_title, categories, section_names, english_text, hebrew_text):
        work = os.path.join(root, rel)
        version = {
            "title": title,
            "heTitle": he_title,
            "categories": categories,
            "sectionNames": section_names,
            "versionTitle": "Smoke test translation",
            "versionSource": "https://example.org/smoke",
            "actualLanguage": "en",
            "license": "CC0",
            "text": english_text,
        }
        write_json(os.path.join(work, "English", "Smoke.json"), version)
        write_json(os.path.join(work, "Hebrew", "merged.json"), {"text": hebrew_text})

    with tempfile.TemporaryDirectory() as root:
        export = os.path.join(root, "export")
        add_work(export, "json/Tanakh/Torah/Genesis", "Genesis", "בראשית", ["Tanakh", "Torah"],
                 ["Chapter", "Verse"], [["In the beginning."]], [["בראשית ברא"]])
        add_work(export, "json/Tanakh/Rishonim on Tanakh/Rashi/Torah/Rashi on Genesis",
                 "Rashi on Genesis", "רש\u05f4י על בראשית", ["Tanakh", "Rishonim on Tanakh", "Rashi"],
                 ["Chapter", "Verse", "Comment"], [[["A comment."]]], [[["בראשית ברא"]]])
        add_work(export, "json/Mishnah/Seder Zeraim/Mishnah Berakhot", "Mishnah Berakhot", "משנה ברכות",
                 ["Mishnah", "Seder Zeraim"], ["Chapter", "Mishnah"], [["A mishnah."]], [["משנה"]])
        add_work(export, "json/Talmud/Bavli/Seder Zeraim/Berakhot", "Berakhot", "ברכות",
                 ["Talmud", "Bavli", "Seder Zeraim"], ["Daf", "Line"], [["A daf line."]], [["גמרא"]])
        add_work(export, "json/Halakhah/Mishneh Torah/Sefer Madda/Mishneh Torah, Repentance",
                 "Mishneh Torah, Repentance", "משנה תורה הלכות תשובה", ["Halakhah", "Mishneh Torah"],
                 ["Chapter", "Halakhah"], [["A halakhah."]], [["הלכה"]])
        add_work(export, "json/Musar/Acharonim/Mesillat Yesharim", "Mesillat Yesharim", "מסילת ישרים",
                 ["Musar", "Acharonim"], ["Chapter"], [["A musar passage."]], [["מוסר"]])

        out = os.path.join(root, "pack")
        plugin_data = os.path.join(root, "plugin-data")
        reports = os.path.join(root, "reports")
        status = pipeline.main([
            "--export-root", export,
            "--out", out,
            "--plugin-data", plugin_data,
            "--reports", reports,
            "--stages", ",".join(scope.STAGE_ORDER),
            "--policy", "open",
            "--no-fidelity",
        ])
        with open(os.path.join(out, "manifest.json"), encoding="utf-8") as fh:
            manifest = json.load(fh)
        with open(os.path.join(out, "chunks", "Rashi_on_Genesis.json"), encoding="utf-8") as fh:
            rashi_chunk = json.load(fh)
        manifest_script = open(os.path.join(plugin_data, "manifest.js"), encoding="utf-8").read()
        return {
            "status": status,
            "stages": manifest["stages"],
            "books": sorted(manifest["books"]),
            "bookCount": manifest["stats"]["books"],
            "rashiGroups": rashi_chunk["units"][0].get("g"),
            "manifestScriptValid": manifest_script.startswith("window.__OTZ_EN.manifest(") and manifest_script.rstrip().endswith(");"),
            "reportsWritten": os.path.isfile(os.path.join(reports, "coverage.md")),
        }


def case_otzenpack(args):
    import base64
    import tempfile
    from build.make_otzenpack import build_otzenpack

    def write_json(path, payload):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)

    with tempfile.TemporaryDirectory() as root:
        pack_dir = os.path.join(root, "pack")
        chunks_dir = os.path.join(pack_dir, "chunks")
        os.makedirs(chunks_dir)
        manifest = {"formatVersion": 1, "books": {"Test": {"chunk": "Test"}}}
        chunk = {"book": "Test", "units": [{"a": [1], "e": ["A test."]}]}
        write_json(os.path.join(pack_dir, "manifest.json"), manifest)
        write_json(os.path.join(chunks_dir, "Test.json"), chunk)
        output = os.path.join(root, "test.otzenpack")
        size, count = build_otzenpack(pack_dir, output)
        with open(output, "rb") as fh:
            payload = fh.read()
        footer_len = int(payload[-12:].decode("ascii"))
        index_start = size - 12 - footer_len
        index = json.loads(payload[index_start:size - 12].decode("utf-8"))

        def read_entry(entry):
            start = entry["offset"]
            end = start + entry["length"]
            return json.loads(payload[start:end].decode("utf-8"))

        return {
            "size": size,
            "chunks": count,
            "footerLength": footer_len,
            "payloadBase64": base64.b64encode(payload).decode("ascii"),
            "index": index,
            "manifest": read_entry(index["manifest"]),
            "chunk": read_entry(index["chunks"]["Test"]),
        }


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
    "discover_nested": case_discover_nested,
    "flatten_paths": case_flatten_paths,
    "nested_book_build": case_nested_book_build,
    "pipeline_smoke": case_pipeline_smoke,
    "otzenpack": case_otzenpack,
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
