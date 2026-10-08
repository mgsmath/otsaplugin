# Implementation report — verified and unverified

The expanded build targets Sefaria-Export-Archive commit
`3f1013631fdfe452e953a93a2c5f921319e394ed` (2026-03-23), using the default
`open` redistribution policy. The full pinned export is **not present** in this
workspace.

## Verified by running in this workspace

- **JavaScript tests:** `node tests/run_tests.js` — **146 passed, 0 failed**. The
  suite loads the shipped runtime in a Node VM and uses a small in-memory pack
  when generated `plugin/data/` files are absent.
- **Python syntax:** `python3 -m py_compile build/*.py tests/py_bridge.py` passes.
- **Nested scope fixtures:** recursive discovery covers Tanakh, Mishnah, Talmud,
  Halakhah and Musar; the build fixture includes a nested Rashi work, Mishnah
  Berurah and Mishneh Torah/Rambam.
- **Nested text handling:** tests confirm address-preserving path flattening,
  path-based fallback merging, group metadata for comments, and inferred
  `verse`, `siman` and `halakha` schemas.
- **Extended pack format:** the writer emits the JSON byte-range index and
  12-digit footer. The runtime importer successfully reads a generated fixture
  `.otzenpack`, loads its manifest, then loads a work chunk.
- **Reader/UI behavior:** tests cover the English/LTR interface under a Hebrew
  host locale; several pages with their own content; split view (reader left,
  English right) and its default; Reader and Follow reader; drag-to-scroll bars
  without scroll bars; the Lite edition's manifest and packaging; passage-by-passage
  pairing in the side-by-side layout; context-menu translation of a selected
  passage; Follow reader with multiple SDK payload spellings; and silent Hebrew
  fallback with no letter-sequence-mismatch warning.
- **No visible credits UI:** tests confirm passage rendering and `index.html` do
  not show a credits/licence/source-list browser. Pack provenance remains in
  internal data metadata.
- **Offline posture:** no network permission is requested, no network API is
  called, and the plugin HTML loads no remote resources.

## Not verified in this workspace

- Full `build/build_all.sh` run against the pinned export: there is no
  `ref/Sefaria-Export-Archive` checkout. The end-to-end build, real export
  coverage, complete built-in/extended pack sizes and merged-text fidelity remain
  unverified.
- Sefaria merge-fidelity tests are skipped when the export checkout is absent.
- Generated plugin archive and official store-validator results for the expanded
  build are not available. Run the build and validator before release; the
  validator must report zero errors and zero warnings.
- Live UI behaviour on Otzaria Windows, Android, macOS or iOS WebViews; actual
  SDK payloads in a running app; and host-app CombinedTab split placement require
  a real app/device.

The data builder filters by English language and redistribution metadata. The
library can cover only translations present in the pinned export and cleared by
the selected policy; no runtime fetch or inferred translation is used.
