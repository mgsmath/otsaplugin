#!/usr/bin/env bash
# One-shot build for otsaplugin: data pipeline -> icon -> tests -> .otzplugin pack.
#
# Usage:
#   build/build_all.sh [path-to-Sefaria-Export-Archive] [--no-tests]
#
# The export defaults to ref/Sefaria-Export-Archive — build/fetch_export.sh
# fetches it (blobless + sparse clone of the pinned commit); see
# docs/CODESPACES.md for the manual equivalent.
#
# The Sefaria commit recorded in the pack/reports is read from the export
# checkout when it is a git repo, falling back to the pinned commit the
# shipped reports were built from.
#
# --no-tests (or SKIP_TESTS=1) skips step 3. The release workflow uses it: the
# pack it publishes is the same, it just does not re-run the golden suite.
set -euo pipefail
cd "$(dirname "$0")/.."

EXPORT_ROOT="ref/Sefaria-Export-Archive"
RUN_TESTS=1
if [ "${SKIP_TESTS:-0}" = "1" ]; then RUN_TESTS=0; fi

for arg in "$@"; do
  case "$arg" in
    --no-tests) RUN_TESTS=0 ;;
    --tests) RUN_TESTS=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    -*) echo "error: unknown option '$arg' (try --help)" >&2; exit 2 ;;
    *) EXPORT_ROOT="$arg" ;;
  esac
done

PIN_FILE="build/sefaria-export.pin"
PINNED_COMMIT="$(awk '!/^#/ && NF >= 1 {print $1; exit}' "$PIN_FILE" 2>/dev/null || true)"
PINNED_DATE="$(awk '!/^#/ && NF >= 2 {print $2; exit}' "$PIN_FILE" 2>/dev/null || true)"
PINNED_COMMIT="${PINNED_COMMIT:-3f1013631fdfe452e953a93a2c5f921319e394ed}"
PINNED_DATE="${PINNED_DATE:-2026-03-23}"

if [ ! -d "$EXPORT_ROOT/json" ]; then
  echo "error: no Sefaria export at '$EXPORT_ROOT' (expected a json/ directory inside)" >&2
  echo "Fetch it first — the narrow sparse checkout the build actually needs:" >&2
  echo "  build/fetch_export.sh $EXPORT_ROOT" >&2
  echo "or by hand (all of Tanakh and Mishnah, ~1.5 GB):" >&2
  echo "  git clone --filter=blob:none --no-checkout https://github.com/Sefaria/Sefaria-Export-Archive.git $EXPORT_ROOT" >&2
  echo "  git -C $EXPORT_ROOT sparse-checkout init --cone" >&2
  echo "  git -C $EXPORT_ROOT sparse-checkout set json/Tanakh json/Mishnah \\\\" >&2
  echo "    'json/Talmud/Bavli/Seder Zeraim/Berakhot' 'json/Talmud/Bavli/Seder Moed/Shabbat'" >&2
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

echo "==> [1/4] data pipeline (Sefaria export -> plugin/data + dist/pack, reports/)"
python3 build/pipeline.py \
  --export-root "$EXPORT_ROOT" \
  --out dist/pack --plugin-data plugin/data --reports reports \
  --stages tanakh,mishnah,talmud --talmud Berakhot,Shabbat \
  --policy open --commit "$COMMIT" --commit-date "$COMMIT_DATE"

echo "==> [2/4] icon"
python3 build/make_icon.py

if [ "$RUN_TESTS" = "1" ]; then
  echo "==> [3/4] test suite"
  node tests/run_tests.js --export-root "$EXPORT_ROOT"
else
  echo "==> [3/4] test suite (skipped)"
fi

echo "==> [4/4] pack"
python3 build/pack_plugin.py

echo
echo "Done. Distributable: dist/otsaplugin.otzplugin"
