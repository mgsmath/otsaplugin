#!/usr/bin/env python3
"""Write the release notes for a built pack.

Everything in the notes is read back out of the build that just ran — the two
pack manifests, the size reports and the artifacts themselves — rather than
restated from the README, so the numbers on a release always describe that
release.

    python3 build/release_notes.py --version 1.1.0 --tag v1.1.0 --commit <sha> \\
        --headline "Merged #12 — Fix the peek window" \\
        --pack dist/pack/manifest.json --extended-pack dist/extended-pack/manifest.json \\
        --plugin dist/release/otsaplugin-v1.1.0.otzplugin \\
        --otzenpack dist/otsaplugin-extended.otzenpack \\
        --append /tmp/generated-notes.md --out dist/RELEASE-NOTES.md

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


def _load_json(path: Optional[str]) -> Optional[dict]:
    if not path or not os.path.exists(path):
        return None
    try:
        with io.open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        sys.stderr.write(f"[notes] warning: cannot read {path}: {exc}\n")
        return None


def human(n: Optional[float]) -> str:
    if n is None:
        return "unknown"
    n = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1000 or unit == "GB":
            return f"{int(n)} B" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1000.0
    return f"{n:.1f} GB"


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def zip_facts(path: str) -> dict:
    """Entry count and sizes read straight out of a ``.otzplugin`` zip."""
    facts = {"entries": None, "compressed": None, "expanded": None}
    if not os.path.exists(path):
        return facts
    facts["compressed"] = os.path.getsize(path)
    try:
        with zipfile.ZipFile(path) as zf:
            infos = zf.infolist()
            facts["entries"] = len(infos)
            facts["expanded"] = sum(i.file_size for i in infos)
    except zipfile.BadZipFile as exc:
        sys.stderr.write(f"[notes] warning: {path} is not a readable zip: {exc}\n")
    return facts


def library_row(label: str, pack: Optional[dict]) -> Optional[str]:
    stats = (pack or {}).get("stats") or {}
    books, segs = stats.get("books"), stats.get("segments")
    if books is None:
        return None
    parts = [f"{books:,} works"]
    if isinstance(segs, int):
        parts.append(f"{segs:,} segments")
    aligned, partial = stats.get("alignedUnits"), stats.get("partialUnits")
    if isinstance(aligned, int) and isinstance(partial, int):
        parts.append(f"Hebrew aligned in {aligned:,} units, {partial:,} approximate")
    if stats.get("skipped"):
        parts.append(f"{stats['skipped']:,} skipped by the policy")
    return f"| {label} | {'; '.join(parts)} |"


def build_notes(args) -> str:
    pack = _load_json(args.pack) or {}
    extended = _load_json(args.extended_pack) or {}
    sizes = _load_json(args.reports) or {}
    sefaria = pack.get("sefaria") or extended.get("sefaria") or {}
    plugin_facts = zip_facts(args.plugin)

    version = args.version
    tag = args.tag or f"v{version}"
    plugin_asset = os.path.basename(args.plugin_asset or args.plugin)
    zenpack_attached = bool(args.otzenpack_asset) and os.path.exists(args.otzenpack)
    zenpack_asset = os.path.basename(args.otzenpack_asset) if args.otzenpack_asset else None

    out: list[str] = []
    out.append(f"### {args.headline}" if args.headline else f"### {tag}")
    out.append("")
    out.append(
        f"Install: download **`{plugin_asset}`** below, then in Otzaria open "
        "**Settings → Plugins → install from file**."
    )
    if zenpack_attached:
        out.append("")
        out.append(
            f"For the full library also download **`{zenpack_asset}`** and choose "
            "**Settings → Translation data → Load an extended .otzenpack library**."
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
    policy = pack.get("policy") or extended.get("policy")
    if policy:
        out.append(f"| Licence policy | `{policy}` |")
    row = library_row("Compact library (built in)", pack)
    if row:
        out.append(row)
    row = library_row("Extended library (.otzenpack)", extended)
    if row:
        out.append(row)
    if plugin_facts["entries"] is not None:
        out.append(f"| `{plugin_asset}` | {plugin_facts['entries']} entries, "
                   f"{human(plugin_facts['expanded'])} → {human(plugin_facts['compressed'])} |")
    if os.path.exists(args.otzenpack):
        out.append(f"| `{zenpack_asset or os.path.basename(args.otzenpack)}` | "
                   f"{human(os.path.getsize(args.otzenpack))}, uncompressed for byte-range reads |")
    total_json = sizes.get("totalJson")
    if isinstance(total_json, (int, float)):
        out.append(f"| Compact pack JSON | {human(total_json)} |")
    if args.validator:
        out.append(f"| Otzaria validator | {args.validator} |")
    if os.path.exists(args.plugin):
        out.append(f"| SHA-256 of `{plugin_asset}` | `{sha256(args.plugin)}` |")
    out.append("")
    out.append("#### Assets")
    out.append("")
    out.append(f"- `{plugin_asset}` — the installable plugin, with the compact library built in.")
    if zenpack_attached:
        out.append(f"- `{zenpack_asset}` — the extended library (Halakhah, Musar and nested "
                   "commentaries), imported from the plugin's Settings panel.")
    elif os.path.exists(args.otzenpack):
        out.append(f"- *The extended `.otzenpack` was built ({human(os.path.getsize(args.otzenpack))}) "
                   "but is too large to attach — GitHub caps a release asset at 2 GB. Build it "
                   "locally with `./build/build_all.sh`.*")
    if args.reports_asset:
        out.append(f"- `{args.reports_asset}` — coverage, licence, merge-fidelity and size reports "
                   "for the compact library, regenerated by this build.")
    if args.extended_reports_asset:
        out.append(f"- `{args.extended_reports_asset}` — the same reports for the extended library.")
    if args.datapack_asset:
        out.append(f"- `{args.datapack_asset}` — the generated compact data pack (`manifest.json` "
                   "plus the per-work chunk JSON) the plugin ships inside `data/`.")
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
    ap.add_argument("--version", required=True, help="release version, e.g. 1.1.0")
    ap.add_argument("--tag", default=None, help="release tag (default v<version>)")
    ap.add_argument("--commit", default="", help="commit the release was built from")
    ap.add_argument("--headline", default="", help="first line, e.g. 'Merged #12 — …'")
    ap.add_argument("--pack", default=os.path.join("dist", "pack", "manifest.json"))
    ap.add_argument("--extended-pack",
                    default=os.path.join("dist", "extended-pack", "manifest.json"))
    ap.add_argument("--plugin", default=os.path.join("dist", "otsaplugin.otzplugin"))
    ap.add_argument("--plugin-asset", default=None,
                    help="asset name to show readers (default: the --plugin filename)")
    ap.add_argument("--otzenpack", default=os.path.join("dist", "otsaplugin-extended.otzenpack"))
    ap.add_argument("--otzenpack-asset", default=None,
                    help="asset name of the extended library; omit when it is not attached")
    ap.add_argument("--reports", default=os.path.join("reports", "size-report.json"))
    ap.add_argument("--reports-asset", default=None)
    ap.add_argument("--extended-reports-asset", default=None)
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
