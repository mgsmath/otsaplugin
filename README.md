# English translations for Otzaria

An offline Otzaria plugin that displays available English translations alongside
texts in the reader. The plugin interface is always English and left-to-right,
regardless of Otzaria's language setting; Hebrew source text remains right-to-left.

## Reader features

- Five reading layouts: English only, **side by side**, interleaved, flowing,
  and Tap to reveal. Side by side pairs passage with passage: verse 10's English
  is a row with verse 10's Hebrew, all the way down the chapter or daf.
- **Several English pages.** Each page has its own text, reference and view,
  shown as a tab. **+ New page** opens the reader's current location on a new
  page. With **Follow reader** off, every page stays where it was.
- **Split view.** With **Open new pages in split view** on in Settings (the
  default), a new page opens in Otzaria's own split view: the reader on the left,
  the English on the right. The English side starts on **English only**. The
  page that opens when the plugin starts is not split. See the split view note.
- The reader context-menu action **Translate selected passage** opens the passage
  on a new page, split beside the reader when the Settings option is on. It shows
  the whole chapter or daf, scrolled to and outlined, rather than a cut-down
  window of nearby passages.
- **Follow reader** keeps the active page in step with the reader's current
  reference. **Reader** opens the page's text in the reader at its reference.
- The top bar, page tabs and view bar have no scroll bar: when they do not fit,
  press the mouse on them and drag, or use the wheel.
- Hebrew alignment failures are handled quietly. The plugin never re-splits an
  uncertain Hebrew match: it uses packed Hebrew where available, pairs verses
  only when Otzaria's text matches the pack letter for letter, and otherwise
  shows the section in one row instead of pairing the wrong verses.
- Works offline after the translation data is installed. The plugin requests no
  network permission.

## Text coverage

The build recursively scans all English-bearing works under the Sefaria export's
Tanakh, Mishnah, Talmud, Halakhah, Musar and Liturgy/Siddur sections. This includes Bavli and
Yerushalmi, nested Tanakh and Mishnah commentaries, Mishneh Torah/Rambam,
Mishnah Berurah, and other Halakhah/Musar texts where eligible English versions
exist.

`build/build_all.sh` produces:

1. A compact built-in library covering the Tanakh, Mishnah and Talmud sections.
2. `dist/otsaplugin-extended.otzenpack`, an importable expanded library with the
   Halakhah, Musar, Siddur (Liturgy/Siddur) and nested commentary texts as well.
3. `dist/otsaplugin.otzplugin`, the default plugin with the compact library built in.
4. `dist/otsaplugin-lite.otzplugin`, **English Lite**: the same plugin with only the
   compact library. It has its own plugin id, so it installs alongside the default
   one, and its Settings have no extended-library controls.

Install the plugin, then open **Settings → Translation data → Load an extended
.otzenpack library** and select the expanded file to use the full library. A text
can only be translated when an English version exists in the export and is
available for redistribution; missing text is reported simply as unavailable.

The reader UI no longer has a source/licence browser or per-passage source list.
The build still filters translations and retains their source metadata internally
so the distributed data is not assembled from versions that are unknown or not
cleared for redistribution. Detailed build reports remain in `reports/` for
maintainers.

## Build, test, pack

> **GitHub Codespaces:** the repo includes a Python + Node dev container. Fetch the
> Sefaria export into `ref/`, then run `./build/build_all.sh`. See
> [docs/CODESPACES.md](docs/CODESPACES.md).

```sh
# Fetch the pinned Sefaria export into ref/ — blobless and sparse, ~2.3 GB of
# the ~4.7 GB the five roots hold, because it pulls only the files the pipeline
# opens (every English/ version and each work's Hebrew/merged.json).
build/fetch_export.sh

# Build compact and expanded libraries, run tests, and package the plugin.
./build/build_all.sh

# Or run the data pipeline directly for any supported subset.
python3 build/pipeline.py --export-root ref/Sefaria-Export-Archive \
  --out dist/extended-pack --no-plugin-scripts \
  --stages tanakh,mishnah,talmud,halakhah,musar --policy open
python3 build/make_otzenpack.py \
  --pack-dir dist/extended-pack --out dist/otsaplugin-extended.otzenpack

# Tests use the generated plugin data when present and a small in-memory pack otherwise.
node tests/run_tests.js --export-root ref/Sefaria-Export-Archive
```

Generated `plugin/data/`, `dist/`, and the local export checkout are gitignored.

## Releases

Merging a pull request into `main` builds both libraries and publishes a
[GitHub release](https://github.com/mgsmath/otsaplugin/releases) with them.
Version numbers come from the repository's tags: the first release keeps the
version `plugin/manifest.json` already declares, and every release after that
bumps the patch component by one (`v1.1.0`, `v1.1.1`, … `v1.1.9`, `v1.1.10`).
The chosen number is stamped into the manifest and that one-line bump is
committed back to `main`, so the repository always shows the released version.

Nothing is published unless the build succeeded **and** the official Otzaria
plugin validator passes with `--fail-on-warnings` — a merge that breaks either
costs a failed job, not a broken release. Assets are the `.otzplugin`, the
extended `.otzenpack`, both report sets and their checksums; the release body is
read back out of the build that produced it. **Actions → Release → Run
workflow** cuts one by hand. Details: [docs/RELEASES.md](docs/RELEASES.md).

## Split view note

Split view uses Otzaria's own split pane: the plugin calls `reader.openBook` with
`openInSidePane`, which needs Otzaria 0.9.97 or later (the manifest's
`minAppVersion`). The plugin has no split view of its own; the five layouts are
the same beside the reader as anywhere else.

- The reader beside a new page is a reader tab for that text. A reader tab for the
  same text that is already open elsewhere stays where it is, so the text can
  appear twice.
- A reader already beside the plugin is reused when it shows the same text: its
  pane moves to the passage. When it shows a different text, the new page opens
  without a reader, and the page says why.
- Otzaria shows one reader pane beside the plugin tab, and the plugin cannot read
  the layout directly. It works the layout out from the open tabs and their lines,
  so a split the user made in another tab, or a separate tab on the same text at the
  same line, can be mistaken for the plugin's reader.
- If Otzaria refuses the split, the page falls back to its ordinary view and a
  warning says so.
- The page that opens when the plugin starts is never split. Otzaria opens a split
  beside the current tab only, and the plugin may start out of view.

## Project layout

```text
.github/  the release workflow: merged PR -> build -> validator -> release
build/    Sefaria export pipeline, recursive category discovery, pack writers,
          export fetch, versioning and release notes
plugin/   the Otzaria plugin UI, runtime, styles and manifest
tests/    Node VM test harness and Python bridge
reports/  generated coverage, merge and source-policy reports
docs/     mapping, build, redistribution and release notes
```
