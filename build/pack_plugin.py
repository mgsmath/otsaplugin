#!/usr/bin/env python3
"""Zip the `plugin/` directory into a distributable `.otzplugin`.

An `.otzplugin` is a plain ZIP whose entries are paths relative to the plugin
root (`manifest.json` at the top). This packer is dependency-free and checks the
Otzaria store limits from `Otzaria_Website/src/lib/pluginLimits.js` as it goes,
so a build that would be rejected at upload fails loudly here instead.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import sys
import tempfile
import zipfile

MAX_ARCHIVE = 50 * 1024 * 1024
MAX_ENTRIES = 1024
MAX_EXPANDED = 150 * 1024 * 1024
MAX_ENTRY = 50 * 1024 * 1024
MAX_CODE_ENTRY = 16 * 1024 * 1024
MAX_MANIFEST = 256 * 1024
MAX_IMAGE = 5 * 1024 * 1024
CODE_RE = (".js", ".mjs", ".cjs", ".html", ".htm", ".vue", ".svelte", ".css")

SKIP_DIRS = {"__pycache__", "node_modules", ".git"}


def collect(plugin_dir: str):
    files = []
    for root, dirs, names in os.walk(plugin_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in sorted(names):
            abs_path = os.path.join(root, name)
            rel = os.path.relpath(abs_path, plugin_dir).replace(os.sep, "/")
            files.append((abs_path, rel))
    return sorted(files, key=lambda x: x[1])


# ---------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------
#
# ``full`` is the plugin as it lives in plugin/: the compact library is built in
# and the extended .otzenpack is imported separately from Settings.
#
# ``lite`` is the same code with only the compact library. It is a different
# plugin to Otzaria (its own id and name, so both can be installed side by side),
# and its Settings panel has no extended-library controls. It is staged into a
# temporary copy, so plugin/ itself never changes.

EDITIONS = ("full", "lite")

LITE_MANIFEST = {
    "id": "org.sefaria.otzaria-english-lite",
    "name": "English Lite",
    "description": (
        "Offline English translations for the built-in library (Tanakh, Mishnah "
        "and Talmud), with reader-follow and side-by-side views."
    ),
}
LITE_TOOLTAB_TITLE = "English Lite"
LITE_BODY_CLASS = "edition-lite"


def stage_lite(plugin_dir: str, staging: str) -> str:
    """Copy ``plugin_dir`` to ``staging`` and apply the lite edition to the copy."""
    dest = os.path.join(staging, "plugin")
    shutil.copytree(plugin_dir, dest, ignore=shutil.ignore_patterns(*SKIP_DIRS))

    manifest_path = os.path.join(dest, "manifest.json")
    with io.open(manifest_path, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    manifest.update(LITE_MANIFEST)
    manifest.setdefault("contributes", {}).setdefault("toolTab", {})["title"] = LITE_TOOLTAB_TITLE
    with io.open(manifest_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    html_path = os.path.join(dest, "index.html")
    with io.open(html_path, "r", encoding="utf-8") as fh:
        html = fh.read()
    body = '<body>'
    if html.count(body) != 1:
        raise SystemExit("index.html: expected exactly one plain <body> tag")
    html = html.replace(body, '<body class="%s">' % LITE_BODY_CLASS)
    with io.open(html_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)
    return dest


def check_limits(files, expanded_total: int) -> None:
    if len(files) > MAX_ENTRIES:
        raise SystemExit(f"too many entries: {len(files)} > {MAX_ENTRIES}")
    if expanded_total > MAX_EXPANDED:
        raise SystemExit(f"expanded size {expanded_total} > {MAX_EXPANDED}")
    for abs_path, rel in files:
        size = os.path.getsize(abs_path)
        if size > MAX_ENTRY:
            raise SystemExit(f"{rel}: entry {size} > {MAX_ENTRY}")
        if rel.lower().endswith(CODE_RE) and size > MAX_CODE_ENTRY:
            raise SystemExit(f"{rel}: code entry {size} > {MAX_CODE_ENTRY}")
        if rel == "manifest.json" and size > MAX_MANIFEST:
            raise SystemExit(f"manifest {size} > {MAX_MANIFEST}")
        if rel.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")) and size > MAX_IMAGE:
            raise SystemExit(f"{rel}: image {size} > {MAX_IMAGE}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plugin-dir", default=os.path.join("plugin"))
    ap.add_argument("--out", default=os.path.join("dist", "otsaplugin.otzplugin"))
    ap.add_argument("--edition", choices=EDITIONS, default="full",
                    help="full (default) or lite (compact library only, separate plugin id)")
    args = ap.parse_args(argv)

    if args.edition == "lite":
        staging = tempfile.mkdtemp(prefix="otz-lite-")
        try:
            plugin_dir = stage_lite(args.plugin_dir, staging)
            return _pack(plugin_dir, args.out, args.edition)
        finally:
            shutil.rmtree(staging, ignore_errors=True)
    return _pack(args.plugin_dir, args.out, args.edition)


def _pack(plugin_dir: str, out: str, edition: str) -> int:
    files = collect(plugin_dir)
    if not any(rel == "manifest.json" for _abs, rel in files):
        raise SystemExit("no manifest.json in plugin dir")

    expanded_total = sum(os.path.getsize(a) for a, _r in files)
    check_limits(files, expanded_total)

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for abs_path, rel in files:
            zf.write(abs_path, rel)
    compressed = os.path.getsize(out)
    if compressed > MAX_ARCHIVE:
        raise SystemExit(f"archive {compressed} > {MAX_ARCHIVE}")

    with open(out, "rb") as fh:
        magic = fh.read(2)
    if magic != b"PK":
        raise SystemExit("output is not a zip")

    print(f"[pack] {out} ({edition}): {len(files)} entries, {expanded_total/1e6:.1f} MB -> {compressed/1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
