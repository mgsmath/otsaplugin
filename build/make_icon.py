#!/usr/bin/env python3
"""Generate plugin/icon/icon.png (64x64) with no third-party dependencies.

The mark is the plugin's function: a Hebrew column beside an English column.
Pure stdlib (zlib + struct) so the build never needs Pillow.
"""
from __future__ import annotations

import argparse
import os
import struct
import zlib

SIZE = 64

PRIMARY = (0x67, 0x50, 0xA4, 255)      # Material purple, matches --color-primary
SURFACE = (0xEA, 0xDD, 0xFF, 255)      # primary container
INK = (0x21, 0x00, 0x5D, 255)          # on-primary-container
CLEAR = (0, 0, 0, 0)


def rounded(x: float, y: float, x0: float, y0: float, x1: float, y1: float, r: float) -> bool:
    """True when (x, y) is inside the rounded rectangle."""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def build() -> bytes:
    px = [[CLEAR] * SIZE for _ in range(SIZE)]

    # Background tile.
    for y in range(SIZE):
        for x in range(SIZE):
            if rounded(x + 0.5, y + 0.5, 0, 0, SIZE - 1, SIZE - 1, 14):
                px[y][x] = PRIMARY

    # Two panels: Hebrew (right, RTL) and English (left).
    panels = [(6, 12, 29, 52), (35, 12, 58, 52)]
    for (x0, y0, x1, y1) in panels:
        for y in range(SIZE):
            for x in range(SIZE):
                if rounded(x + 0.5, y + 0.5, x0, y0, x1, y1, 5):
                    px[y][x] = SURFACE

    # Text lines. The right panel starts from the right edge (Hebrew), the left
    # panel from the left (English) - the only difference you can see at 64px.
    lines = [(18, 22), (26, 30), (34, 38), (42, 46)]
    for (x0, y0, x1, y1) in panels:
        rtl = x0 < 32
        for i, (ly0, ly1) in enumerate(lines):
            inset = 5 if i % 2 == 0 else 10
            lx0 = x1 - inset - 12 if rtl else x0 + inset
            lx1 = lx0 + 12
            for y in range(ly0, ly1 + 1):
                for x in range(lx0, lx1 + 1):
                    if 0 <= x < SIZE and 0 <= y < SIZE and px[y][x] == SURFACE:
                        px[y][x] = INK

    raw = b""
    for row in px:
        raw += b"\x00" + b"".join(struct.pack("BBBB", *p) for p in row)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join("plugin", "icon", "icon.png"))
    args = ap.parse_args()
    data = build()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "wb") as fh:
        fh.write(data)

    # Verify the file we just wrote: PNG signature, IHDR 64x64x8 RGBA.
    with open(args.out, "rb") as fh:
        got = fh.read()
    if got[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError("not a PNG: %s" % args.out)
    w, h, depth, ctype = struct.unpack(">IIBB", got[16:26])
    if (w, h, depth, ctype) != (64, 64, 8, 6):
        raise AssertionError("unexpected geometry %r" % ((w, h, depth, ctype),))
    print("[icon] wrote %s (%d bytes, %dx%d RGBA)" % (args.out, len(got), w, h))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
