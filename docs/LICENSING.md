# Licensing policy

## The problem

Sefaria's `merged.json` carries no licence, and a work's `English/` directory mixes
licences — including **CC-BY-NC** (non-commercial) and files whose licence is
`unknown`. Bundling those into a downloadable plugin would redistribute text we may
not. So the pipeline makes an explicit, documented decision about which versions may
ship.

## The policies

`--policy open` (the shipped default) keeps only versions whose licence is
**Public Domain, CC0, CC-BY or CC-BY-SA** and whose `actualLanguage` is English.
`--policy include-nc` additionally keeps **CC-BY-NC** for *personal* builds (clearly
labelled non-commercial in the Credits screen). `unknown` is never kept by either.

A version whose `actualLanguage` is not English is dropped even with a free licence
(see `docs/MAPPING.md` — the merge is language-scoped).

## The decision for excluded segments

When no kept version covers a segment, the segment is emitted **empty** and counted
as `missing` (`reports/coverage.md`). The runtime shows "no translation under a
redistributable licence for some lines (n/m)" and never substitutes an
unlicenced one. We prefer a visibly absent verse to an unlawfully present one.

## Attribution

Every kept segment records its source version (RLE provenance in the pack). The UI:

- shows a compact credit line per passage (version + licence chip + link),
- has an always-reachable Credits/Licenses screen listing every version, its
  licence, segment count and source URL, plus the obligations per licence family.

The full table for the shipped build is `reports/licenses.md` / `.csv`. Current
`open` build: 6 versions, 29,340 segments (11,159 CC-BY, 18,181 PD/CC0).

## Why this is safe to automate

The licence string and `actualLanguage` live on the per-version files Sefaria ships;
we read them rather than guess. Anything missing or unrecognised falls to `unknown`
and is excluded. The licence→family mapping is in one place
(`build/pipeline.py::LICENSE_FAMILY`) and surfaced in the manifest so the Credits
screen never hardcodes licence text.
