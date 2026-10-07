# Feasibility study (Phase 0)

Everything below was established by reading the Otzaria app source, the plugin SDK
docs and the Sefaria export — not by guesswork. Where a claim could not be
executed here (no Flutter/Dart, no WebView in this sandbox) it is marked
*verified by source* vs *verified by running*.

## (a) Where can a plugin display English next to a Hebrew book?

No API docks a plugin *inside* the reader. The real surfaces are:

1. **Plugin page (ToolTab).** `reading_screen.dart:670-671` renders the plugin's
   `index.html` as a tab. This is our primary surface.
2. **Side-by-side, user-driven.** `CombinedTab` accepts any two non-Combined
   panes; `_onCreateCombinedTab` (`tabs_bloc.dart:1424-1474`) has no type
   restriction and the "הצג לצד" menu (`tab_context_menu.dart:196-222`) lists every
   tab. So a user can place the plugin tab beside the reader tab. That is a user
   action, not a plugin API — we document it rather than promise it.
3. **Replace the reader's text area.** `reader.setDefaultTextReader` can swap the
   text pane of a `type:"text"` book inside `CombinedView`/`SplitedViewScreen`.
   We deliberately do **not** take this over; it would replace Otzaria's own
   Hebrew UI, which is out of scope and high-risk.

*Verified by source.*

## (b) Context-menu entry (the "Peek" flow)

`contributes.startup.contextMenuItems` is parsed **in Dart with no WebView**.
It needs `app.startup_contributions` (default on) + `reader.context_menu`, at most
two top-level items, and `openPlugin:true`. Crucially,
`plugin_startup_contributions.dart::_contextMenuItemActivatesBackground` shows an
`openPlugin` item is queued and delivered **after boot even when the plugin runs no
background instance**. So we can be completely backgroundless. Payload:
`{itemId, selectedText, currentRef, currentBook, currentBookId, param}`.
*Verified by source.*

## (c) Offline operation

`installed_plugin.dart:87,91`: a plugin is hidden in offline mode only when
`networkEnabled && networkAccessGranted`. We declare **no** `network` block, so the
plugin is never hidden offline and loads nothing remote. *Verified by source.*

## (d) Background instance

Declarative `contributes.startup` needs no JS engine. Background instances are lazy,
need `app.run_on_startup` (default off), and auto-close after ~3 min idle.
**Decision: ship no background instance and no `app.run_on_startup`.** The
declarative context menu plus `openPlugin:true` gives us the selection for free.
*Verified by source.*

## (e) No existing duplicate plugin

GitHub searches found no plugin that shows Sefaria merged English. Bundled ids are
`com.otzaria_word_editor.superdoc`, `com.otzaria.kidush-hachodesh`,
`otzaria.plugins_directory`; ours is distinct (`org.sefaria.otzaria-english`).
*Verified by source.*

## (f) Is there English in Otzaria's own DB?

No. `Database.sq` L482-516 builds the library from **Sefaria's Hebrew merged text**
only; `book_version.license` exists but is not exposed to plugins (`database.*`
allows only `talmud_synopsis` and `external_catalog`). So we must bundle our own
English, derived from Sefaria's export. *Verified by source.*

## (g) Does Sefaria's merged.json give per-segment provenance or licence?

No. All 185 sampled `merged.json` files carry neither per-segment provenance nor a
top-level `license`; `versions` is a flat whole-file list. Therefore provenance must
be **rebuilt** by re-running Sefaria's merge over the per-version files (which do
carry `license`, `priority`, `actualLanguage`). See `docs/MAPPING.md` and
`reports/merge-fidelity.md` — our rebuild reproduces `merged.json` exactly.
*Verified by running.*

## Store / packaging limits

`Otzaria_Website/src/lib/pluginLimits.js`: archive ≤ 50 MB · ≤ 1024 entries ·
≤ 150 MB expanded · ≤ 50 MB/entry · ≤ 16 MB per code entry · 256 KB manifest ·
5 MB image. The store treats validator **warnings as blocking**
(`pluginValidationCore.js:31`), so the pack must validate with **zero warnings**.
Our current pack: 106 entries, 10.9 MB → 3.3 MB zipped; validator: 0 errors,
0 warnings. *Verified by running.*
