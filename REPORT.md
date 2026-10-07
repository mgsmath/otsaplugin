# Final report — verified vs unverified

Build pinned to Sefaria-Export-Archive commit
`3f1013631fdfe452e953a93a2c5f921319e394ed` (2026-03-23). Shipped policy `open`.

## Verified by running (in this sandbox)

- **Pipeline** (`build/pipeline.py`): exit 0; 92 books, 29,500 segments, 10.3 MB JSON;
  emits `dist/pack/*` + `plugin/data/*` + all reports. Largest per-work chunk 1.46 MB
  (well under the 16 MB per-entry limit).
- **Data files:** all 93 generated `plugin/data/*.js` compile in Node; `manifest.js`
  registers a format-1 manifest; chunks load lazily through the same `<script src>`
  path the plugin uses on `file://`.
- **Merge fidelity:** our rebuild of Sefaria's merge matches its own `merged.json`
  exactly — **32,934/32,935 (100.00%)**. The single difference is one segment Sefaria's
  shape holds that no English version supplies. Includes the measured finding that
  Sefaria's merge is language-scoped.
- **Golden tests:** `tests/run_tests.js` — **123 passed, 0 failed**. Covers Hebrew
  numerals, daf arithmetic, ref parsing (golden table), title resolution + ambiguity,
  alignment, sanitisation (real export footnote markup), licence policy, sort order,
  schema/stage inference, and app behaviour (views render, peek windows, context
  menu, follow mode, credits, no-network).
- **Packaging:** `build/pack_plugin.py` → 106 entries, 10.9 MB → 3.3 MB `.otzplugin`;
  validator (`--fail-on-warnings`) → **0 errors, 0 warnings, design-compliant**.
- **Licence policy:** open keeps PD/CC0/CC-BY/CC-BY-SA, drops CC-BY-NC + unknown, and
  drops non-English `actualLanguage` (6 versions, 29,340 segments in the shipped build).
- **Icon:** 64×64 RGBA PNG generated stdlib-only and visually inspected.
- **Offline posture:** manifest declares no `network` block; no code path calls a
  network method; `index.html` loads no remote resource.

## Verified by reading Otzaria source (not runnable here)

- Declarative context menu with `openPlugin:true` delivers the selection after boot
  with **no background instance**.
- No `network` ⇒ never hidden by offline mode.
- Side-by-side is possible via the user's "הצג לצד" (CombinedTab), not a plugin API.
- `minAppVersion 0.9.96` covers every used method (`getSectionTextMap` 0.9.95, etc.).

## Unverified — needs a real app / device (no Flutter, WebView, or OS here)

- Live rendering on Windows / Android / macOS / iOS WebViews.
- Exact runtime payload of `reader.getSectionTextMap` and `library.getTree` — the code
  is written defensively and degrades to labelled Sefaria Hebrew or a chooser, so a
  surprise there degrades safely rather than showing a wrong verse.
- Real theme change round-trips and the `CombinedTab` side-by-side placement.

These are honestly labelled *untested*; every safety-critical decision (alignment,
ambiguity, licence) fails closed and is exercised by the test suite.
