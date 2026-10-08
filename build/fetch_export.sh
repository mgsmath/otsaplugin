#!/usr/bin/env bash
# Fetch the pinned Sefaria-Export-Archive checkout that build/pipeline.py reads.
#
# Usage:
#   build/fetch_export.sh [DEST] [COMMIT]
#
#   DEST    where to put the checkout   (default ref/Sefaria-Export-Archive)
#   COMMIT  which revision to check out (default build/sefaria-export.pin)
#
# Blobless, and sparse in the non-cone sense: the patterns match only the two
# kinds of file the pipeline opens — every <work>/English/*.json and every
# <work>/Hebrew/merged.json — under the roots build/scope.py declares. Measured
# against the pinned commit, that is 2.3 GB where checking out all five roots
# would be 4.7 GB, and the difference is Hebrew per-version files, Targum,
# Aramaic and other languages the pipeline never reads. The roots come from
# scope.py at run time, so widening the build widens this fetch with it.
#
# The fetch is applied one root at a time so no single on-demand blob request
# has to carry the whole payload, and every step is retried: a partial-clone
# blob fetch is the one part of this build that depends on a flaky network.
#
# Idempotent and self-verifying. Before fetching anything it asks git which
# paths the pinned tree holds under those roots and compares that with what is
# on disk, so a restored CI cache that is missing files is repaired rather than
# trusted — including Hebrew/merged.json, whose absence the pipeline would
# otherwise absorb silently as "no Hebrew available".
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

# The export roots the build reads, straight from build/scope.py.
mapfile -t ROOTS < <(python3 -c '
import sys
sys.path.insert(0, "build")
from scope import STAGE_GLOBS, STAGE_ORDER
seen = []
for stage in STAGE_ORDER:
    for root in STAGE_GLOBS.get(stage, []):
        if root not in seen:
            seen.append(root)
print("\n".join(seen))
')
if [ "${#ROOTS[@]}" -eq 0 ]; then
  echo "[fetch] error: build/scope.py declares no export roots" >&2
  exit 1
fi

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

# Write the sparse-checkout patterns for the roots given so far. Non-cone, so
# these are gitignore-style: a leading / anchors at the repository root and **
# crosses category directories.
write_patterns() {
  local sparse="$DEST/.git/info/sparse-checkout"
  mkdir -p "$(dirname "$sparse")"
  : > "$sparse"
  local root
  for root in "$@"; do
    printf '/%s/**/English/\n' "$root" >> "$sparse"
    printf '/%s/**/Hebrew/merged.json\n' "$root" >> "$sparse"
  done
}

# Compare the pinned tree with the working directory. Exit non-zero when
# anything the pipeline could read is missing. With --quiet it only reports
# through the exit code, so it can be used as a readiness test.
audit() {
  local quiet="${1:-}"
  DEST="$DEST" COMMIT="$COMMIT" QUIET="$quiet" python3 - "${ROOTS[@]}" <<'PY'
import fnmatch
import os
import subprocess
import sys

dest = os.environ["DEST"]
commit = os.environ["COMMIT"]
quiet = os.environ.get("QUIET") == "--quiet"
roots = sys.argv[1:]


def say(msg):
    if not quiet:
        print(msg)


def tracked(pattern):
    """Every path in the pinned tree matching a gitignore-style pathspec."""
    out = subprocess.run(
        ["git", "-C", dest, "ls-files", "--", ":(glob)" + pattern],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line for line in out.splitlines() if line.strip()]


missing_total = 0
for root in roots:
    for pattern in (f"{root}/**/English/*.json", f"{root}/**/Hebrew/merged.json"):
        want = tracked(pattern)
        have = [p for p in want if os.path.exists(os.path.join(dest, p))]
        missing = len(want) - len(have)
        missing_total += missing
        label = "English/*.json" if pattern.endswith("*.json") else "Hebrew/merged.json"
        say(f"[fetch]   {root:16s} {label:18s} {len(have):6d}/{len(want):<6d}"
            + (f"  MISSING {missing}" if missing else ""))

if missing_total:
    print(f"[fetch] error: {missing_total} file(s) the pipeline reads are missing "
          f"from {dest}", file=sys.stderr)
    sys.exit(1)
say("[fetch]   complete: every file the pipeline reads is on disk")
PY
}

# What the build will actually find, counted by the build's own discovery code.
report_works() {
  log "works visible to build/pipeline.py:"
  DEST="$DEST" python3 - <<'PY'
import os
import sys

sys.path.insert(0, "build")
from pipeline import discover_book_dirs  # noqa: E402
from scope import STAGE_ORDER  # noqa: E402

dest = os.environ["DEST"]
total = 0
for stage in STAGE_ORDER:
    rows = discover_book_dirs(dest, [stage], None)
    total += len(rows)
    print(f"[fetch]   {stage}: {len(rows)}")
if total == 0:
    raise SystemExit("[fetch] error: no buildable work directories — sparse checkout incomplete?")
print(f"[fetch]   total: {total}")
PY
}

head_matches() {
  [ -d "$DEST/.git" ] || return 1
  local head
  head="$(git -C "$DEST" rev-parse HEAD 2>/dev/null || true)"
  [ -n "$head" ] || return 1
  [ "$head" = "$(git -C "$DEST" rev-parse --verify "$COMMIT^{commit}" 2>/dev/null || true)" ]
}

if head_matches && audit --quiet >/dev/null 2>&1; then
  log "$DEST already complete at ${COMMIT:0:12}; nothing to fetch"
  report_works
  exit 0
fi

log "Sefaria export $REPO"
log "  dest   $DEST"
log "  commit $COMMIT"
log "  roots  ${ROOTS[*]}"

if [ ! -d "$DEST/.git" ]; then
  mkdir -p "$(dirname "$DEST")"
  retry "clone (blobless)" git clone --filter=blob:none --no-checkout "$REPO" "$DEST"
fi

# Resilience for the on-demand blob fetches: a big post buffer, and a hard floor
# on transfer rate so a stalled fetch aborts and gets retried instead of hanging.
git -C "$DEST" config http.postBuffer 524288000
git -C "$DEST" config http.lowSpeedLimit 1000
git -C "$DEST" config http.lowSpeedTime 120
git -C "$DEST" config core.sparseCheckout true
git -C "$DEST" config core.sparseCheckoutCone false

# First root, then the commit: that keeps the initial blob fetch to one root
# instead of the whole sparse set at once.
write_patterns "${ROOTS[0]}"
retry "checkout $COMMIT (${ROOTS[0]})" git -C "$DEST" checkout --detach "$COMMIT"

# Apply the remaining roots one at a time, each its own fetch.
idx=1
while [ "$idx" -lt "${#ROOTS[@]}" ]; do
  root="${ROOTS[$idx]}"
  write_patterns "${ROOTS[@]:0:$((idx + 1))}"
  retry "sparse-checkout $root" git -C "$DEST" sparse-checkout reapply
  idx=$((idx + 1))
done

log "checkout complete: $(du -sh "$DEST" 2>/dev/null | cut -f1) in $DEST"
audit
report_works
