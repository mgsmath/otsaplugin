# Building in GitHub Codespaces

This repository uses the standard-library Python build tools and a dependency-free
Node test suite. The dev container includes Python 3 and Node.js.

## 1. Open the codespace

Create a codespace for this branch or reopen the repository in a Dev Container.

## 2. Fetch the Sefaria export

The build reads a local checkout of
[Sefaria-Export-Archive](https://github.com/Sefaria/Sefaria-Export-Archive); it does
not download text at runtime. The expanded library scans all English-bearing work
directories under Tanakh, Mishnah, Talmud, Halakhah and Musar. One script fetches
the pinned commit, retries the parts that depend on the network, and reports what
landed:

```sh
build/fetch_export.sh          # -> ref/Sefaria-Export-Archive
```

It reads the roots from `build/scope.py`, so widening the build widens the fetch
with it, and it pulls only the two kinds of file `build/pipeline.py` opens —
every `<work>/English/*.json` and each work's `Hebrew/merged.json`. Measured
against the pinned commit that is **2.3 GB / ~9,900 files**, where checking out
all five roots is **4.7 GB / ~16,300 files**; the difference is Hebrew
per-version files, Targum and other languages the pipeline never reads, so the
libraries are identical either way. It finishes by auditing the checkout against
the pinned tree, which is also why it is safe to re-run and safe to restore from
a CI cache.

The equivalent by hand, if you want everything under those roots:

```sh
git clone --filter=blob:none --no-checkout \
  https://github.com/Sefaria/Sefaria-Export-Archive.git ref/Sefaria-Export-Archive
git -C ref/Sefaria-Export-Archive sparse-checkout init --cone
git -C ref/Sefaria-Export-Archive sparse-checkout set \
  json/Tanakh json/Mishnah json/Talmud json/Halakhah json/Musar
git -C ref/Sefaria-Export-Archive checkout 3f1013631fdfe452e953a93a2c5f921319e394ed
```

The pinned commit lives in `build/sefaria-export.pin`, shared by
`build/fetch_export.sh` and `build/build_all.sh`. `ref/` is gitignored and never
enters the repository history.

## 3. Build, test and pack

```sh
./build/build_all.sh
```

The build creates two libraries:

1. A compact built-in plugin library with the full Tanakh, Mishnah and Talmud
   export sections, subject to available English text.
2. `dist/otsaplugin-extended.otzenpack`, a separately importable library that
   also includes English text from Halakhah (including Mishneh Torah/Rambam and
   Mishnah Berurah), Musar, and nested commentaries where the export has usable
   English text.

The extended library is kept outside the `.otzplugin` archive so large sets of
commentaries do not run into the app store's plugin-size limits. After installing
the plugin, open **Settings → Translation data → Load an extended .otzenpack
library** and choose the generated file.

`build/build_all.sh` runs the equivalent of:

```sh
# Compact built-in data: every eligible work under Tanakh, Mishnah and Talmud.
python3 build/pipeline.py --export-root ref/Sefaria-Export-Archive \
  --out dist/pack --plugin-data plugin/data --reports reports \
  --stages tanakh,mishnah,talmud --policy open \
  --commit 3f1013631fdfe452e953a93a2c5f921319e394ed --commit-date 2026-03-23

# Complete import library: includes all supported export roots; no script wrappers.
python3 build/pipeline.py --export-root ref/Sefaria-Export-Archive \
  --out dist/extended-pack --reports dist/extended-reports \
  --no-plugin-scripts --no-fidelity \
  --stages tanakh,mishnah,talmud,halakhah,musar --policy open \
  --commit 3f1013631fdfe452e953a93a2c5f921319e394ed --commit-date 2026-03-23
python3 build/make_otzenpack.py \
  --pack-dir dist/extended-pack --out dist/otsaplugin-extended.otzenpack

python3 build/make_icon.py
node tests/run_tests.js --export-root ref/Sefaria-Export-Archive
python3 build/pack_plugin.py
```

The `open` build policy includes English versions that are cleared for
redistribution. Books or passages with no eligible English text remain absent;
the plugin displays a neutral “no translation available” message. The pipeline
keeps the required source metadata internally and does not expose a credits or
licence browser in the reader UI.

## 4. Validate

The official [Otzaria plugin validator](https://github.com/Otzaria/otzaria-plugin-validator)
is dependency-free. Zero errors and zero warnings are required before shipping,
and the release workflow refuses to publish a pack that fails it:

```sh
git clone --depth 1 https://github.com/Otzaria/otzaria-plugin-validator.git /tmp/otzaria-plugin-validator
node /tmp/otzaria-plugin-validator/src/cli.js plugin --fail-on-warnings
```

It enforces the store's limits as well as the code — among them that the plugin
`name` is at most 14 characters and identical to `contributes.toolTab.title`.

## 5. Download the plugin

Download `dist/otsaplugin.otzplugin` from the Codespaces Explorer and install it in
Otzaria (Settings → Plugins → install from file). The extended `.otzenpack` can be
selected later from the plugin's Settings panel.

Both files are attached to every
[release](https://github.com/mgsmath/otsaplugin/releases), so a codespace build is
only needed when you are changing the build itself — see [RELEASES.md](RELEASES.md).

## Notes

- The export checkout, `dist/`, and generated `plugin/data/` are gitignored.
- The plugin itself works offline and declares no network permission.
- The UI follows English/LTR regardless of the host app's locale; Hebrew source
  text remains RTL.
