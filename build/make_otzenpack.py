#!/usr/bin/env python3
"""Create the range-readable .otzenpack format used by the plugin's importer.

The file is intentionally uncompressed: Otzaria's internal file server supports
byte ranges, so the plugin reads only the manifest and the work the reader opens.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

FOOTER_BYTES = 12


def add_entry(out, path: Path) -> dict:
    data = path.read_bytes()
    entry = {"offset": out.tell(), "length": len(data)}
    out.write(data)
    out.write(b"\n")
    return entry


def build_otzenpack(pack_dir: str, output_path: str) -> tuple[int, int]:
    root = Path(pack_dir)
    manifest_path = root / "manifest.json"
    chunks_dir = root / "chunks"
    if not manifest_path.is_file() or not chunks_dir.is_dir():
        raise SystemExit(f"expected manifest.json and chunks/ in {root}")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"invalid manifest: {exc}")
    if manifest.get("formatVersion") != 1:
        raise SystemExit("unsupported pack format; expected formatVersion 1")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    index = {"manifest": None, "chunks": {}}
    chunk_files = sorted(chunks_dir.glob("*.json"))
    with output.open("wb") as out:
        index["manifest"] = add_entry(out, manifest_path)
        for chunk in chunk_files:
            index["chunks"][chunk.stem] = add_entry(out, chunk)
        index_bytes = json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        out.write(index_bytes)
        out.write(f"{len(index_bytes):0{FOOTER_BYTES}d}".encode("ascii"))

    return output.stat().st_size, len(chunk_files)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack-dir", required=True, help="directory with manifest.json and chunks/")
    parser.add_argument("--out", required=True, help="output .otzenpack file")
    args = parser.parse_args(argv)
    size, chunks = build_otzenpack(args.pack_dir, args.out)
    print(f"[otzenpack] {args.out}: {chunks} work chunks, {size / 1_000_000:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
