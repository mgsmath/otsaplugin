# Merge fidelity: our rebuild vs Sefaria's own `merged.json`

For every work we re-run Sefaria's merge and compare the result, segment by
segment, with the `merged.json` Sefaria ships. An exact match is the evidence
that the priority mosaic in `build/pipeline.py` is the same algorithm Sefaria
uses, rather than a plausible guess at it.

**How the merge is modelled.** Versions are ordered by `priority` descending
(absent = 0), ties broken by segment count then title; per segment the first
non-empty value wins. Only versions whose `actualLanguage` is English take
part, and no licence filter is applied — Sefaria builds `merged.json`
regardless of licence.

**Why the language filter matters (measured).** A work's `English/` directory
also holds German, French and Portuguese files, and some of them carry a high
`priority`. Merging every file in the directory makes Mishnah Berakhot come out
*in French* while Sefaria's `merged.json` is English: 0/57 segments identical.
Every other work happens to have no such collision, which is why the naive
version of this check looked fine at ~99.8% overall. Restricting to
`actualLanguage` en/absent reproduces `merged.json` exactly. Sefaria's merge is
language-scoped; this build now models it that way.

**Overall: 32934/32935 segments identical (100.00%).**

| Work | Segments | Identical | % |
|---|---|---|---|
| Amos | 146 | 146 | 100.00 |
| Berakhot | 2750 | 2749 | 99.96 |
| Daniel | 357 | 357 | 100.00 |
| Deuteronomy | 956 | 956 | 100.00 |
| Ecclesiastes | 222 | 222 | 100.00 |
| Esther | 167 | 167 | 100.00 |
| Exodus | 1210 | 1210 | 100.00 |
| Ezekiel | 1273 | 1273 | 100.00 |
| Ezra | 280 | 280 | 100.00 |
| Genesis | 1533 | 1533 | 100.00 |
| Habakkuk | 56 | 56 | 100.00 |
| Haggai | 38 | 38 | 100.00 |
| Hosea | 197 | 197 | 100.00 |
| I Chronicles | 943 | 943 | 100.00 |
| I Kings | 817 | 817 | 100.00 |
| I Samuel | 811 | 811 | 100.00 |
| II Chronicles | 822 | 822 | 100.00 |
| II Kings | 719 | 719 | 100.00 |
| II Samuel | 695 | 695 | 100.00 |
| Isaiah | 1291 | 1291 | 100.00 |
| Jeremiah | 1364 | 1364 | 100.00 |
| Job | 1070 | 1070 | 100.00 |
| Joel | 73 | 73 | 100.00 |
| Jonah | 48 | 48 | 100.00 |
| Joshua | 658 | 658 | 100.00 |
| Judges | 618 | 618 | 100.00 |
| Lamentations | 154 | 154 | 100.00 |
| Leviticus | 859 | 859 | 100.00 |
| Malachi | 55 | 55 | 100.00 |
| Micah | 105 | 105 | 100.00 |
| Mishnah Arakhin | 50 | 50 | 100.00 |
| Mishnah Avodah Zarah | 50 | 50 | 100.00 |
| Mishnah Bava Batra | 86 | 86 | 100.00 |
| Mishnah Bava Kamma | 79 | 79 | 100.00 |
| Mishnah Bava Metzia | 118 | 118 | 100.00 |
| Mishnah Beitzah | 42 | 42 | 100.00 |
| Mishnah Bekhorot | 73 | 73 | 100.00 |
| Mishnah Berakhot | 57 | 57 | 100.00 |
| Mishnah Bikkurim | 39 | 39 | 100.00 |
| Mishnah Chagigah | 23 | 23 | 100.00 |
| Mishnah Challah | 38 | 38 | 100.00 |
| Mishnah Chullin | 74 | 74 | 100.00 |
| Mishnah Demai | 53 | 53 | 100.00 |
| Mishnah Eduyot | 74 | 74 | 100.00 |
| Mishnah Eruvin | 96 | 96 | 100.00 |
| Mishnah Gittin | 75 | 75 | 100.00 |
| Mishnah Horayot | 20 | 20 | 100.00 |
| Mishnah Keritot | 43 | 43 | 100.00 |
| Mishnah Ketubot | 111 | 111 | 100.00 |
| Mishnah Kiddushin | 47 | 47 | 100.00 |
| Mishnah Kilayim | 77 | 77 | 100.00 |
| Mishnah Kinnim | 15 | 15 | 100.00 |
| Mishnah Maaser Sheni | 57 | 57 | 100.00 |
| Mishnah Maasrot | 40 | 40 | 100.00 |
| Mishnah Makkot | 34 | 34 | 100.00 |
| Mishnah Megillah | 33 | 33 | 100.00 |
| Mishnah Meilah | 38 | 38 | 100.00 |
| Mishnah Menachot | 93 | 93 | 100.00 |
| Mishnah Middot | 34 | 34 | 100.00 |
| Mishnah Moed Katan | 24 | 24 | 100.00 |
| Mishnah Nazir | 60 | 60 | 100.00 |
| Mishnah Nedarim | 90 | 90 | 100.00 |
| Mishnah Orlah | 35 | 35 | 100.00 |
| Mishnah Peah | 69 | 69 | 100.00 |
| Mishnah Pesachim | 89 | 89 | 100.00 |
| Mishnah Rosh Hashanah | 35 | 35 | 100.00 |
| Mishnah Sanhedrin | 71 | 71 | 100.00 |
| Mishnah Shabbat | 139 | 139 | 100.00 |
| Mishnah Shekalim | 52 | 52 | 100.00 |
| Mishnah Sheviit | 89 | 89 | 100.00 |
| Mishnah Shevuot | 62 | 62 | 100.00 |
| Mishnah Sotah | 67 | 67 | 100.00 |
| Mishnah Sukkah | 53 | 53 | 100.00 |
| Mishnah Ta'anit | 34 | 34 | 100.00 |
| Mishnah Tamid | 34 | 34 | 100.00 |
| Mishnah Temurah | 35 | 35 | 100.00 |
| Mishnah Terumot | 101 | 101 | 100.00 |
| Mishnah Yevamot | 128 | 128 | 100.00 |
| Mishnah Yoma | 61 | 61 | 100.00 |
| Mishnah Zevachim | 101 | 101 | 100.00 |
| Nahum | 47 | 47 | 100.00 |
| Nehemiah | 405 | 405 | 100.00 |
| Numbers | 1288 | 1288 | 100.00 |
| Obadiah | 21 | 21 | 100.00 |
| Pirkei Avot | 108 | 108 | 100.00 |
| Proverbs | 915 | 915 | 100.00 |
| Psalms | 2527 | 2527 | 100.00 |
| Ruth | 85 | 85 | 100.00 |
| Shabbat | 3773 | 3773 | 100.00 |
| Song of Songs | 117 | 117 | 100.00 |
| Zechariah | 211 | 211 | 100.00 |
| Zephaniah | 53 | 53 | 100.00 |
