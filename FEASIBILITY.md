# Feasibility notes

This note separates facts checked in source or tests from work that still requires
a full export checkout or a running Otzaria app.

## Reader placement and actions

1. **Plugin page:** Otzaria renders `plugin/index.html` as a `ToolTab`; this is the
   translation reader's primary surface.
2. **Plugin split view:** the **Split** toggle in the view bar lays the page out with
   the reader's Hebrew on the left and the English on the right, inside the plugin
   panel. New pages open split by default (a Settings option).
3. **Host-app split pane:** Otzaria's `CombinedTab` can place the plugin tab beside
   a reader tab, but that split is user-driven; the plugin SDK does not expose a
   host-level split command. Settings names the host tab-menu action in English.
4. **Reader context menu:** the manifest contributes one action, **Translate
   selected passage**, which opens the selected passage on a new plugin page.
5. **Follow reader:** **Follow reader** subscribes to
   `reader.current_ref_changed`; turning it on also refreshes from
   `reader.getCurrentRef`. The handler normalizes the known title, id and
   reference payload variants and ignores events when follow mode is off.

The plugin does not replace Otzaria's Hebrew text pane. These app/SDK constraints
were checked against the host source; live WebView behaviour still needs a device.

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

## Packaging constraints

The historical Otzaria plugin-store limits were checked in the validator source:
50 MB archive, 1,024 entries, 150 MB expanded, and 16 MB per code entry, among
other constraints. The previous compact plugin met those limits, but the expanded
scope and new packs have not been built against the pinned export in this
workspace. Re-run `build/build_all.sh` and the official validator before release;
zero warnings are required.
