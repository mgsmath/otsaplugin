# Building in GitHub Codespaces

This repo ships a dev container (`.devcontainer/devcontainer.json`) with Python 3
and Node.js preinstalled. The build scripts are standard-library Python and
dependency-free Node — there is nothing to `pip install` or `npm install` in
this repo.

## 1. Open the codespace

- On GitHub: **Code ▾ → Codespaces → Create codespace** (pick your branch), or
- In VS Code on your machine: *Dev Containers: Reopen in Container*.

The first boot builds the container (a minute or two). Everything below runs in
the integrated terminal.

## 2. Fetch the Sefaria export (the only input)

The pipeline reads a local checkout of
[Sefaria-Export-Archive](https://github.com/Sefaria/Sefaria-Export-Archive)
(~8 GB of full history) and never downloads anything itself. One script fetches
the pinned commit, blobless and sparse, and retries the parts that depend on the
network:

```sh
build/fetch_export.sh          # -> ref/Sefaria-Export-Archive, ~190 MB
```

It pulls only the work directories `build/scope.py` globs — Tanakh Torah,
Prophets and Writings, the six Mishnah sedarim, and Bavli Berakhot and Shabbat —
and ends by reporting how many buildable work directories landed. All of
`json/Tanakh` and `json/Mishnah` would be ~1.5 GB; the ~1.35 GB difference is
commentary (Rishonim, Acharonim, Targum, Modern) that `build/pipeline.py` never
opens, so the pack is identical either way. It is idempotent, so it is safe to
re-run — that is also what the release workflow does before every build.

The equivalent by hand, if you want the wider scope:

```sh
git clone --filter=blob:none --no-checkout \
  https://github.com/Sefaria/Sefaria-Export-Archive.git ref/Sefaria-Export-Archive
git -C ref/Sefaria-Export-Archive sparse-checkout init --cone
git -C ref/Sefaria-Export-Archive sparse-checkout set \
  json/Tanakh json/Mishnah \
  "json/Talmud/Bavli/Seder Zeraim/Berakhot" \
  "json/Talmud/Bavli/Seder Moed/Shabbat"
git -C ref/Sefaria-Export-Archive checkout 3f1013631fdfe452e953a93a2c5f921319e394ed
```

The pinned commit lives in `build/sefaria-export.pin` and is the one the shipped
`reports/` were built from; checking it out reproduces the shipped pack exactly.
Want a different scope? Add directories to `SPARSE_DIRS` in `build/fetch_export.sh`
(or to `sparse-checkout set` above) and pass more tractates to `--talmud`
(or drop `--talmud` for all of Bavli).

`ref/` is gitignored — the export never lands in this repo's git history.

## 3. Build, test, pack — one command

```sh
./build/build_all.sh
```

This runs, in order:

1. `python3 build/pipeline.py …` — Sefaria export → `plugin/data/` + `dist/pack/`,
   and rewrites `reports/` (licences, coverage, size, merge fidelity)
2. `python3 build/make_icon.py` — regenerates `plugin/icon/icon.png`
3. `node tests/run_tests.js --export-root ref/Sefaria-Export-Archive` —
   the golden test suite, driving the real shipped JS and Python
4. `python3 build/pack_plugin.py` — zips `plugin/` into `dist/otsaplugin.otzplugin`

The script records the Sefaria commit your export is actually checked out at
(falling back to the pinned one), so `reports/` always reflect what was built.
The step-by-step equivalent — same flags as the README — is:

```sh
python3 build/pipeline.py --export-root ref/Sefaria-Export-Archive \
  --out dist/pack --plugin-data plugin/data --reports reports \
  --stages tanakh,mishnah,talmud --talmud Berakhot,Shabbat \
  --policy open --commit 3f1013631fdfe452e953a93a2c5f921319e394ed --commit-date 2026-03-23
python3 build/make_icon.py
node tests/run_tests.js --export-root ref/Sefaria-Export-Archive
python3 build/pack_plugin.py
```

## 4. Validate (optional but recommended)

The official [Otzaria plugin validator](https://github.com/Otzaria/otzaria-plugin-validator)
is dependency-free — clone it and run it against the packed plugin:

```sh
git clone --depth 1 https://github.com/Otzaria/otzaria-plugin-validator.git /tmp/otzaria-plugin-validator
node /tmp/otzaria-plugin-validator/src/cli.js plugin --fail-on-warnings
```

Zero errors and zero warnings is required before shipping.

## 5. Get the `.otzplugin` out of the codespace

`dist/otsaplugin.otzplugin` is a plain ZIP. Right-click it in the Explorer →
**Download**, then install it in Otzaria (Settings → Plugins → install from
file). Any other way of moving a file out of the codespace works too.

Or skip the codespace: merging a pull request into `main` builds the pack and
publishes it as a [GitHub release](https://github.com/mgsmath/otsaplugin/releases)
— see [RELEASES.md](RELEASES.md).

## Gotchas

- **Always pass `--export-root`.** The test runner's built-in default is
  `/home/user/ref/Sefaria-Export-Archive` — a local-dev path. In a codespace
  the home directory is `/home/codespace`, so the default silently misses and
  the merge-fidelity test skips itself. `build/build_all.sh` passes it for you.
- **Generated directories are gitignored:** `ref/`, `dist/`, `plugin/data/`.
  Nothing the build produces should ever be committed.
- **The plugin itself needs no network** (`"network": {"enabled": false}` in
  `plugin/manifest.json`); the codespace's network is only used for the clones
  above.
- The dev container hides `ref/`, `dist/` and `plugin/data/` from the Explorer
  and from search, so the huge export checkout doesn't drown the workspace.
