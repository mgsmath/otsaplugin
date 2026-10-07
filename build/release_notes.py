#!/usr/bin/env python3
"""Write the release notes for a built pack.

Everything in the notes is read back out of the build that just ran — the pack
manifest, the size report and the ``.otzplugin`` itself — rather than restated
from the README, so the numbers on a release always describe that release.

    python3 build/release_notes.py --version 0.0.1 --tag v0.0.1 \\
        --commit <sha> --headline "Merged #12 — Fix peek window" \\
        --pack dist/pack/manifest.json --plugin dist/otsaplugin.otzplugin \\
        --reports reports/size-report.json --append /tmp/generated-notes.md \\
        --out dist/RELEASE-NOTES.md

``--append`` is for notes GitHub generated itself (the changelog since the last
tag); they go after the build facts. Stdlib only, like the rest of ``build/``.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import zipfile
from typing import Optional


def _load_json(path: str) -> Optional[dict]:
    if not path or not os.path.exists(path):
        return None
    try:
        with io.open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        sys.stderr.write(f"[notes] warning: cannot read {path}: {exc}\n")
        return None


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1000 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1000.0
    return f"{n:.1f} GB"


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def pack_facts(plugin_path: str) -> dict:
    """Entry count and sizes straight from the ``.otzplugin`` zip."""
    facts = {"entries": None, "compressed": None, "expanded": None}
    if not os.path.exists(plugin_path):
        return facts
    facts["compressed"] = os.path.getsize(plugin_path)
    try:
        with zipfile.ZipFile(plugin_path) as zf:
            infos = zf.infolist()
            facts["entries"] = len(infos)
            facts["expanded"] = sum(i.file_size for i in infos)
    except zipfile.BadZipFile as exc:
        sys.stderr.write(f"[notes] warning: {plugin_path} is not a readable zip: {exc}\n")
    return facts


def build_notes(args) -> str:
    pack = _load_json(args.pack) or {}
    sizes = _load_json(args.reports) or {}
    sefaria = pack.get("sefaria") or {}
    stats = pack.get("stats") or {}
    facts = pack_facts(args.plugin)

    version = args.version
    tag = args.tag or f"v{version}"
    out: list[str] = []
    out.append(f"### {args.headline}" if args.headline else f"### {tag}")
    out.append("")
    out.append(
        f"Install: download **`{os.path.basename(args.plugin_name or args.plugin)}`** below, "
        "then in Otzaria open **Settings → Plugins → install from file**."
    )
    out.append("")
    out.append("#### This build")
    out.append("")
    out.append("| | |")
    out.append("|---|---|")
    out.append(f"| Plugin version | `{version}` |")
    if args.commit:
        out.append(f"| Built from | `{args.commit[:12]}` |")
    if sefaria.get("commit"):
        date = sefaria.get("commitDate")
        when = f" ({date})" if date and date != "unknown" else ""
        out.append(f"| Sefaria-Export-Archive | `{str(sefaria['commit'])[:12]}`{when} |")
    if pack.get("policy"):
        out.append(f"| Licence policy | `{pack['policy']}` |")
    if stats.get("books") is not None:
        segs = stats.get("segments")
        out.append(f"| Works / segments | {stats['books']} / {segs:,} |" if isinstance(segs, int)
                   else f"| Works | {stats['books']} |")
    if stats.get("alignedUnits") is not None and stats.get("partialUnits") is not None:
        out.append(f"| Hebrew alignment | {stats['alignedUnits']} units exact, "
                   f"{stats['partialUnits']} flagged approximate |")
    if stats.get("skipped"):
        out.append(f"| Works skipped by the policy | {stats['skipped']} |")
    if facts["entries"] is not None:
        out.append(f"| `.otzplugin` | {facts['entries']} entries, "
                   f"{human(facts['expanded'])} → {human(facts['compressed'])} |")
    total_json = sizes.get("totalJson")
    if isinstance(total_json, (int, float)):
        out.append(f"| Generated JSON | {human(total_json)} |")
    if args.validator:
        out.append(f"| Otzaria validator | {args.validator} |")
    if os.path.exists(args.plugin):
        out.append(f"| SHA-256 | `{sha256(args.plugin)}` |")
    out.append("")
    out.append("#### Assets")
    out.append("")
    out.append(f"- `{os.path.basename(args.plugin_name or args.plugin)}` — the installable plugin.")
    if args.reports_asset:
        out.append(f"- `{args.reports_asset}` — coverage, licences, merge fidelity and sizes, "
                   "regenerated from the pinned export by this build.")
    if args.datapack_asset:
        out.append(f"- `{args.datapack_asset}` — the generated data pack (`manifest.json` plus the "
                   "per-work chunk JSON) the plugin ships inside `data/`.")
    if args.checksums_asset:
        out.append(f"- `{args.checksums_asset}` — SHA-256 of every asset above.")
    out.append("- *Source code (zip / tar.gz)* — this repository at the release tag, added by GitHub.")
    out.append("")
    out.append("Built automatically by `.github/workflows/release.yml`; the golden test suite is "
               "not part of the release job (run `./build/build_all.sh` locally for it).")

    if args.append:
        extra = None
        if os.path.exists(args.append):
            with io.open(args.append, "r", encoding="utf-8") as fh:
                extra = fh.read().strip()
        if extra:
            # GitHub's generated notes open with their own "## What's Changed"
            # heading; ours is already there, so drop any leading heading.
            lines = extra.splitlines()
            while lines and (not lines[0].strip() or lines[0].lstrip().startswith("#")):
                lines.pop(0)
            extra = "\n".join(lines).strip()
        if extra:
            out.append("")
            out.append("#### What changed")
            out.append("")
            out.append(extra)

    return "\n".join(out).rstrip("\n") + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--version", required=True, help="release version, e.g. 0.0.1")
    ap.add_argument("--tag", default=None, help="release tag (default v<version>)")
    ap.add_argument("--commit", default="", help="commit the release was built from")
    ap.add_argument("--headline", default="", help="first line, e.g. 'Merged #12 — …'")
    ap.add_argument("--pack", default=os.path.join("dist", "pack", "manifest.json"))
    ap.add_argument("--plugin", default=os.path.join("dist", "otsaplugin.otzplugin"))
    ap.add_argument("--plugin-name", default=None,
                    help="asset name to show readers (default: the --plugin filename)")
    ap.add_argument("--reports", default=os.path.join("reports", "size-report.json"))
    ap.add_argument("--reports-asset", default=None)
    ap.add_argument("--datapack-asset", default=None)
    ap.add_argument("--checksums-asset", default=None)
    ap.add_argument("--validator", default="", help="one-line validator result")
    ap.add_argument("--append", default=None, help="file of generated changelog notes to append")
    ap.add_argument("--out", default="-", help="where to write ('-' for stdout)")
    args = ap.parse_args(argv)

    text = build_notes(args)
    if args.out == "-":
        sys.stdout.write(text)
    else:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with io.open(args.out, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        print(f"[notes] wrote {args.out} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
