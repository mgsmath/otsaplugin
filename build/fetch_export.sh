#!/usr/bin/env bash
# Fetch the pinned Sefaria-Export-Archive checkout that build/pipeline.py reads.
#
# Usage:
#   build/fetch_export.sh [DEST] [COMMIT]
#
#   DEST    where to put the checkout   (default ref/Sefaria-Export-Archive)
#   COMMIT  which revision to check out (default build/sefaria-export.pin)
#
# Blobless + sparse, and deliberately narrow: only the work directories
# build/scope.py globs, plus the two Bavli tractates build/build_all.sh passes
# to --talmud. That is ~190 MB of JSON. All of json/Tanakh and json/Mishnah
# would be ~1.5 GB, and the extra ~1.35 GB is commentary (Rishonim, Acharonim,
# Targum, Modern Commentary) that the pipeline never opens — build/pipeline.py
# reads only <work>/English/*.json and <work>/Hebrew/merged.json, so the pack
# built from this narrow checkout is byte-for-byte the pack built from the wide
# one. Keep SPARSE_DIRS in step with STAGE_GLOBS in build/scope.py.
#
# The fetch is split one directory at a time so no single request has to carry
# the whole payload, and every step is retried — a partial-clone blob fetch is
# the one part of this build that depends on a flaky network.
#
# Idempotent: a checkout already at COMMIT with the sparse set applied is left
# alone, so it is safe to run before every build (and to restore from a CI
# cache). Nothing is ever written outside DEST.
#
# Environment:
#   SEFARIA_EXPORT_REPO  clone URL (default the public GitHub repo; override to
#                        point at a mirror or a local bare repo for testing)
#   FETCH_TRIES          attempts per step (default 5)
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${SEFARIA_EXPORT_REPO:-https://github.com/Sefaria/Sefaria-Export-Archive.git}"
PIN_FILE="build/sefaria-export.pin"
PINNED_COMMIT="$(awk '!/^#/ && NF >= 1 {print $1; exit}' "$PIN_FILE" 2>/dev/null || true)"
DEST="${1:-ref/Sefaria-Export-Archive}"
COMMIT="${2:-${PINNED_COMMIT:-3f1013631fdfe452e953a93a2c5f921319e394ed}}"
TRIES="${FETCH_TRIES:-5}"

SPARSE_DIRS=(
  "json/Tanakh/Torah"
  "json/Tanakh/Prophets"
  "json/Tanakh/Writings"
  "json/Mishnah/Seder Zeraim"
  "json/Mishnah/Seder Moed"
  "json/Mishnah/Seder Nashim"
  "json/Mishnah/Seder Nezikin"
  "json/Mishnah/Seder Kodashim"
  "json/Mishnah/Seder Tahorot"
  "json/Talmud/Bavli/Seder Zeraim/Berakhot"
  "json/Talmud/Bavli/Seder Moed/Shabbat"
)

log() { printf '[fetch] %s\n' "$*"; }

retry() {
  local label="$1"; shift
  local n=1
  while :; do
    if "$@"; then return 0; fi
    if [ "$n" -ge "$TRIES" ]; then
      echo "[fetch] error: $label failed after $n attempt(s)" >&2
      return 1
    fi
    n=$((n + 1))
    local wait=$((n * 10))
    echo "[fetch] warn: $label failed; retrying in ${wait}s (attempt $n/$TRIES)" >&2
    sleep "$wait"
  done
}

# A checkout is usable when it is at COMMIT and every sparse directory that
# exists in the tree is materialised on disk.
is_ready() {
  [ -d "$DEST/.git" ] || return 1
  local head
  head="$(git -C "$DEST" rev-parse HEAD 2>/dev/null || true)"
  [ -n "$head" ] || return 1
  [ "$head" = "$(git -C "$DEST" rev-parse --verify "$COMMIT^{commit}" 2>/dev/null || true)" ] || return 1
  local d
  for d in "${SPARSE_DIRS[@]}"; do
    if git -C "$DEST" cat-file -e "$COMMIT:$d" 2>/dev/null && [ ! -d "$DEST/$d" ]; then
      return 1
    fi
  done
  return 0
}

# Fail loudly if the checkout holds nothing the pipeline could build from — the
# difference between "the fetch worked" and "the fetch worked and is complete".
verify() {
  log "work directories visible to build/scope.py:"
  python3 - "$DEST" <<'PY'
import glob
import os
import sys

sys.path.insert(0, "build")
from scope import STAGE_GLOBS  # noqa: E402

root = sys.argv[1]
total = 0
for stage in ("tanakh", "mishnah", "talmud"):
    hits = set()
    for pattern in STAGE_GLOBS.get(stage, []):
        for d in glob.glob(os.path.join(root, pattern)):
            if os.path.isdir(os.path.join(d, "English")):
                hits.add(d)
    total += len(hits)
    print(f"[fetch]   {stage}: {len(hits)}")
if total == 0:
    raise SystemExit("[fetch] error: no buildable work directories — sparse checkout incomplete?")
print(f"[fetch]   total: {total}")
PY
}

if is_ready; then
  log "$DEST already at ${COMMIT:0:12} with the full sparse set; nothing to fetch"
  verify
  exit 0
fi

log "Sefaria export $REPO"
log "  dest   $DEST"
log "  commit $COMMIT"

if [ ! -d "$DEST/.git" ]; then
  mkdir -p "$(dirname "$DEST")"
  retry "clone (blobless)" git clone --filter=blob:none --no-checkout "$REPO" "$DEST"
fi

# Resilience for the on-demand blob fetches: a big post buffer, and a hard floor
# on transfer rate so a stalled fetch aborts and gets retried instead of hanging.
git -C "$DEST" config http.postBuffer 524288000
git -C "$DEST" config http.lowSpeedLimit 1000
git -C "$DEST" config http.lowSpeedTime 120

retry "sparse-checkout init" git -C "$DEST" sparse-checkout init --cone

# First directory only, then the commit — that keeps the initial blob fetch to a
# single tree instead of the whole sparse set at once.
retry "sparse-checkout set ${SPARSE_DIRS[0]}" \
  git -C "$DEST" sparse-checkout set "${SPARSE_DIRS[0]}"
retry "checkout $COMMIT" git -C "$DEST" checkout --detach "$COMMIT"

for dir in "${SPARSE_DIRS[@]:1}"; do
  # A directory the pinned tree does not have is not an error (the export
  # reorganises itself); it just has nothing to fetch.
  if ! git -C "$DEST" cat-file -e "$COMMIT:$dir" 2>/dev/null; then
    log "  skip $dir (not in this commit)"
    continue
  fi
  retry "sparse-checkout add $dir" git -C "$DEST" sparse-checkout add "$dir"
done

log "checkout complete: $(du -sh "$DEST" 2>/dev/null | cut -f1) in $DEST"
verify
