# Otzaria ⇄ Sefaria reference mapping

The plugin must show, for whatever the user is reading in Otzaria, the *same*
passage's Sefaria merged English. That is two independent resolutions, because a
wrong verse is worse than no verse.

## 1. Resolve the book

Otzaria's Hebrew book title → Sefaria work key via the pack's generated
`titleIndex` (Sefaria's own `heTitle` plus mechanical aliases and the
hand-maintained `build/otzaria_title_overrides.json`).

Ambiguity is explicit, not guessed. Otzaria calls Bavli Berakhot and Mishnah
Berakhot by the same name (`ברכות`; normalising `משנה ברכות` yields the same key).
`build_title_index` therefore emits a **list** for a colliding key, and
`Ref.resolveBook` returns it as-is; the runtime shows a chooser instead of picking.
See `reports/coverage.md` § *Ambiguous Otzaria titles*.

## 2. Resolve the address

`plugin/js/refmap.js` parses the Otzaria Hebrew ref into the schema of the work:

| Schema | Example refs | Address |
|---|---|---|
| verse | `פרק א, פסוק ג`, `א:ג`, `טו:ז` | `chapter:verse` |
| mishnah | `פרק א, משנה ב`, `ב:ד` | `chapter:mishnah` |
| daf | `דף ב.`, `דף ב:`, `ב.`, `דף ב ע"א` | daf + amud |
| chapter | `פרק ה` | chapter |

Hebrew numerals and daf arithmetic mirror `build/sefaria_text.py` (`hebrewToInt ≡
hebrew_numeral_to_int`, `dafToSection ≡ daf_to_section`), which the tests check
against each other.

**Daf convention (verified against the export, not copied from Otzaria's
`toEnglishDaf`, which is off by one):** `section = index + 1`; `n = (section+1)//2`;
amud `'a'` iff section odd. So section 3 = `2a`, section 4 = `2b`.

**Safety:** a bare Hebrew *word* must not read as a numeral. `NS.isPlausibleNumeral`
requires non-increasing letter values (plus the standard `טו`/`טז`), so `לא ידוע`
("unknown") is rejected rather than parsed as chapter 121.

## 3. Confirm against what the reader actually shows

The parsed address is a *hypothesis*; the plugin then confirms it against Otzaria's
own text where possible:

- `Ref.locateSegment` ties a user selection to a segment by token overlap, refusing
  below a similarity floor.
- `NS.alignHebrew` aligns the reader's whole-section Hebrew to the pack's per-segment
  Hebrew letter-for-letter (niqqud/punctuation/tags dropped). Anything less than an
  exact match degrades to section level and is flagged *approximate*.

## 4. Coverage (pack side)

`reports/coverage.csv|md` list, per work, segments, missing segments and aligned
units. Under the `open` policy: Tanakh 39/39, Mishnah 51/52 (Terumot has no
redistributable English), Berakhot full, Shabbat partial. The Otzaria side is
resolved at runtime from `library.getTree`; the pack side is what we can promise.

## The merge model (why provenance exists)

`merged.json` has no per-segment provenance and no licence. We rebuild it: versions
ordered by `priority` desc (absent = 0), ties by segment count then title; per
segment first non-empty wins; restricted to `actualLanguage` en/absent.
`reports/merge-fidelity.md` shows this reproduces Sefaria's `merged.json` at
**100.00% (32,934/32,935)** — including the measured finding that Sefaria's merge is
language-scoped (the French/German files in `English/` must be excluded). Each kept
segment records its contributing version index (RLE) so the UI can attribute it.
