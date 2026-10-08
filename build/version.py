#!/usr/bin/env python3
"""Release versioning: compute the next version and stamp it into the manifest.

The source of truth is the repository's release tags (``v1.1.0``, ``v1.1.1``, …).
Every release bumps the patch component by one, so the sequence never skips and
never needs a human to decide a number:

    v1.1.0 -> v1.1.1 -> … -> v1.1.9 -> v1.1.10

With no release tags yet, the first release publishes the version the manifest
already declares — the build that is on ``main`` is the build that gets
released, so it keeps the number it was written with. ``--first`` overrides that
fallback for a repository whose manifest carries no usable version.

``stamp`` rewrites ``plugin/manifest.json`` in place. The manifest is round-tripped
through ``json`` with the same formatting it already uses (2-space indent, raw
non-ASCII, trailing newline), so bumping a version never produces a diff anywhere
else in the file.

Subcommands
-----------
    next      print the next release version (no ``v`` prefix)
    current   print the version currently in the manifest
    stamp     write a version into the manifest

Usage::

    python3 build/version.py next
    python3 build/version.py stamp 1.1.7
    python3 build/version.py stamp "$(python3 build/version.py next)"

Stdlib only, like the rest of ``build/``.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import sys
from typing import List, Optional, Tuple

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MANIFEST = os.path.join(REPO_ROOT, "plugin", "manifest.json")
FIRST_VERSION = "0.0.1"
TAG_PREFIX = "v"
VERSION_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------


def parse_version(text: str) -> Optional[Tuple[int, int, int]]:
    """``0.0.10`` / ``v0.0.10`` -> ``(0, 0, 10)``, anything else -> ``None``."""
    m = VERSION_RE.match(text.strip())
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def format_version(parts: Tuple[int, int, int]) -> str:
    return "%d.%d.%d" % parts


def release_tags(repo: str = REPO_ROOT) -> List[Tuple[int, int, int]]:
    """Every tag that looks like a release, newest last (numeric, not lexical)."""
    try:
        out = subprocess.run(
            ["git", "tag", "--list", TAG_PREFIX + "*"],
            cwd=repo, capture_output=True, text=True, check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"version: cannot read git tags in {repo}: {exc}")
    found = [v for v in (parse_version(t) for t in out.split()) if v]
    return sorted(found)


def next_version(repo: str = REPO_ROOT, first: Optional[str] = None,
                 manifest: str = DEFAULT_MANIFEST,
                 taken: Optional[set] = None) -> str:
    """Latest release tag with its patch component bumped by one.

    With no release tags yet the first release keeps the version the manifest
    already declares — what is on ``main`` is what gets published. ``first`` (or
    ``FIRST_VERSION``) is only the fallback for a manifest with no usable
    version. ``taken`` lets a caller skip versions that are already used but not
    yet visible as tags (a release in flight, say).
    """
    tags = release_tags(repo)
    if tags:
        major, minor, patch = tags[-1]
        candidate = (major, minor, patch + 1)
    else:
        candidate = parse_version(manifest_version(manifest)) if manifest else None
        if candidate is None:
            candidate = parse_version(first or FIRST_VERSION)
        if candidate is None:
            raise SystemExit(
                f"version: {manifest} declares no usable version and "
                f"--first {first or FIRST_VERSION!r} is not X.Y.Z"
            )
    taken = taken or set()
    while candidate in taken:
        candidate = (candidate[0], candidate[1], candidate[2] + 1)
    return format_version(candidate)


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def read_manifest(path: str) -> Tuple[dict, str]:
    with io.open(path, "r", encoding="utf-8") as fh:
        raw = fh.read()
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise SystemExit(f"version: {path} is not valid JSON: {exc}")
    if not isinstance(data, dict):
        raise SystemExit(f"version: {path} is not a JSON object")
    return data, raw


def write_manifest(path: str, data: dict) -> str:
    """Serialise exactly the way the committed manifest is formatted."""
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    return text


def manifest_version(path: str = DEFAULT_MANIFEST) -> str:
    data, _raw = read_manifest(path)
    return str(data.get("version") or "")


def stamp(version: str, path: str = DEFAULT_MANIFEST, check: bool = False) -> int:
    parsed = parse_version(version)
    if parsed is None:
        raise SystemExit(f"version: {version!r} is not X.Y.Z")
    version = format_version(parsed)

    data, raw = read_manifest(path)
    before = str(data.get("version") or "(none)")
    data["version"] = version
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    if check:
        ok = text == raw
        print(f"[version] {path}: {'matches' if ok else 'DIFFERS from'} {version}")
        return 0 if ok else 1
    if text == raw:
        print(f"[version] {path}: already {version}")
        return 0
    write_manifest(path, data)
    print(f"[version] {path}: {before} -> {version}")
    return 0


# ---------------------------------------------------------------------------


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_next = sub.add_parser("next", help="print the next release version")
    p_next.add_argument("--repo", default=REPO_ROOT, help="repository to read tags from")
    p_next.add_argument("--manifest", default=DEFAULT_MANIFEST,
                        help="manifest whose version is the first release when there are no tags")
    p_next.add_argument("--first", default=None,
                        help=f"fallback when there are no tags and the manifest declares no "
                             f"usable version (default {FIRST_VERSION})")

    p_cur = sub.add_parser("current", help="print the manifest version")
    p_cur.add_argument("--manifest", default=DEFAULT_MANIFEST)

    p_stamp = sub.add_parser("stamp", help="write a version into the manifest")
    p_stamp.add_argument("version", help="X.Y.Z")
    p_stamp.add_argument("--manifest", default=DEFAULT_MANIFEST)
    p_stamp.add_argument("--check", action="store_true",
                         help="do not write; exit non-zero unless the manifest already says this")

    args = ap.parse_args(argv)

    if args.cmd == "next":
        print(next_version(args.repo, args.first, args.manifest))
        return 0
    if args.cmd == "current":
        print(manifest_version(args.manifest))
        return 0
    return stamp(args.version, args.manifest, args.check)


if __name__ == "__main__":
    raise SystemExit(main())
