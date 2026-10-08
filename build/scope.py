"""Which Sefaria works the pack covers, and how they are keyed for Otzaria.

Stages correspond to the major Sefaria export sections. Discovery walks each
root recursively, so commentaries and nested works are included alongside the
base texts when an English version exists.

Nothing here reads the network or the disk: it is a table plus a few helpers.
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional

# Export-relative globs, one per stage. A "book directory" is the directory that
# directly contains ``English/`` and ``Hebrew/``.
# Export-relative roots. Each root is walked recursively, and a directory is a
# candidate work when it contains an English/ child. This captures nested
# commentaries (including Rashi/Rambam and Mishnah Berurah) without hard-coding
# individual books or losing their category path.
STAGE_GLOBS: Dict[str, List[str]] = {
    "tanakh": ["json/Tanakh"],
    "mishnah": ["json/Mishnah"],
    "talmud": ["json/Talmud"],  # Bavli, Yerushalmi, and any included commentaries
    "halakhah": ["json/Halakhah"],  # Mishneh Torah, Shulchan Arukh, Mishnah Berurah, etc.
    "musar": ["json/Musar"],
}

STAGE_ORDER = ["tanakh", "mishnah", "talmud", "halakhah", "musar"]

# Schema class drives how the runtime formats an address and how it parses an
# Otzaria ref. Derived from Sefaria's own ``sectionNames``; see
# ``schema_of_section_names``.
SCHEMA_VERSE = "verse"      # ["Chapter", "Verse"]
SCHEMA_MISHNAH = "mishnah"  # ["Chapter", "Mishnah"]
SCHEMA_DAF = "daf"          # ["Daf", "Line"]
SCHEMA_CHAPTER = "chapter"  # depth 1, or anything unrecognised
SCHEMA_HALAKHA = "halakha"  # ["Chapter", "Halakhah"] (Mishneh Torah, stage 4)
SCHEMA_SIMAN = "siman"      # ["Siman", "Se'if"] (Shulchan Arukh, stage 4)


def schema_of_section_names(section_names: Optional[List[str]], depth: int) -> str:
    """Map Sefaria ``sectionNames`` to one of the schema classes above."""
    names = [str(s).strip().lower() for s in (section_names or [])]
    if not names:
        return SCHEMA_CHAPTER
    second = names[1] if len(names) > 1 else ""
    first = names[0]
    if "daf" in first or "folio" in first:
        return SCHEMA_DAF
    if second in ("verse", "pasuk"):
        return SCHEMA_VERSE
    if "mishna" in second or "mishnah" in second:
        return SCHEMA_MISHNAH
    if "halakh" in second:
        return SCHEMA_HALAKHA
    if "seif" in second or "se'if" in second:
        return SCHEMA_SIMAN
    if first in ("chapter", "perek", "psalm"):
        return SCHEMA_CHAPTER
    return SCHEMA_CHAPTER


def stage_of_book_dir(rel_dir: str) -> Optional[str]:
    rel = os.path.normpath(rel_dir)
    for stage, roots in STAGE_GLOBS.items():
        for root in roots:
            root = os.path.normpath(root)
            if rel == root or rel.startswith(root + os.sep):
                return stage
    return None


# ---------------------------------------------------------------------------
# Hand-maintained override table
# ---------------------------------------------------------------------------
#
# The generated title index is built from Sefaria's own ``heTitle`` plus the
# mechanical aliases below (e.g. "משנה ברכות" also answers to "ברכות"). This file
# is the place to record a mapping that the data cannot express — for example an
# Otzaria book whose name is not Sefaria's, or one Otzaria splits into volumes.
#
# It is intentionally EMPTY at first. Entries must be added only after checking
# the real name against ``library.getTree`` in a running Otzaria; the coverage
# report lists every work that failed to resolve so the table can be filled in
# from evidence rather than guesswork. See docs/MAPPING.md.
DEFAULT_OVERRIDES: Dict[str, object] = {
    "byOtzariaTitle": {},
    "aliases": {},
    "excludedOtzariaTitles": [],
}
