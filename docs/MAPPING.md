# Otzaria ⇄ Sefaria reference mapping

The plugin resolves a reader location to a work in the offline translation pack and
then to an address within that work. If a title or reference cannot be resolved
safely, it does not silently substitute a different passage.

## 1. Resolve the book

Otzaria's Hebrew book title maps to a Sefaria work key via the generated
`titleIndex` (`heTitle`, English title, mechanical aliases and any checked-in
mapping overrides). Shared titles remain ambiguous rather than being guessed:
Bavli Berakhot and Mishnah Berakhot can both arrive as `ברכות`, so the plugin
presents a chooser when the reader does not provide enough category context.

Mishneh Torah/Rambam title prefixes are normalized alongside the existing
`משנה` and `מסכת` prefixes. Recursive discovery includes nested commentary work
directories; the title index still uses the export's per-work title metadata.

## 2. Resolve the address

`plugin/js/refmap.js` parses an Otzaria reference using the schema recorded for the
work:

| Schema | Example refs | Address |
|---|---|---|
| verse | `פרק א, פסוק ג`, `א:ג` | chapter and verse |
| mishnah | `פרק א, משנה ב`, `ב:ד` | chapter and mishnah |
| daf | `דף ב.`, `דף ב:`, `דף ב ע"א` | daf and amud |
| halakha | `פרק א, הלכה ב` | chapter and halakhah |
| siman | `סימן א, סעיף ב` | siman and seif |
| chapter | `פרק ה` | chapter |

Hebrew numeral parsing and daf arithmetic are tested against the Python build
helpers. For daf works, section 3 is 2a and section 4 is 2b.

## 3. Preserve nested addresses

Sefaria commentary text can have a nested shape such as
`chapter → verse → comment`. The build flattens text for display but retains the
nested address group (`unit.g`) so verse references and displayed comment labels
remain attached to the correct verse. Versions are merged by their address paths,
not by their flattened positions; an omitted comment in one version cannot shift
a later comment onto the wrong verse.

Mishnah Berurah exports can store text under named schema nodes and omit ordinary
`sectionNames`. The build unwraps populated nodes and infers a siman/seif schema
from the work metadata. Mishneh Torah exports similarly receive a chapter/halakhah
schema when the version file omits section names.

## 4. Confirm and render

Where the SDK supplies reader Hebrew, `NS.alignHebrew` checks it against the
packed text after stripping marks and punctuation. An exact match can be shown
beside the corresponding translation segments. If it does not align, the plugin
uses the packed Hebrew when present and does not show a mismatch warning. Views
that need per-segment pairing fall back to section-level Hebrew instead of
inventing an alignment.

## 5. Coverage and provenance

The build recursively scans all English-bearing work directories under Tanakh,
Mishnah, Talmud, Halakhah and Musar. It includes only versions accepted by the
chosen redistribution policy. A work or passage with no eligible English text
remains unavailable. Full pinned-export coverage has not been verified in this
workspace; run `build/build_all.sh` to generate fresh `reports/coverage.*`.

The plugin UI no longer exposes per-passage sources or a source/licence browser.
The generated data retains internal version and licence provenance, and
maintainer reports document the selected sources and exclusions.
