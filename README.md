# English translations for Otzaria

An offline Otzaria plugin that displays available English translations alongside
texts in the reader. The plugin interface is always English and left-to-right,
regardless of Otzaria's language setting; Hebrew source text remains right-to-left.

## Reader features

- Five reading layouts: English only, **side by side**, interleaved, flowing,
  and Tap to reveal. Side by side pairs passage with passage: verse 10's English
  is a row with verse 10's Hebrew, all the way down the chapter or daf.
- A **Translate** button refreshes the current reader location; **Split view**
  immediately opens the Hebrew/English side-by-side layout.
- Two reader context-menu actions: **Translate selected passage** and
  **Translate side by side**. Both show the passage in its whole chapter or daf,
  scrolled to and outlined, rather than a cut-down window of nearby passages.
- **Follow reader** refreshes the translation as the current reference changes.
  **Open in reader** uses the reader's actual book id and reference.
- Hebrew alignment failures are handled quietly. The plugin never re-splits an
  uncertain Hebrew match: it uses packed Hebrew where available, pairs verses
  only when Otzaria's text matches the pack letter for letter, and otherwise
  shows the section in one row instead of pairing the wrong verses.
- Works offline after the translation data is installed. The plugin requests no
  network permission.

## Text coverage

The build recursively scans all English-bearing works under the Sefaria export's
Tanakh, Mishnah, Talmud, Halakhah and Musar sections. This includes Bavli and
Yerushalmi, nested Tanakh and Mishnah commentaries, Mishneh Torah/Rambam,
Mishnah Berurah, and other Halakhah/Musar texts where eligible English versions
exist.

`build/build_all.sh` produces:

1. A compact built-in library covering the Tanakh, Mishnah and Talmud sections.
2. `dist/otsaplugin-extended.otzenpack`, an importable expanded library with the
   Halakhah, Musar, and nested commentary texts as well.

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

## Split-pane note

The plugin's **Split view** button lays the translation panel out one row per
passage, Hebrew on one side and English on the other. Otzaria's separate
`CombinedTab` split-pane layout is controlled
by the host app's tab menu; the plugin SDK currently does not expose a method to
create that host-level split automatically. The Settings panel gives the exact
host-menu action.

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
