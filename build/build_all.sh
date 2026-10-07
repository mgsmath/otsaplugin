#!/usr/bin/env bash
# Build the compact plugin library plus a complete, separately importable library.
#
# Usage:
#   build/build_all.sh [path-to-Sefaria-Export-Archive]
set -euo pipefail
cd "$(dirname "$0")/.."

EXPORT_ROOT="${1:-ref/Sefaria-Export-Archive}"
PINNED_COMMIT="3f1013631fdfe452e953a93a2c5f921319e394ed"
PINNED_DATE="2026-03-23"
ALL_STAGES="tanakh,mishnah,talmud,halakhah,musar"
CORE_STAGES="tanakh,mishnah,talmud"

if [ ! -d "$EXPORT_ROOT/json" ]; then
  echo "error: no Sefaria export at '$EXPORT_ROOT' (expected a json/ directory inside)" >&2
  echo "Fetch it first, e.g.:" >&2
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

echo "==> [2/6] extended library (Halakhah, Mishneh Torah, Musar, commentaries, and all available Talmud)"
python3 build/pipeline.py \
  --export-root "$EXPORT_ROOT" \
  --out dist/extended-pack --reports dist/extended-reports \
  --no-plugin-scripts --no-fidelity --stages "$ALL_STAGES" --policy open \
  --commit "$COMMIT" --commit-date "$COMMIT_DATE"

echo "==> [3/6] create range-readable extended .otzenpack"
python3 build/make_otzenpack.py --pack-dir dist/extended-pack --out dist/otsaplugin-extended.otzenpack

echo "==> [4/6] icon"
python3 build/make_icon.py

echo "==> [5/6] test suite"
node tests/run_tests.js --export-root "$EXPORT_ROOT"

echo "==> [6/6] plugin archive"
python3 build/pack_plugin.py

echo
echo "Done. Install dist/otsaplugin.otzplugin in Otzaria."
echo "Then choose Settings > Translation data > Load an extended .otzenpack library"
echo "and select dist/otsaplugin-extended.otzenpack for the full library."
