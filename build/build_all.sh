#!/usr/bin/env bash
# Build the compact plugin library plus a complete, separately importable library,
# then package the full plugin and the compact-only Lite plugin.
#
# Usage:
#   build/build_all.sh [path-to-Sefaria-Export-Archive] [--no-tests]
#
# The export defaults to ref/Sefaria-Export-Archive; build/fetch_export.sh
# fetches it (blobless, sparse, pinned). See docs/CODESPACES.md for the manual
# equivalent.
#
# The Sefaria commit recorded in the packs and reports is read from the export
# checkout when it is a git repo, falling back to build/sefaria-export.pin.
#
# --no-tests (or SKIP_TESTS=1) skips step 5. The release workflow uses it: the
# libraries it publishes are identical, it just does not re-run the golden suite.
set -euo pipefail
cd "$(dirname "$0")/.."

EXPORT_ROOT="ref/Sefaria-Export-Archive"
RUN_TESTS=1
if [ "${SKIP_TESTS:-0}" = "1" ]; then RUN_TESTS=0; fi

for arg in "$@"; do
  case "$arg" in
    --no-tests) RUN_TESTS=0 ;;
    --tests) RUN_TESTS=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "error: unknown option '$arg' (try --help)" >&2; exit 2 ;;
    *) EXPORT_ROOT="$arg" ;;
  esac
done

PIN_FILE="build/sefaria-export.pin"
PINNED_COMMIT="$(awk '!/^#/ && NF >= 1 {print $1; exit}' "$PIN_FILE" 2>/dev/null || true)"
PINNED_DATE="$(awk '!/^#/ && NF >= 2 {print $2; exit}' "$PIN_FILE" 2>/dev/null || true)"
PINNED_COMMIT="${PINNED_COMMIT:-3f1013631fdfe452e953a93a2c5f921319e394ed}"
PINNED_DATE="${PINNED_DATE:-2026-03-23}"
ALL_STAGES="tanakh,mishnah,talmud,halakhah,musar,siddur"
CORE_STAGES="tanakh,mishnah,talmud"

if [ ! -d "$EXPORT_ROOT/json" ]; then
  echo "error: no Sefaria export at '$EXPORT_ROOT' (expected a json/ directory inside)" >&2
  echo "Fetch it first — build/fetch_export.sh pulls only what the pipeline reads:" >&2
  echo "  build/fetch_export.sh $EXPORT_ROOT" >&2
  echo "or by hand (all five roots, ~4.7 GB):" >&2
  echo "  git clone --filter=blob:none --no-checkout https://github.com/Sefaria/Sefaria-Export-Archive.git $EXPORT_ROOT" >&2
  echo "  git -C $EXPORT_ROOT sparse-checkout init --cone" >&2
  echo "  git -C $EXPORT_ROOT sparse-checkout set json/Tanakh json/Mishnah json/Talmud json/Halakhah json/Musar" >&2
  echo "  git -C $EXPORT_ROOT checkout $PINNED_COMMIT" >&2
  echo "Full walkthrough: docs/CODESPACES.md" >&2
  exit 1
fi

COMMIT="$PINNED_COMMIT"
COMMIT_DATE="$PINNED_DATE"
if git -C "$EXPORT_ROOT" rev-parse HEAD >/dev/null 2>&1; then
  COMMIT="$(git -C "$EXPORT_ROOT" rev-parse HEAD)"
  COMMIT_DATE="$(git -C "$EXPORT_ROOT" log -1 --format=%cs HEAD)"
fi

echo "==> [1/6] compact library (full Tanakh, Mishnah, and Talmud)"
python3 build/pipeline.py \
  --export-root "$EXPORT_ROOT" \
  --out dist/pack --plugin-data plugin/data --reports reports \
  --stages "$CORE_STAGES" --policy open \
  --commit "$COMMIT" --commit-date "$COMMIT_DATE"

echo "==> [2/6] extended library (Halakhah, Mishneh Torah, Musar, Siddur, commentaries, and all available Talmud)"
rm -rf dist/full-data
python3 build/pipeline.py \
  --export-root "$EXPORT_ROOT" \
  --out dist/extended-pack --reports dist/extended-reports \
  --plugin-data dist/full-data --no-fidelity --stages "$ALL_STAGES" --policy open \
  --commit "$COMMIT" --commit-date "$COMMIT_DATE"

echo "==> [3/6] create range-readable extended .otzenpack"
python3 build/make_otzenpack.py --pack-dir dist/extended-pack --out dist/otsaplugin-extended.otzenpack

echo "==> [4/6] icon"
python3 build/make_icon.py

if [ "$RUN_TESTS" = "1" ]; then
  echo "==> [5/6] test suite"
  node tests/run_tests.js --export-root "$EXPORT_ROOT"
else
  echo "==> [5/6] test suite (skipped)"
fi

echo "==> [6/6] plugin archives (full = compact + extended built in, and lite = compact library only)"
python3 build/pack_plugin.py --edition full --data-dir dist/full-data --out dist/otsaplugin.otzplugin
python3 build/pack_plugin.py --edition lite --out dist/otsaplugin-lite.otzplugin

echo
echo "Done. Install dist/otsaplugin.otzplugin in Otzaria (or dist/otsaplugin-lite.otzplugin for the compact-only Lite build)."
echo "The full plugin already contains the extended library. dist/otsaplugin-extended.otzenpack"
echo "is still written for users who import a library from Settings."
