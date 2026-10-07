"""Which Sefaria works the pack covers, and how they are keyed for Otzaria.

Stages are cumulative: ``tanakh`` (stage 1), ``mishnah`` (stage 2),
``talmud`` (stage 3). Later stages (Mishneh Torah, Shulchan Arukh, Midrash,
commentaries) are the same shape — add a glob to ``STAGE_GLOBS``.

Nothing here reads the network or the disk: it is a table plus a few helpers.
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional

# Export-relative globs, one per stage. A "book directory" is the directory that
# directly contains ``English/`` and ``Hebrew/``.
STAGE_GLOBS: Dict[str, List[str]] = {
    "tanakh": [
        "json/Tanakh/Torah/*",
        "json/Tanakh/Prophets/*",
        "json/Tanakh/Writings/*",
    ],
    "mishnah": [
        "json/Mishnah/Seder Zeraim/*",
        "json/Mishnah/Seder Moed/*",
        "json/Mishnah/Seder Nashim/*",
        "json/Mishnah/Seder Nezikin/*",
        "json/Mishnah/Seder Kodashim/*",
        "json/Mishnah/Seder Tohorot/*",
    ],
    "talmud": [
        "json/Talmud/Bavli/Seder Zeraim/*",
        "json/Talmud/Bavli/Seder Moed/*",
        "json/Talmud/Bavli/Seder Nashim/*",
        "json/Talmud/Bavli/Seder Nezikin/*",
        "json/Talmud/Bavli/Seder Kodashim/*",
        "json/Talmud/Bavli/Seder Tohorot/*",
    ],
}

STAGE_ORDER = ["tanakh", "mishnah", "talmud"]

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
    for stage, globs in STAGE_GLOBS.items():
        for g in globs:
            if rel_dir.startswith(g.rsplit("/*", 1)[0] + os.sep):
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
