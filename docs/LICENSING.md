# Redistribution policy (maintainer notes)

The plugin no longer displays a Credits/Licences panel or source list in the
reader UI. The build policy and per-segment provenance remain in place: removing
required attribution or redistributing a version whose terms do not allow it would
not be an appropriate way to simplify the interface.

## Included versions

`--policy open` keeps English versions marked Public Domain, CC0, CC-BY or
CC-BY-SA. `--policy include-nc` is available for personal builds and additionally
keeps CC-BY-NC. Versions with unknown licences, missing licence data, or a
non-English `actualLanguage` are excluded by the shipped `open` build.

The source files in Sefaria's `English/` directories can mix languages and
licences; the pipeline reads each version's metadata rather than trusting
`merged.json`. When no included version supplies a segment, that segment stays
empty and the reader reports that the translation is unavailable.

## Internal provenance

The pack keeps the contributing version, licence and source URL as data metadata.
`reports/licenses.*` and coverage reports are for maintainers and are not shown by
the reader UI. Keep this provenance in generated packs when changing the data
format or importer. Sources with terms that prohibit redistribution must not be
added to downloadable builds.

This document describes the build's selection policy, not legal advice. Review
the original version metadata and applicable terms before distributing a build.
