# Feasibility notes

This note separates facts checked in source or tests from work that still requires
a full export checkout or a running Otzaria app.

## Reader placement and actions

1. **Plugin page:** Otzaria renders `plugin/index.html` as a `ToolTab`; this is the
   translation reader's primary surface.
2. **Split view (Otzaria's own):** with the Settings option on, a new page, or a
   passage sent from the reader's menu, opens Otzaria's split pane beside the reader
   through `reader.openBook` with `openInSidePane: true`. The SDK reference says that
   argument shows the book as an extra pane beside the book open in the current tab,
   and opens a regular tab when the current tab is already split or none is open.
   The plugin tab must therefore be the current tab when the call is made. The
   context-menu item sets `openPlugin`, so the host brings the plugin tab forward
   for it; **+ New page** runs inside the plugin. The plugin has no split of its own.
3. **Split state and reuse:** `reader.getCurrentState` lists one entry per top-level
   tab, and the one for the plugin has `isSelf` set; it does not describe a split's
   layout. The plugin treats the reader as beside it unless the plugin tab and a tab
   showing the same text at the same line are both listed. A reader already beside
   the plugin on the same text is moved to the passage with `reader.scrollToSection`;
   on another text, the page opens without a reader and says so. This is best-effort:
   a split the user made in another tab can be read as the plugin's, a separate tab on
   the same text at the same line can be mistaken for the split's reader, and a reader
   tab for the same text that is open elsewhere stays where it is.
4. **Reader context menu:** the manifest contributes one action, **Translate
   selected passage**, which opens the selected passage on a new plugin page, beside
   the reader when the Settings option is on.
5. **Follow reader:** **Follow reader** subscribes to
   `reader.current_ref_changed`; turning it on also refreshes from
   `reader.getCurrentRef`. The handler normalizes the known title, id and
   reference payload variants and ignores events when follow mode is off.

The plugin does not replace Otzaria's Hebrew text pane. These app/SDK constraints
were checked against the host source; live WebView behaviour still needs a device.
The built-in split was exercised only against mocked SDK responses in the test
suite, so a run inside Otzaria 0.9.97 or later is still needed to confirm the
layout on screen.

## Offline operation

The manifest declares no network access. Built-in data is loaded as local classic
scripts, which works on the plugin's `file://` origins. An optional extended
`.otzenpack` is selected with Otzaria's file picker and read through its internal
range-capable file URL. It does not require the plugin's network permission.

## Data scope and delivery

Recursive discovery targets the Sefaria export roots `Tanakh`, `Mishnah`,
`Talmud`, `Halakhah` and `Musar`. This includes nested works such as Tanakh and
Mishnah commentaries, Mishneh Torah/Rambam and Mishnah Berurah when an eligible
English version exists.

`build/build_all.sh` is designed to produce:

- A built-in library for all eligible texts under Tanakh, Mishnah and Talmud.
- `dist/otsaplugin-extended.otzenpack` for those roots plus Halakhah and Musar.

The full export is not checked out in the current workspace, so the current total
coverage, archive size and app-store validation are **not verified**. Texts with
no available English version cleared by the selected build policy remain
unavailable rather than being invented or sourced at runtime.

## Redistribution data

The reader no longer shows a Credits/Licences panel, per-passage credits, or a
detailed source browser. The build nevertheless retains provenance internally
and uses `--policy open` by default: English versions with Public Domain, CC0,
CC-BY or CC-BY-SA terms are accepted; unknown licences and CC-BY-NC are excluded.
See `docs/LICENSING.md` for maintainer policy notes.

## Host version

`minAppVersion` is `0.9.97`. The SDK reference says it must be at least the highest
API version the plugin uses, and the packager refuses a build that calls a newer
API. `reader.scrollToSection` is listed as 0.9.97 in that table, and the
`openInSidePane` argument arrived in the same release (Otzaria commit `7dbb3be23`).
The plugin calls no API newer than 0.9.97.

## Packaging constraints

The historical Otzaria plugin-store limits were checked in the validator source:
50 MB archive, 1,024 entries, 150 MB expanded, and 16 MB per code entry, among
other constraints. The previous compact plugin met those limits, but the expanded
scope and new packs have not been built against the pinned export in this
workspace. Re-run `build/build_all.sh` and the official validator before release;
zero warnings are required.
