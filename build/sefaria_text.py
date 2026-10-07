"""Text-level helpers for the Sefaria -> Otzaria English translation pipeline.

Pure functions only: no I/O, no globals. Everything here is unit-tested from
``tests/run_tests.js`` through ``tests/py_bridge.py`` so the shipped pack and the
test suite exercise the same code.
"""

from __future__ import annotations

import re
import html as _html
from typing import Iterable, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Hebrew normalisation
# ---------------------------------------------------------------------------

# Cantillation marks (teamim), nikud points, and the Hebrew punctuation marks
# that carry no lexical meaning. Ranges follow Unicode "Hebrew" block.
_HE_MARKS = "".join(
    [
        "\u0591-\u05af",  # cantillation + meteg + rafe
        "\u05b0-\u05bd",  # points (sheva..meteg)
        "\u05bf",         # rafe
        "\u05c1\u05c2",   # shin/sin dot
        "\u05c4\u05c5",   # upper/lower dot
        "\u05c7",         # qamats qatan
        "\u05c3",         # sof pasuq
        "\u05be",         # maqaf
        "\u05f3\u05f4",   # geresh / gershayim
        '"\'\u201c\u201d\u2018\u2019\u00ab\u00bb',
    ]
)
_HE_STRIP_RE = re.compile("[" + _HE_MARKS + "]")
_WS_RE = re.compile(r"\s+")

# Punctuation that Sefaria's Hebrew text uses as a delimiter but that adds no
# information for alignment purposes.
_PUNCT_TAIL_RE = re.compile(r"[,.:;!?\u05c3\u05be\u05f3\u05f4()\[\]{}\u201c\u201d\u2018\u2019\"\u00b6]+$")


def normalize_hebrew(text: str) -> str:
    """Strip nikud, teamim, punctuation and collapse whitespace.

    Used for (a) the fallback Hebrew source shipped in the pack and (b) the
    alignment check between Otzaria's own text and Sefaria's segments.
    """
    if not text:
        return ""
    # Drop inline HTML first (Sefaria wraps the parasha opening in <big>, etc.).
    out = strip_tags(text)
    out = _html.unescape(out)
    out = _HE_STRIP_RE.sub("", out)
    out = _PUNCT_TAIL_RE.sub("", out)
    out = _WS_RE.sub(" ", out)
    return out.strip()


_TAG_RE = re.compile(r"<[^>]*>")


def strip_tags(text: str) -> str:
    return _TAG_RE.sub("", text or "")


def hebrew_similarity(a: str, b: str) -> float:
    """Cheap token-level Jaccard similarity over normalised Hebrew.

    Returns 0.0..1.0. Deliberately not an edit distance: sections are long and
    we only need a threshold decision ("is this the same passage?").
    """
    ta = set(normalize_hebrew(a).split())
    tb = set(normalize_hebrew(b).split())
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ---------------------------------------------------------------------------
# Hebrew numerals <-> integers
# ---------------------------------------------------------------------------

_LETTERS = {
    "\u05d0": 1, "\u05d1": 2, "\u05d2": 3, "\u05d3": 4, "\u05d4": 5, "\u05d5": 6,
    "\u05d6": 7, "\u05d7": 8, "\u05d8": 9, "\u05d9": 10, "\u05db": 20, "\u05dc": 30,
    "\u05de": 40, "\u05e0": 50, "\u05e1": 60, "\u05e2": 70, "\u05e4": 80, "\u05e6": 90,
    "\u05e7": 100, "\u05e8": 200, "\u05e9": 300, "\u05ea": 400,
    "\u05da": 20, "\u05dd": 40, "\u05df": 50, "\u05e3": 80, "\u05e5": 90,
}


def hebrew_numeral_to_int(raw: str) -> Optional[int]:
    """Parse a Hebrew numeral, including the 15/16 exceptions and final letters.

    ``"ט״ו" -> 15`` (not 11), ``"ט״ז" -> 16``, ``"קכ״ג" -> 123``.
    Returns ``None`` when the string is not a Hebrew numeral.
    """
    if raw is None:
        return None
    s = raw.strip()
    # Tolerate gershayim / geresh / apostrophe / quote anywhere.
    s = re.sub(r"[\u05f3\u05f4'\u2019\u2018\"]", "", s)
    if not s:
        return None
    # Plain digits are accepted too: Otzaria TOCs sometimes use them.
    if s.isdigit():
        return int(s)
    total = 0
    for ch in s:
        if ch in _LETTERS:
            total += _LETTERS[ch]
        else:
            return None
    if total == 0:
        return None
    return total


# ---------------------------------------------------------------------------
# Run-length encoding of per-segment provenance
# ---------------------------------------------------------------------------


def rle_encode(values: Iterable[int]) -> List[List[int]]:
    """``[0,0,0,2,2] -> [[3,0],[2,2]]`` (``[count, value]`` pairs)."""
    out: List[List[int]] = []
    for v in values:
        if out and out[-1][1] == v:
            out[-1][0] += 1
        else:
            out.append([1, v])
    return out


def rle_decode(pairs: Iterable[Iterable[int]]) -> List[int]:
    out: List[int] = []
    for count, value in pairs:
        out.extend([value] * count)
    return out


# ---------------------------------------------------------------------------
# Sefaria addresses
# ---------------------------------------------------------------------------

def daf_from_section(section: int) -> str:
    """Sefaria 1-based Bavli section -> daf label (``3 -> '2a'``).

    Verified against Sefaria-Export: ``json/Talmud/Bavli/Seder Zeraim/Berakhot``
    has 127 chapters, the first non-empty one is index 2 (i.e. section 3) and its
    first Hebrew segment is the opening of Berakhot 2a (``מֵאֵימָתַי קוֹרִין``).
    """
    n = (section + 1) // 2
    return f"{n}{'a' if section % 2 == 1 else 'b'}"


def daf_to_section(label: str) -> Optional[int]:
    """``'2a' -> 3``, ``'64a' -> 127``. ``None`` when the label is not a daf."""
    m = re.fullmatch(r"\s*(\d+)\s*([abAB])\s*", label or "")
    if not m:
        return None
    n = int(m.group(1))
    if n < 1:
        return None
    return 2 * (n - 1) + (1 if m.group(2).lower() == "a" else 2)


def flatten_text(text) -> List[List[str]]:
    """Normalise a Sefaria ``text`` payload to ``[[seg, ...], ...]``.

    Sefaria exports depth-1 books as a flat list of strings and depth-2 books as
    a list of lists. Empty chapters are preserved so chapter indices stay stable.
    """
    out: List[List[str]] = []
    if not isinstance(text, list):
        return out
    for chapter in text:
        if isinstance(chapter, str):
            out.append([chapter] if chapter.strip() else [])
        elif isinstance(chapter, list):
            out.append([c if isinstance(c, str) else "" for c in chapter])
        else:
            out.append([])
    return out


def tup(value) -> Tuple[int, ...]:
    """Coerce a Sefaria 'sections' style address to a tuple of ints."""
    if value is None:
        return ()
    if isinstance(value, (int, float)):
        return (int(value),)
    if isinstance(value, (list, tuple)):
        return tuple(int(v) for v in value if isinstance(v, (int, float)))
    return ()
