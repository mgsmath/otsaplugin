# otsaplugin — Sefaria English for Otzaria

A standalone Otzaria plugin that shows the **Sefaria merged English translation**
next to whatever you are reading, fully offline, with per-passage source
attribution and an explicit licence audit.

It is a plugin only: it does not fork or modify Otzaria, and it does not copy any
Otzaria source code into the package. It reads Otzaria's library and reader through
the public plugin SDK and ships its own English data, rebuilt from Sefaria's
export archive.

## What it does

- **Six view modes:** English only · Side by side · Interleaved · Flowing ·
  Peek (selection ± context) · Tap-to-reveal. The chosen view is remembered per
  entry point.
- **Two entry points.** A declarative context-menu item (select a passage →
  "תרגום לאנגלית", opens *Peek*), and the plugin tab, which can *follow the reader*
  when you turn that on.
- **One English text per work** (Sefaria `merged`), no version picker — but every
  passage still says where it came from.
- **Hebrew from Otzaria** where it can be aligned to the segment letter-for-letter;
  otherwise Sefaria's normalised Hebrew, clearly labelled, and never a re-split
  guess.
- **Credits/Licenses screen** listing every source version, its licence, segment
  count and URL, plus what each licence obliges you to do.
- **Fully offline:** no `network` permission, no remote script/font/image, so the
  app's offline mode never hides it.

## Correctness guarantees (the whole point)

- **Never show a wrong verse.** Anything that cannot be confirmed — an unparsable
  ref, an unmatched selection, an imprecise Hebrew alignment, an ambiguous book
  title — degrades to a wider scope (chapter/daf), is flagged *approximate*, or asks
  you, instead of silently picking. See `docs/MAPPING.md`.
- **Never redistribute text we may not.** The licence policy (default `open`:
  PD/CC0/CC-BY/CC-BY-SA) drops CC-BY-NC and `unknown` versions; uncovered segments
  are emitted empty and labelled. See `docs/LICENSING.md`.
- **Provenance is rebuilt, not assumed.** `merged.json` has no per-segment licence;
  the pipeline re-runs Sefaria's merge over the per-version files and records the
  contributing version per segment. The rebuild matches Sefaria's own `merged.json`
  exactly (see `reports/merge-fidelity.md`).

## Build, test, pack

```sh
# 1. Build the data pack (pinned Sefaria export commit) into plugin/data + dist/pack
python3 build/pipeline.py --export-root /path/to/Sefaria-Export-Archive \
  --out dist/pack --plugin-data plugin/data --reports reports \
  --stages tanakh,mishnah,talmud --talmud Berakhot,Shabbat \
  --policy open --commit 3f1013631fdfe452e953a93a2c5f921319e394ed --commit-date 2026-03-23

# 2. Regenerate the icon (no Pillow)
python3 build/make_icon.py

# 3. Run the test suite (123 golden tests; drives the real shipped JS + Python)
node tests/run_tests.js --export-root /path/to/Sefaria-Export-Archive

# 4. Pack the distributable and validate it (zero warnings is required)
python3 build/pack_plugin.py
node /path/to/otzaria-plugin-validator/src/cli.js plugin --fail-on-warnings
```

Current results: 92 books · 29,500 segments · 10.3 MB JSON · `.otzplugin` 106 entries,
3.3 MB · validator **0 errors, 0 warnings, design-compliant** · merge fidelity
**100.00%**.

## Permissions (minimal, each justified)

| Permission | Why |
|---|---|
| `app.startup_contributions` | declarative context-menu item |
| `reader.context_menu` | deliver context-menu clicks |
| `reader.open` | current ref / section text / open-at-ref |
| `library.books.read` | `library.getTree` to disambiguate book titles |
| `fs.user_files.read` | optional imported `.otzenpack` data file |
| `app.open_url` | Credits screen links to each translation's source |
| `events.subscribe:reader.current_ref_changed` | "follow the reader" mode |

No `network.*` and no background instance.

## Platforms

- **Verified here:** Windows/Linux-style `file://` loading and the data pipeline are
  exercised by `tests/run_tests.js` (a Node VM + DOM stub, since this sandbox has no
  WebView); Android/`file://` behaviour is designed for (classic scripts, no ES
  modules, `<script src>` data delivery) but **not run here**.
- **Not run here (no Flutter/WebView):** macOS `otzaria-plugin://` origin, live
  Android/iOS WebViews, the side-by-side `CombinedTab` placement, and real theme
  round-trips. These are marked *untested*; the code paths are written to be
  origin-agnostic.

## Layout

```
build/    pipeline, sanitiser, scope, icon + .otzplugin packers
plugin/   the shippable plugin (manifest, index.html, js/, css/, i18n/, icon/, data/)
tests/    Node VM test harness + Python bridge (golden tests)
reports/  coverage, licences, merge-fidelity, size
docs/     MAPPING.md, LICENSING.md
FEASIBILITY.md  Phase-0 findings
```

`plugin/data/` and `dist/` are generated; keep them out of Git.
