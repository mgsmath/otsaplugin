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

**Overall: 252276/292117 segments identical (86.36%).**

| Work | Segments | Identical | % |
|---|---|---|---|
| A New Israeli Commentary on Pirkei Avot | 960 | 16 | 1.67 |
| Abarbanel on Amos | 53 | 53 | 100.00 |
| Abarbanel on Hosea | 6 | 6 | 100.00 |
| Abarbanel on I Kings | 23 | 23 | 100.00 |
| Abarbanel on I Samuel | 26 | 8 | 30.77 |
| Abarbanel on II Kings | 1 | 1 | 100.00 |
| Abarbanel on II Samuel | 2 | 2 | 100.00 |
| Abarbanel on Isaiah | 13 | 13 | 100.00 |
| Abarbanel on Jeremiah | 31 | 31 | 100.00 |
| Abarbanel on Joel | 24 | 24 | 100.00 |
| Abarbanel on Jonah | 42 | 42 | 100.00 |
| Abarbanel on Joshua | 1 | 1 | 100.00 |
| Abarbanel on Judges | 1 | 1 | 100.00 |
| Abarbanel on Obadiah | 13 | 13 | 100.00 |
| Abarbanel on Torah | 780 | 115 | 14.74 |
| Abarbanel on Zechariah | 25 | 25 | 100.00 |
| Abraham Cohen Footnotes to the English Translation of Masechet Berakhot | 2997 | 2997 | 100.00 |
| Aderet Eliyahu | 15 | 0 | 0.00 |
| Aderet Eliyahu (Rabbi Yosef Chaim) | 3 | 3 | 100.00 |
| Ahavat Yehonatan | 1 | 1 | 100.00 |
| Ahevukha Ad Mavet | 4 | 4 | 100.00 |
| Alon Bakhut on Lamentations | 7 | 7 | 100.00 |
| Alshekh on Torah | 313 | 132 | 42.17 |
| Amos | 146 | 146 | 100.00 |
| Arakhin | 1182 | 1182 | 100.00 |
| Aramaic Targum to Ecclesiastes | 222 | 62 | 27.93 |
| Aramaic Targum to Esther | 21 | 21 | 100.00 |
| Aramaic Targum to Job | 22 | 22 | 100.00 |
| Aramaic Targum to Proverbs | 32 | 32 | 100.00 |
| Aramaic Targum to Psalms | 387 | 77 | 19.90 |
| Ateret Zekeinim | 3 | 3 | 100.00 |
| Avi Ezer | 19 | 19 | 100.00 |
| Avodah Zarah | 2131 | 2131 | 100.00 |
| Avot DeRabbi Natan | 253 | 253 | 100.00 |
| Avot DeRabbi Natan, Recension B | 23 | 23 | 100.00 |
| Ba'al HaTurim on Genesis | 9 | 9 | 100.00 |
| Ba'alei Brit Avram | 4 | 4 | 100.00 |
| Bartenura on Mishnah Avodah Zarah | 264 | 264 | 100.00 |
| Bartenura on Mishnah Bava Batra | 497 | 497 | 100.00 |
| Bartenura on Mishnah Bava Kamma | 325 | 324 | 99.69 |
| Bartenura on Mishnah Bava Metzia | 469 | 407 | 86.78 |
| Bartenura on Mishnah Beitzah | 215 | 215 | 100.00 |
| Bartenura on Mishnah Berakhot | 222 | 222 | 100.00 |
| Bartenura on Mishnah Bikkurim | 129 | 123 | 95.35 |
| Bartenura on Mishnah Chagigah | 107 | 107 | 100.00 |
| Bartenura on Mishnah Challah | 192 | 192 | 100.00 |
| Bartenura on Mishnah Chullin | 510 | 507 | 99.41 |
| Bartenura on Mishnah Eduyot | 401 | 401 | 100.00 |
| Bartenura on Mishnah Eruvin | 453 | 451 | 99.56 |
| Bartenura on Mishnah Gittin | 339 | 339 | 100.00 |
| Bartenura on Mishnah Horayot | 88 | 24 | 27.27 |
| Bartenura on Mishnah Kelim | 1716 | 1716 | 100.00 |
| Bartenura on Mishnah Keritot | 251 | 251 | 100.00 |
| Bartenura on Mishnah Ketubot | 386 | 385 | 99.74 |
| Bartenura on Mishnah Kiddushin | 173 | 173 | 100.00 |
| Bartenura on Mishnah Kinnim | 69 | 69 | 100.00 |
| Bartenura on Mishnah Maaser Sheni | 270 | 270 | 100.00 |
| Bartenura on Mishnah Maasrot | 244 | 244 | 100.00 |
| Bartenura on Mishnah Makkot | 148 | 113 | 76.35 |
| Bartenura on Mishnah Megillah | 162 | 162 | 100.00 |
| Bartenura on Mishnah Meilah | 186 | 186 | 100.00 |
| Bartenura on Mishnah Menachot | 579 | 578 | 99.83 |
| Bartenura on Mishnah Middot | 186 | 164 | 88.17 |
| Bartenura on Mishnah Mikvaot | 396 | 384 | 96.97 |
| Bartenura on Mishnah Moed Katan | 131 | 131 | 100.00 |
| Bartenura on Mishnah Nedarim | 331 | 331 | 100.00 |
| Bartenura on Mishnah Orlah | 123 | 122 | 99.19 |
| Bartenura on Mishnah Peah | 280 | 239 | 85.36 |
| Bartenura on Mishnah Pesachim | 435 | 421 | 96.78 |
| Bartenura on Mishnah Rosh Hashanah | 141 | 141 | 100.00 |
| Bartenura on Mishnah Sanhedrin | 394 | 394 | 100.00 |
| Bartenura on Mishnah Shabbat | 881 | 875 | 99.32 |
| Bartenura on Mishnah Shekalim | 273 | 273 | 100.00 |
| Bartenura on Mishnah Shevuot | 222 | 222 | 100.00 |
| Bartenura on Mishnah Sotah | 314 | 314 | 100.00 |
| Bartenura on Mishnah Sukkah | 229 | 229 | 100.00 |
| Bartenura on Mishnah Taanit | 131 | 130 | 99.24 |
| Bartenura on Mishnah Tamid | 210 | 210 | 100.00 |
| Bartenura on Mishnah Terumot | 404 | 404 | 100.00 |
| Bartenura on Mishnah Yadayim | 110 | 109 | 99.09 |
| Bartenura on Mishnah Yevamot | 447 | 447 | 100.00 |
| Bartenura on Mishnah Yoma | 274 | 264 | 96.35 |
| Bartenura on Pirkei Avot | 416 | 416 | 100.00 |
| Bartenura on Torah | 26 | 26 | 100.00 |
| Bava Batra | 3799 | 3799 | 100.00 |
| Bava Kamma | 4309 | 4309 | 100.00 |
| Bava Metzia | 3658 | 3658 | 100.00 |
| Beit HaLevi on Torah | 3 | 3 | 100.00 |
| Beitzah | 1149 | 1149 | 100.00 |
| Bekhor Shor | 150 | 0 | 0.00 |
| Bekhorot | 1955 | 1955 | 100.00 |
| Ben Yehoyada on Arakhin | 2 | 2 | 100.00 |
| Ben Yehoyada on Bava Metzia | 4 | 4 | 100.00 |
| Ben Yehoyada on Berakhot | 23 | 21 | 91.30 |
| Ben Yehoyada on Eruvin | 13 | 13 | 100.00 |
| Ben Yehoyada on Shabbat | 27 | 27 | 100.00 |
| Ben Yehoyada on Yevamot | 7 | 7 | 100.00 |
| Berakhot | 2750 | 2749 | 99.96 |
| Binyan Yehoshua on Avot D'Rabbi Natan | 21 | 21 | 100.00 |
| Birkat Asher on Torah | 11 | 11 | 100.00 |
| Boaz on Mishnah Berakhot | 1 | 1 | 100.00 |
| Boaz on Mishnah Yoma | 3 | 3 | 100.00 |
| Boaz on Pirkei Avot | 1 | 1 | 100.00 |
| Cassuto on Exodus | 10 | 6 | 60.00 |
| Cassuto on Genesis | 16 | 7 | 43.75 |
| Chagigah | 734 | 734 | 100.00 |
| Chatam Sofer on Torah | 92 | 92 | 100.00 |
| Chibbah Yeteirah on Torah | 4 | 4 | 100.00 |
| Chiddushei Ramban on Avodah Zarah | 3 | 3 | 100.00 |
| Chiddushei Ramban on Bava Metzia | 5 | 5 | 100.00 |
| Chiddushei Ramban on Berakhot | 1 | 1 | 100.00 |
| Chiddushei Ramban on Yoma | 2 | 2 | 100.00 |
| Chidushei Agadot on Avodah Zarah | 19 | 19 | 100.00 |
| Chidushei Agadot on Bava Batra | 13 | 13 | 100.00 |
| Chidushei Agadot on Bava Metzia | 12 | 12 | 100.00 |
| Chidushei Agadot on Bekhorot | 2 | 2 | 100.00 |
| Chidushei Agadot on Berakhot | 27 | 23 | 85.19 |
| Chidushei Agadot on Chagigah | 38 | 38 | 100.00 |
| Chidushei Agadot on Chullin | 10 | 10 | 100.00 |
| Chidushei Agadot on Eruvin | 5 | 5 | 100.00 |
| Chidushei Agadot on Gittin | 35 | 35 | 100.00 |
| Chidushei Agadot on Kiddushin | 2 | 2 | 100.00 |
| Chidushei Agadot on Megillah | 2 | 2 | 100.00 |
| Chidushei Agadot on Menachot | 1 | 1 | 100.00 |
| Chidushei Agadot on Nedarim | 3 | 3 | 100.00 |
| Chidushei Agadot on Sanhedrin | 20 | 20 | 100.00 |
| Chidushei Agadot on Shabbat | 48 | 48 | 100.00 |
| Chidushei Agadot on Sotah | 5 | 5 | 100.00 |
| Chidushei Agadot on Taanit | 33 | 33 | 100.00 |
| Chidushei Agadot on Yoma | 14 | 14 | 100.00 |
| Chidushei Chatam Sofer on Gittin | 1 | 1 | 100.00 |
| Chidushei Chatam Sofer on Niddah | 1 | 1 | 100.00 |
| Chidushei Chatam Sofer on Pesachim | 5 | 5 | 100.00 |
| Chidushei Chatam Sofer on Shabbat | 4 | 4 | 100.00 |
| Chidushei Chatam Sofer on Sukkah | 4 | 4 | 100.00 |
| Chidushei Halachot on Avodah Zarah | 3 | 3 | 100.00 |
| Chidushei Halachot on Bava Metzia | 3 | 3 | 100.00 |
| Chidushei Halachot on Ketubot | 1 | 1 | 100.00 |
| Chizkuni | 5586 | 555 | 9.94 |
| Chomat Anakh on Daniel | 11 | 11 | 100.00 |
| Chomat Anakh on Esther | 1 | 1 | 100.00 |
| Chomat Anakh on II Samuel | 1 | 1 | 100.00 |
| Chomat Anakh on Isaiah | 1 | 1 | 100.00 |
| Chomat Anakh on Joshua | 4 | 4 | 100.00 |
| Chomat Anakh on Torah | 11 | 5 | 45.45 |
| Chullin | 4388 | 4388 | 100.00 |
| Da'at Zekenim on Deuteronomy | 259 | 258 | 99.61 |
| Da'at Zekenim on Exodus | 263 | 258 | 98.10 |
| Da'at Zekenim on Genesis | 320 | 312 | 97.50 |
| Da'at Zekenim on Leviticus | 124 | 124 | 100.00 |
| Da'at Zekenim on Numbers | 223 | 222 | 99.55 |
| Daf Shevui to Kiddushin | 2218 | 2218 | 100.00 |
| Daf Shevui to Megillah | 988 | 988 | 100.00 |
| Daf Shevui to Sukkah | 1475 | 1475 | 100.00 |
| Daniel | 357 | 357 | 100.00 |
| Darkhei HaTalmud | 2 | 2 | 100.00 |
| David Zvi Hoffmann on Leviticus | 6 | 6 | 100.00 |
| Depths of Yonah | 651 | 651 | 100.00 |
| Derekh Chayyim | 1017 | 926 | 91.05 |
| Deuteronomy | 956 | 956 | 100.00 |
| Devarim Nichumim on Lamentations | 4 | 4 | 100.00 |
| Divrei David on Rashi | 9 | 9 | 100.00 |
| Ecclesiastes | 222 | 222 | 100.00 |
| Eliyahu Rabbah on Mishnah Kelim | 6 | 6 | 100.00 |
| Eliyahu Rabbah on Mishnah Negaim | 1 | 1 | 100.00 |
| Em LaMikra | 78 | 3 | 3.85 |
| English Explanation of Mishnah Arakhin | 196 | 196 | 100.00 |
| English Explanation of Mishnah Avodah Zarah | 155 | 155 | 100.00 |
| English Explanation of Mishnah Bava Batra | 250 | 250 | 100.00 |
| English Explanation of Mishnah Bava Kamma | 171 | 171 | 100.00 |
| English Explanation of Mishnah Bava Metzia | 302 | 302 | 100.00 |
| English Explanation of Mishnah Beitzah | 164 | 164 | 100.00 |
| English Explanation of Mishnah Bekhorot | 303 | 303 | 100.00 |
| English Explanation of Mishnah Berakhot | 185 | 185 | 100.00 |
| English Explanation of Mishnah Bikkurim | 157 | 157 | 100.00 |
| English Explanation of Mishnah Chagigah | 83 | 83 | 100.00 |
| English Explanation of Mishnah Challah | 162 | 162 | 100.00 |
| English Explanation of Mishnah Chullin | 312 | 312 | 100.00 |
| English Explanation of Mishnah Demai | 182 | 182 | 100.00 |
| English Explanation of Mishnah Eduyot | 262 | 262 | 100.00 |
| English Explanation of Mishnah Eruvin | 343 | 343 | 100.00 |
| English Explanation of Mishnah Gittin | 273 | 273 | 100.00 |
| English Explanation of Mishnah Horayot | 63 | 63 | 100.00 |
| English Explanation of Mishnah Kelim | 908 | 908 | 100.00 |
| English Explanation of Mishnah Keritot | 181 | 181 | 100.00 |
| English Explanation of Mishnah Ketubot | 378 | 378 | 100.00 |
| English Explanation of Mishnah Kiddushin | 172 | 172 | 100.00 |
| English Explanation of Mishnah Kilayim | 286 | 286 | 100.00 |
| English Explanation of Mishnah Kinnim | 63 | 63 | 100.00 |
| English Explanation of Mishnah Maaser Sheni | 232 | 232 | 100.00 |
| English Explanation of Mishnah Maasrot | 165 | 0 | 0.00 |
| English Explanation of Mishnah Makhshirin | 185 | 185 | 100.00 |
| English Explanation of Mishnah Makkot | 126 | 126 | 100.00 |
| English Explanation of Mishnah Megillah | 126 | 126 | 100.00 |
| English Explanation of Mishnah Meilah | 130 | 130 | 100.00 |
| English Explanation of Mishnah Menachot | 391 | 391 | 100.00 |
| English Explanation of Mishnah Middot | 111 | 111 | 100.00 |
| English Explanation of Mishnah Mikvaot | 228 | 228 | 100.00 |
| English Explanation of Mishnah Moed Katan | 84 | 84 | 100.00 |
| English Explanation of Mishnah Nazir | 192 | 192 | 100.00 |
| English Explanation of Mishnah Nedarim | 304 | 304 | 100.00 |
| English Explanation of Mishnah Negaim | 445 | 445 | 100.00 |
| English Explanation of Mishnah Niddah | 267 | 267 | 100.00 |
| English Explanation of Mishnah Oholot | 472 | 472 | 100.00 |
| English Explanation of Mishnah Oktzin | 90 | 90 | 100.00 |
| English Explanation of Mishnah Orlah | 122 | 122 | 100.00 |
| English Explanation of Mishnah Parah | 340 | 340 | 100.00 |
| English Explanation of Mishnah Peah | 246 | 246 | 100.00 |
| English Explanation of Mishnah Pesachim | 345 | 345 | 100.00 |
| English Explanation of Mishnah Rosh Hashanah | 130 | 130 | 100.00 |
| English Explanation of Mishnah Sanhedrin | 241 | 241 | 100.00 |
| English Explanation of Mishnah Shabbat | 525 | 525 | 100.00 |
| English Explanation of Mishnah Shekalim | 203 | 203 | 100.00 |
| English Explanation of Mishnah Sheviit | 350 | 350 | 100.00 |
| English Explanation of Mishnah Shevuot | 234 | 234 | 100.00 |
| English Explanation of Mishnah Sotah | 270 | 270 | 100.00 |
| English Explanation of Mishnah Sukkah | 190 | 190 | 100.00 |
| English Explanation of Mishnah Taanit | 116 | 116 | 100.00 |
| English Explanation of Mishnah Tahorot | 305 | 305 | 100.00 |
| English Explanation of Mishnah Tamid | 125 | 125 | 100.00 |
| English Explanation of Mishnah Temurah | 136 | 136 | 100.00 |
| English Explanation of Mishnah Terumot | 358 | 358 | 100.00 |
| English Explanation of Mishnah Tevul Yom | 89 | 89 | 100.00 |
| English Explanation of Mishnah Yadayim | 97 | 97 | 100.00 |
| English Explanation of Mishnah Yevamot | 471 | 471 | 100.00 |
| English Explanation of Mishnah Yoma | 220 | 220 | 100.00 |
| English Explanation of Mishnah Zavim | 120 | 120 | 100.00 |
| English Explanation of Mishnah Zevachim | 380 | 380 | 100.00 |
| English Explanation of Pirkei Avot | 236 | 236 | 100.00 |
| Eruvin | 3645 | 3645 | 100.00 |
| Esther | 167 | 167 | 100.00 |
| Exodus | 1210 | 1210 | 100.00 |
| Ezekiel | 1273 | 1273 | 100.00 |
| Ezra | 280 | 280 | 100.00 |
| Ezra ben Solomon on Song of Songs | 301 | 301 | 100.00 |
| Footnotes to Kohelet by Bruce Heitler | 48 | 48 | 100.00 |
| From David to Destruction | 1994 | 1994 | 100.00 |
| Genesis | 1533 | 1533 | 100.00 |
| Gittin | 2990 | 2990 | 100.00 |
| Gra's Nuschah on Avot D'Rabbi Natan | 3 | 3 | 100.00 |
| Gur Aryeh on Bamidbar | 12 | 9 | 75.00 |
| Gur Aryeh on Bereishit | 33 | 23 | 69.70 |
| Gur Aryeh on Devarim | 11 | 10 | 90.91 |
| Gur Aryeh on Shemot | 13 | 8 | 61.54 |
| Gur Aryeh on Vayikra | 6 | 5 | 83.33 |
| HaKtav VeHaKabalah | 102 | 0 | 0.00 |
| HaMaor HaKatan on Rosh Hashanah | 4 | 4 | 100.00 |
| Haamek Davar on Deuteronomy | 116 | 0 | 0.00 |
| Haamek Davar on Exodus | 90 | 0 | 0.00 |
| Haamek Davar on Genesis | 293 | 0 | 0.00 |
| Haamek Davar on Leviticus | 67 | 0 | 0.00 |
| Haamek Davar on Numbers | 133 | 0 | 0.00 |
| Habakkuk | 56 | 56 | 100.00 |
| Hadar Zekenim on Torah | 1 | 1 | 100.00 |
| Haflaah on Ketubot | 1 | 1 | 100.00 |
| Haggahot R' Yeshaya Berlin on Avot D'Rabbi Natan | 1 | 1 | 100.00 |
| Haggahot Ya'avetz on Avot D'Rabbi Natan | 1 | 1 | 100.00 |
| Haggahot Ya'avetz on Eruvin | 1 | 1 | 100.00 |
| Haggai | 38 | 38 | 100.00 |
| Harchev Davar on Genesis | 39 | 39 | 100.00 |
| Horayot | 450 | 450 | 100.00 |
| Hosea | 197 | 197 | 100.00 |
| I Chronicles | 943 | 943 | 100.00 |
| I Kings | 817 | 817 | 100.00 |
| I Samuel | 811 | 811 | 100.00 |
| II Chronicles | 822 | 822 | 100.00 |
| II Kings | 719 | 719 | 100.00 |
| II Samuel | 695 | 695 | 100.00 |
| Ibn Ezra on Daniel | 245 | 245 | 100.00 |
| Ibn Ezra on Deuteronomy | 1201 | 1199 | 99.83 |
| Ibn Ezra on Ecclesiastes | 20 | 20 | 100.00 |
| Ibn Ezra on Esther | 8 | 7 | 87.50 |
| Ibn Ezra on Exodus | 1652 | 1625 | 98.37 |
| Ibn Ezra on Genesis | 1281 | 29 | 2.26 |
| Ibn Ezra on Hosea | 1 | 1 | 100.00 |
| Ibn Ezra on Isaiah | 2950 | 0 | 0.00 |
| Ibn Ezra on Joel | 1 | 1 | 100.00 |
| Ibn Ezra on Jonah | 26 | 26 | 100.00 |
| Ibn Ezra on Lamentations | 17 | 17 | 100.00 |
| Ibn Ezra on Leviticus | 1023 | 1023 | 100.00 |
| Ibn Ezra on Malachi | 1 | 1 | 100.00 |
| Ibn Ezra on Nahum | 3 | 3 | 100.00 |
| Ibn Ezra on Nehemiah | 1 | 1 | 100.00 |
| Ibn Ezra on Numbers | 1111 | 1111 | 100.00 |
| Ibn Ezra on Proverbs | 22 | 21 | 95.45 |
| Ibn Ezra on Psalms | 168 | 0 | 0.00 |
| Ibn Ezra on Ruth | 94 | 94 | 100.00 |
| Ibn Ezra on Zechariah | 4 | 4 | 100.00 |
| Ikar Tosafot Yom Tov on Mishnah Berakhot | 2 | 2 | 100.00 |
| Ikar Tosafot Yom Tov on Mishnah Nazir | 2 | 2 | 100.00 |
| Ikar Tosafot Yom Tov on Mishnah Rosh Hashanah | 17 | 17 | 100.00 |
| Ikar Tosafot Yom Tov on Mishnah Sanhedrin | 11 | 11 | 100.00 |
| Ikar Tosafot Yom Tov on Mishnah Sotah | 1 | 1 | 100.00 |
| Ikar Tosafot Yom Tov on Mishnah Yoma | 1 | 1 | 100.00 |
| Ikar Tosafot Yom Tov on Pirkei Avot | 290 | 290 | 100.00 |
| Isaiah | 1291 | 1291 | 100.00 |
| Jeremiah | 1364 | 1364 | 100.00 |
| Jerusalem Talmud Avodah Zarah | 352 | 352 | 100.00 |
| Jerusalem Talmud Bava Batra | 260 | 260 | 100.00 |
| Jerusalem Talmud Bava Kamma | 275 | 275 | 100.00 |
| Jerusalem Talmud Bava Metzia | 273 | 273 | 100.00 |
| Jerusalem Talmud Beitzah | 195 | 195 | 100.00 |
| Jerusalem Talmud Berakhot | 655 | 655 | 100.00 |
| Jerusalem Talmud Bikkurim | 143 | 143 | 100.00 |
| Jerusalem Talmud Chagigah | 149 | 149 | 100.00 |
| Jerusalem Talmud Challah | 179 | 179 | 100.00 |
| Jerusalem Talmud Demai | 300 | 300 | 100.00 |
| Jerusalem Talmud Eruvin | 415 | 415 | 100.00 |
| Jerusalem Talmud Gittin | 349 | 349 | 100.00 |
| Jerusalem Talmud Horayot | 122 | 122 | 100.00 |
| Jerusalem Talmud Ketubot | 516 | 516 | 100.00 |
| Jerusalem Talmud Kiddushin | 329 | 329 | 100.00 |
| Jerusalem Talmud Kilayim | 322 | 322 | 100.00 |
| Jerusalem Talmud Maaser Sheni | 241 | 241 | 100.00 |
| Jerusalem Talmud Maasrot | 186 | 186 | 100.00 |
| Jerusalem Talmud Makkot | 75 | 75 | 100.00 |
| Jerusalem Talmud Megillah | 232 | 232 | 100.00 |
| Jerusalem Talmud Moed Katan | 161 | 161 | 100.00 |
| Jerusalem Talmud Nazir | 305 | 305 | 100.00 |
| Jerusalem Talmud Nedarim | 346 | 346 | 100.00 |
| Jerusalem Talmud Niddah | 104 | 98 | 94.23 |
| Jerusalem Talmud Orlah | 176 | 176 | 100.00 |
| Jerusalem Talmud Peah | 402 | 402 | 100.00 |
| Jerusalem Talmud Pesachim | 515 | 515 | 100.00 |
| Jerusalem Talmud Rosh Hashanah | 160 | 160 | 100.00 |
| Jerusalem Talmud Sanhedrin | 587 | 586 | 99.83 |
| Jerusalem Talmud Shabbat | 772 | 751 | 97.28 |
| Jerusalem Talmud Shekalim | 226 | 226 | 100.00 |
| Jerusalem Talmud Sheviit | 390 | 390 | 100.00 |
| Jerusalem Talmud Shevuot | 291 | 291 | 100.00 |
| Jerusalem Talmud Sotah | 381 | 381 | 100.00 |
| Jerusalem Talmud Sukkah | 205 | 205 | 100.00 |
| Jerusalem Talmud Taanit | 245 | 245 | 100.00 |
| Jerusalem Talmud Terumot | 418 | 418 | 100.00 |
| Jerusalem Talmud Yevamot | 638 | 638 | 100.00 |
| Jerusalem Talmud Yoma | 362 | 362 | 100.00 |
| Job | 1070 | 1070 | 100.00 |
| Joel | 73 | 73 | 100.00 |
| Jonah | 48 | 48 | 100.00 |
| Joseph ibn Yahya on Esther | 1 | 1 | 100.00 |
| Joshua | 658 | 658 | 100.00 |
| Judges | 618 | 618 | 100.00 |
| Karati Bekhol Lev | 121 | 121 | 100.00 |
| Keritot | 1210 | 1210 | 100.00 |
| Ketubot | 3038 | 3034 | 99.87 |
| Kiddushin | 2405 | 2405 | 100.00 |
| Kisse Rahamim on Avot D'Rabbi Natan | 2 | 2 | 100.00 |
| Kisse Rahamim on Tractate Soferim | 2 | 2 | 100.00 |
| Kitzur Ba'al HaTurim on Deuteronomy | 16 | 9 | 56.25 |
| Kitzur Ba'al HaTurim on Exodus | 17 | 11 | 64.71 |
| Kitzur Ba'al HaTurim on Genesis | 185 | 4 | 2.16 |
| Kitzur Ba'al HaTurim on Leviticus | 11 | 9 | 81.82 |
| Kitzur Ba'al HaTurim on Numbers | 19 | 9 | 47.37 |
| Kli Yakar on Deuteronomy | 45 | 19 | 42.22 |
| Kli Yakar on Exodus | 52 | 20 | 38.46 |
| Kli Yakar on Genesis | 123 | 37 | 30.08 |
| Kli Yakar on Leviticus | 81 | 46 | 56.79 |
| Kli Yakar on Numbers | 52 | 34 | 65.38 |
| Lamentations | 154 | 154 | 100.00 |
| Leviticus | 859 | 859 | 100.00 |
| Maharam Schiff on Bava Metzia | 3 | 3 | 100.00 |
| Maharam Schiff on Chullin | 5 | 5 | 100.00 |
| Maharam on Avodah Zarah | 5 | 5 | 100.00 |
| Makkot | 709 | 709 | 100.00 |
| Malachi | 55 | 55 | 100.00 |
| Malbim Beur Hamilot on Isaiah | 8 | 7 | 87.50 |
| Malbim Beur Hamilot on Psalms | 2 | 1 | 50.00 |
| Malbim on Daniel | 7 | 7 | 100.00 |
| Malbim on Deuteronomy | 10 | 10 | 100.00 |
| Malbim on Esther | 15 | 15 | 100.00 |
| Malbim on Exodus | 72 | 30 | 41.67 |
| Malbim on Ezekiel | 9 | 7 | 77.78 |
| Malbim on Genesis | 84 | 51 | 60.71 |
| Malbim on I Chronicles | 2 | 2 | 100.00 |
| Malbim on I Kings | 12 | 1 | 8.33 |
| Malbim on I Samuel | 6 | 4 | 66.67 |
| Malbim on II Kings | 3 | 3 | 100.00 |
| Malbim on II Samuel | 9 | 6 | 66.67 |
| Malbim on Isaiah | 45 | 31 | 68.89 |
| Malbim on Jeremiah | 24 | 14 | 58.33 |
| Malbim on Job | 657 | 657 | 100.00 |
| Malbim on Jonah | 35 | 35 | 100.00 |
| Malbim on Joshua | 1 | 1 | 100.00 |
| Malbim on Judges | 2 | 2 | 100.00 |
| Malbim on Leviticus | 4 | 4 | 100.00 |
| Malbim on Micah | 2 | 2 | 100.00 |
| Malbim on Numbers | 3 | 3 | 100.00 |
| Malbim on Proverbs | 9 | 8 | 88.89 |
| Malbim on Psalms | 30 | 16 | 53.33 |
| Malbim on Ruth | 4 | 4 | 100.00 |
| Malbim on Zechariah | 6 | 5 | 83.33 |
| Marit HaAyin on Pesachim | 1 | 1 | 100.00 |
| Marit HaAyin on Pirkei Avot | 2 | 2 | 100.00 |
| Marit HaAyin on Taanit | 1 | 1 | 100.00 |
| Masat Moshe on Esther | 4 | 4 | 100.00 |
| Megillah | 1213 | 1212 | 99.92 |
| Megillat Setarim on Esther | 3 | 3 | 100.00 |
| Meilah | 513 | 513 | 100.00 |
| Meiri on Avodah Zarah | 12 | 12 | 100.00 |
| Meiri on Bava Kamma | 8 | 8 | 100.00 |
| Meiri on Bava Metzia | 5 | 5 | 100.00 |
| Meiri on Berakhot | 10 | 6 | 60.00 |
| Meiri on Pesachim | 2 | 2 | 100.00 |
| Meiri on Rosh Hashanah | 8 | 8 | 100.00 |
| Meiri on Sanhedrin | 36 | 36 | 100.00 |
| Meiri on Shabbat | 12 | 12 | 100.00 |
| Meiri on Sotah | 6 | 6 | 100.00 |
| Meiri on Yevamot | 4 | 4 | 100.00 |
| Meiri on Yoma | 2 | 2 | 100.00 |
| Mekhir Yayin on Esther | 1 | 1 | 100.00 |
| Menachot | 3783 | 3783 | 100.00 |
| Menot HaLevi on Esther | 2 | 2 | 100.00 |
| Meshekh Chokhmah | 795 | 335 | 42.14 |
| Metzudat David on Ecclesiastes | 1 | 1 | 100.00 |
| Metzudat David on Ezekiel | 2 | 2 | 100.00 |
| Metzudat David on Hosea | 3 | 3 | 100.00 |
| Metzudat David on I Chronicles | 1 | 1 | 100.00 |
| Metzudat David on I Samuel | 99 | 99 | 100.00 |
| Metzudat David on II Kings | 83 | 83 | 100.00 |
| Metzudat David on II Samuel | 9 | 5 | 55.56 |
| Metzudat David on Isaiah | 12 | 7 | 58.33 |
| Metzudat David on Jeremiah | 7 | 5 | 71.43 |
| Metzudat David on Jonah | 2 | 2 | 100.00 |
| Metzudat David on Joshua | 23 | 20 | 86.96 |
| Metzudat David on Judges | 170 | 1 | 0.59 |
| Metzudat David on Micah | 6 | 6 | 100.00 |
| Metzudat David on Nehemiah | 1 | 1 | 100.00 |
| Metzudat David on Obadiah | 2 | 2 | 100.00 |
| Metzudat David on Proverbs | 4 | 4 | 100.00 |
| Metzudat David on Psalms | 21 | 15 | 71.43 |
| Metzudat David on Song of Songs | 3 | 3 | 100.00 |
| Metzudat Zion on Ecclesiastes | 1 | 1 | 100.00 |
| Metzudat Zion on I Kings | 1 | 1 | 100.00 |
| Metzudat Zion on II Chronicles | 1 | 1 | 100.00 |
| Metzudat Zion on II Kings | 28 | 28 | 100.00 |
| Metzudat Zion on Joshua | 1 | 1 | 100.00 |
| Metzudat Zion on Judges | 105 | 105 | 100.00 |
| Metzudat Zion on Malachi | 1 | 1 | 100.00 |
| Metzudat Zion on Psalms | 2 | 2 | 100.00 |
| Metzudat Zion on Zechariah | 2 | 2 | 100.00 |
| Micah | 105 | 105 | 100.00 |
| Midrash Shmuel on Avot | 24 | 24 | 100.00 |
| Minchat Shai on II Samuel | 3 | 3 | 100.00 |
| Minchat Shai on Judges | 1 | 1 | 100.00 |
| Minchat Shai on Proverbs | 1 | 1 | 100.00 |
| Minchat Shai on Torah | 7 | 4 | 57.14 |
| Minchat Shai on Zechariah | 1 | 1 | 100.00 |
| Minei Targuma on Torah | 1 | 1 | 100.00 |
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
| Mishnah Kelim | 254 | 254 | 100.00 |
| Mishnah Keritot | 43 | 43 | 100.00 |
| Mishnah Ketubot | 111 | 111 | 100.00 |
| Mishnah Kiddushin | 47 | 47 | 100.00 |
| Mishnah Kilayim | 77 | 77 | 100.00 |
| Mishnah Kinnim | 15 | 15 | 100.00 |
| Mishnah Maaser Sheni | 57 | 57 | 100.00 |
| Mishnah Maasrot | 40 | 40 | 100.00 |
| Mishnah Makhshirin | 54 | 54 | 100.00 |
| Mishnah Makkot | 34 | 34 | 100.00 |
| Mishnah Megillah | 33 | 33 | 100.00 |
| Mishnah Meilah | 38 | 38 | 100.00 |
| Mishnah Menachot | 93 | 93 | 100.00 |
| Mishnah Middot | 34 | 34 | 100.00 |
| Mishnah Mikvaot | 71 | 71 | 100.00 |
| Mishnah Moed Katan | 24 | 24 | 100.00 |
| Mishnah Nazir | 60 | 60 | 100.00 |
| Mishnah Nedarim | 90 | 90 | 100.00 |
| Mishnah Negaim | 115 | 115 | 100.00 |
| Mishnah Niddah | 79 | 79 | 100.00 |
| Mishnah Oholot | 134 | 134 | 100.00 |
| Mishnah Oktzin | 28 | 28 | 100.00 |
| Mishnah Orlah | 35 | 35 | 100.00 |
| Mishnah Parah | 96 | 96 | 100.00 |
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
| Mishnah Tahorot | 92 | 92 | 100.00 |
| Mishnah Tamid | 34 | 34 | 100.00 |
| Mishnah Temurah | 35 | 35 | 100.00 |
| Mishnah Terumot | 101 | 101 | 100.00 |
| Mishnah Tevul Yom | 26 | 26 | 100.00 |
| Mishnah Yadayim | 22 | 22 | 100.00 |
| Mishnah Yevamot | 128 | 128 | 100.00 |
| Mishnah Yoma | 61 | 61 | 100.00 |
| Mishnah Zavim | 32 | 32 | 100.00 |
| Mishnah Zevachim | 101 | 101 | 100.00 |
| Mishnat Eretz Yisrael on Mishnah Ketubot | 15 | 15 | 100.00 |
| Mishnat Eretz Yisrael on Mishnah Kilayim | 2 | 2 | 100.00 |
| Mishnat Eretz Yisrael on Mishnah Megillah | 2 | 2 | 100.00 |
| Mishnat Eretz Yisrael on Mishnah Rosh Hashanah | 73 | 73 | 100.00 |
| Mishnat Eretz Yisrael on Mishnah Sanhedrin | 3 | 3 | 100.00 |
| Mishnat Eretz Yisrael on Mishnah Taanit | 3 | 3 | 100.00 |
| Mishnat Eretz Yisrael on Pirkei Avot | 66 | 66 | 100.00 |
| Mizrachi | 22 | 18 | 81.82 |
| Moed Katan | 1024 | 1024 | 100.00 |
| Mordechai on Bava Batra | 41 | 41 | 100.00 |
| Nachal Eshkol on Ecclesiastes | 1 | 1 | 100.00 |
| Nachal Eshkol on Song of Songs | 10 | 10 | 100.00 |
| Nachal Kedumim on Torah | 3 | 2 | 66.67 |
| Nachal Sorek | 1 | 1 | 100.00 |
| Nachalat Avot on Avot | 1 | 1 | 100.00 |
| Nachalat Ya'akov on Tractate Soferim | 12 | 12 | 100.00 |
| Nahum | 47 | 47 | 100.00 |
| Nazir | 1297 | 1297 | 100.00 |
| Nedarim | 1504 | 1504 | 100.00 |
| Nehemiah | 405 | 405 | 100.00 |
| Netinah LaGer | 5 | 5 | 100.00 |
| Niddah | 2660 | 2660 | 100.00 |
| Nimukei Yosef on Bava Metzia | 8 | 8 | 100.00 |
| Notes by Heinrich Guggenheimer on Jerusalem Talmud | 908 | 908 | 100.00 |
| Numbers | 1288 | 1288 | 100.00 |
| Obadiah | 21 | 21 | 100.00 |
| Ohel Ya'akov on Torah | 13 | 13 | 100.00 |
| Ohr Chadash | 62 | 62 | 100.00 |
| Onkelos Deuteronomy | 956 | 956 | 100.00 |
| Onkelos Exodus | 1210 | 1210 | 100.00 |
| Onkelos Genesis | 1533 | 1533 | 100.00 |
| Onkelos Leviticus | 859 | 859 | 100.00 |
| Onkelos Numbers | 1288 | 1288 | 100.00 |
| Or HaChaim on Deuteronomy | 890 | 885 | 99.44 |
| Or HaChaim on Exodus | 1398 | 1392 | 99.57 |
| Or HaChaim on Genesis | 1533 | 2 | 0.13 |
| Or HaChaim on Leviticus | 917 | 915 | 99.78 |
| Or HaChaim on Numbers | 1031 | 1026 | 99.52 |
| Paaneach Raza | 1 | 1 | 100.00 |
| Palgei Mayim on Lamentations | 5 | 5 | 100.00 |
| Penei David | 14 | 14 | 100.00 |
| Penei Moshe on Jerusalem Talmud Berakhot | 5 | 5 | 100.00 |
| Penei Yehoshua on Bava Kamma | 3 | 3 | 100.00 |
| Penei Yehoshua on Bava Metzia | 1 | 1 | 100.00 |
| Penei Yehoshua on Kiddushin | 1 | 1 | 100.00 |
| Penei Yehoshua on Shabbat | 13 | 13 | 100.00 |
| Pesachim | 3514 | 3514 | 100.00 |
| Petach Einayim on Avodah Zarah | 1 | 1 | 100.00 |
| Petach Einayim on Berakhot | 4 | 3 | 75.00 |
| Petach Einayim on Sanhedrin | 3 | 3 | 100.00 |
| Pirkei Avot | 108 | 108 | 100.00 |
| Piskei Tosafot on Yevamot | 2 | 2 | 100.00 |
| Proverbs | 915 | 915 | 100.00 |
| Psalms | 2527 | 2527 | 100.00 |
| Rabbeinu Bahya | 5476 | 0 | 0.00 |
| Rabbeinu Chananel on Avodah Zarah | 1 | 1 | 100.00 |
| Rabbeinu Chananel on Beitzah | 2 | 2 | 100.00 |
| Rabbeinu Chananel on Chagigah | 5 | 5 | 100.00 |
| Rabbeinu Chananel on Deuteronomy | 1 | 1 | 100.00 |
| Rabbeinu Chananel on Exodus | 49 | 49 | 100.00 |
| Rabbeinu Chananel on Genesis | 32 | 32 | 100.00 |
| Rabbeinu Chananel on Horayot | 2 | 2 | 100.00 |
| Rabbeinu Chananel on Leviticus | 4 | 4 | 100.00 |
| Rabbeinu Chananel on Numbers | 8 | 8 | 100.00 |
| Rabbeinu Chananel on Pesachim | 1 | 1 | 100.00 |
| Rabbeinu Chananel on Taanit | 7 | 7 | 100.00 |
| Rabbeinu Gershom on Bava Batra | 17 | 17 | 100.00 |
| Rabbeinu Yonah on Berakhot | 17 | 4 | 23.53 |
| Rabbeinu Yonah on Pirkei Avot | 438 | 438 | 100.00 |
| Radak on Amos | 4 | 4 | 100.00 |
| Radak on Ezekiel | 2 | 2 | 100.00 |
| Radak on Genesis | 2369 | 0 | 0.00 |
| Radak on I Chronicles | 429 | 0 | 0.00 |
| Radak on I Kings | 4 | 4 | 100.00 |
| Radak on I Samuel | 103 | 103 | 100.00 |
| Radak on II Kings | 8 | 8 | 100.00 |
| Radak on II Samuel | 9 | 5 | 55.56 |
| Radak on Isaiah | 29 | 29 | 100.00 |
| Radak on Jeremiah | 13 | 13 | 100.00 |
| Radak on Jonah | 23 | 23 | 100.00 |
| Radak on Joshua | 8 | 8 | 100.00 |
| Radak on Judges | 83 | 83 | 100.00 |
| Radak on Malachi | 2 | 2 | 100.00 |
| Radak on Psalms | 653 | 125 | 19.14 |
| Radak on Zechariah | 49 | 8 | 16.33 |
| Ralbag Beur HaMilot on Torah | 8 | 8 | 100.00 |
| Ralbag Esther | 1 | 1 | 100.00 |
| Ralbag Ruth | 26 | 26 | 100.00 |
| Ralbag on I Kings | 31 | 1 | 3.23 |
| Ralbag on I Samuel | 3 | 3 | 100.00 |
| Ralbag on II Kings | 35 | 35 | 100.00 |
| Ralbag on II Samuel | 3 | 2 | 66.67 |
| Ralbag on Joshua | 1 | 1 | 100.00 |
| Ralbag on Judges | 1 | 1 | 100.00 |
| Ralbag on Nehemiah | 1 | 1 | 100.00 |
| Ralbag on Proverbs | 1 | 1 | 100.00 |
| Ralbag on Song of Songs | 13 | 13 | 100.00 |
| Ralbag on Torah | 167 | 167 | 100.00 |
| Rambam Introduction to Seder Tahorot | 5 | 5 | 100.00 |
| Rambam Introduction to the Mishnah | 466 | 466 | 100.00 |
| Rambam on Mishnah Avodah Zarah | 7 | 7 | 100.00 |
| Rambam on Mishnah Bava Batra | 8 | 8 | 100.00 |
| Rambam on Mishnah Bava Kamma | 159 | 159 | 100.00 |
| Rambam on Mishnah Bava Metzia | 23 | 23 | 100.00 |
| Rambam on Mishnah Bekhorot | 9 | 9 | 100.00 |
| Rambam on Mishnah Berakhot | 1 | 1 | 100.00 |
| Rambam on Mishnah Challah | 9 | 9 | 100.00 |
| Rambam on Mishnah Chullin | 1 | 1 | 100.00 |
| Rambam on Mishnah Eduyot | 1 | 1 | 100.00 |
| Rambam on Mishnah Eruvin | 2 | 2 | 100.00 |
| Rambam on Mishnah Horayot | 4 | 4 | 100.00 |
| Rambam on Mishnah Ketubot | 4 | 4 | 100.00 |
| Rambam on Mishnah Kiddushin | 1 | 1 | 100.00 |
| Rambam on Mishnah Makkot | 1 | 1 | 100.00 |
| Rambam on Mishnah Niddah | 8 | 8 | 100.00 |
| Rambam on Mishnah Pesachim | 170 | 156 | 91.76 |
| Rambam on Mishnah Sanhedrin | 31 | 31 | 100.00 |
| Rambam on Mishnah Terumot | 4 | 4 | 100.00 |
| Rambam on Mishnah Yadayim | 5 | 5 | 100.00 |
| Rambam on Mishnah Yevamot | 2 | 2 | 100.00 |
| Rambam on Mishnah Zevachim | 4 | 4 | 100.00 |
| Rambam on Pirkei Avot | 118 | 118 | 100.00 |
| Ramban on Deuteronomy | 386 | 1 | 0.26 |
| Ramban on Exodus | 517 | 1 | 0.19 |
| Ramban on Genesis | 707 | 11 | 1.56 |
| Ramban on Leviticus | 277 | 2 | 0.72 |
| Ramban on Numbers | 276 | 2 | 0.72 |
| Ran on Avodah Zarah | 22 | 22 | 100.00 |
| Ran on Nedarim | 5 | 5 | 100.00 |
| Rash MiShantz on Mishnah Oholot | 2 | 2 | 100.00 |
| Rashba on Avodah Zarah | 1 | 1 | 100.00 |
| Rashba on Bava Metzia | 6 | 6 | 100.00 |
| Rashba on Berakhot | 6 | 4 | 66.67 |
| Rashba on Niddah | 2 | 2 | 100.00 |
| Rashbam on Bava Batra | 45 | 45 | 100.00 |
| Rashbam on Deuteronomy | 324 | 303 | 93.52 |
| Rashbam on Exodus | 773 | 548 | 70.89 |
| Rashbam on Genesis | 782 | 481 | 61.51 |
| Rashbam on Leviticus | 294 | 261 | 88.78 |
| Rashbam on Numbers | 290 | 248 | 85.52 |
| Rashbam on Pesachim | 5 | 5 | 100.00 |
| Rashi on Amos | 246 | 246 | 100.00 |
| Rashi on Arakhin | 10 | 10 | 100.00 |
| Rashi on Avodah Zarah | 178 | 178 | 100.00 |
| Rashi on Avot | 81 | 81 | 100.00 |
| Rashi on Bava Batra | 111 | 111 | 100.00 |
| Rashi on Bava Kamma | 302 | 302 | 100.00 |
| Rashi on Bava Metzia | 242 | 242 | 100.00 |
| Rashi on Beitzah | 14 | 14 | 100.00 |
| Rashi on Bekhorot | 2 | 2 | 100.00 |
| Rashi on Berakhot | 142 | 137 | 96.48 |
| Rashi on Chagigah | 67 | 67 | 100.00 |
| Rashi on Chullin | 112 | 112 | 100.00 |
| Rashi on Daniel | 762 | 762 | 100.00 |
| Rashi on Deuteronomy | 1368 | 1368 | 100.00 |
| Rashi on Ecclesiastes | 598 | 598 | 100.00 |
| Rashi on Eruvin | 28 | 28 | 100.00 |
| Rashi on Esther | 148 | 148 | 100.00 |
| Rashi on Exodus | 1817 | 1781 | 98.02 |
| Rashi on Ezekiel | 1770 | 1770 | 100.00 |
| Rashi on Ezra | 434 | 434 | 100.00 |
| Rashi on Genesis | 2018 | 1628 | 80.67 |
| Rashi on Gittin | 175 | 175 | 100.00 |
| Rashi on Habakkuk | 143 | 143 | 100.00 |
| Rashi on Haggai | 48 | 48 | 100.00 |
| Rashi on Horayot | 2 | 2 | 100.00 |
| Rashi on Hosea | 415 | 415 | 100.00 |
| Rashi on I Chronicles | 619 | 619 | 100.00 |
| Rashi on I Kings | 629 | 629 | 100.00 |
| Rashi on I Samuel | 640 | 640 | 100.00 |
| Rashi on II Chronicles | 692 | 692 | 100.00 |
| Rashi on II Kings | 504 | 498 | 98.81 |
| Rashi on II Samuel | 473 | 473 | 100.00 |
| Rashi on Isaiah | 2703 | 2703 | 100.00 |
| Rashi on Jeremiah | 1356 | 1348 | 99.41 |
| Rashi on Job | 1496 | 1496 | 100.00 |
| Rashi on Joel | 98 | 98 | 100.00 |
| Rashi on Jonah | 53 | 53 | 100.00 |
| Rashi on Joshua | 362 | 362 | 100.00 |
| Rashi on Judges | 457 | 457 | 100.00 |
| Rashi on Keritot | 1 | 1 | 100.00 |
| Rashi on Ketubot | 65 | 65 | 100.00 |
| Rashi on Kiddushin | 323 | 323 | 100.00 |
| Rashi on Lamentations | 228 | 228 | 100.00 |
| Rashi on Leviticus | 1332 | 1330 | 99.85 |
| Rashi on Makkot | 68 | 68 | 100.00 |
| Rashi on Malachi | 86 | 86 | 100.00 |
| Rashi on Megillah | 297 | 297 | 100.00 |
| Rashi on Menachot | 18 | 18 | 100.00 |
| Rashi on Micah | 179 | 179 | 100.00 |
| Rashi on Nahum | 118 | 118 | 100.00 |
| Rashi on Nazir | 84 | 84 | 100.00 |
| Rashi on Nedarim | 9 | 9 | 100.00 |
| Rashi on Nehemiah | 451 | 451 | 100.00 |
| Rashi on Niddah | 11 | 11 | 100.00 |
| Rashi on Numbers | 1292 | 1292 | 100.00 |
| Rashi on Obadiah | 35 | 35 | 100.00 |
| Rashi on Pesachim | 16 | 15 | 93.75 |
| Rashi on Proverbs | 1159 | 1159 | 100.00 |
| Rashi on Psalms | 2503 | 2503 | 100.00 |
| Rashi on Rosh Hashanah | 58 | 58 | 100.00 |
| Rashi on Ruth | 83 | 83 | 100.00 |
| Rashi on Sanhedrin | 103 | 98 | 95.15 |
| Rashi on Shabbat | 352 | 352 | 100.00 |
| Rashi on Shevuot | 44 | 44 | 100.00 |
| Rashi on Song of Songs | 387 | 387 | 100.00 |
| Rashi on Sotah | 209 | 207 | 99.04 |
| Rashi on Sukkah | 184 | 184 | 100.00 |
| Rashi on Taanit | 106 | 106 | 100.00 |
| Rashi on Yevamot | 34 | 34 | 100.00 |
| Rashi on Yoma | 27 | 27 | 100.00 |
| Rashi on Zechariah | 366 | 366 | 100.00 |
| Rashi on Zephaniah | 81 | 81 | 100.00 |
| Rashi on Zevachim | 18 | 18 | 100.00 |
| Rav Hirsch on Torah | 7604 | 0 | 0.00 |
| Rav Peninim on Proverbs | 1 | 1 | 100.00 |
| Redeeming Relevance; Deuteronomy | 493 | 493 | 100.00 |
| Redeeming Relevance; Exodus | 480 | 480 | 100.00 |
| Redeeming Relevance; Genesis | 361 | 361 | 100.00 |
| Reggio on Torah | 18 | 12 | 66.67 |
| Reshimot Shiurim on Bava Kamma | 2 | 2 | 100.00 |
| Reshimot Shiurim on Berakhot | 150 | 127 | 84.67 |
| Reshimot Shiurim on Sanhedrin | 6 | 6 | 100.00 |
| Rif Avodah Zarah | 4 | 4 | 100.00 |
| Rif Bava Batra | 2 | 2 | 100.00 |
| Rif Berakhot | 11 | 7 | 63.64 |
| Rif Kiddushin | 7 | 7 | 100.00 |
| Rif Megillah | 12 | 12 | 100.00 |
| Rif Pesachim | 4 | 4 | 100.00 |
| Rif Rosh Hashanah | 1 | 1 | 100.00 |
| Ritva on Avodah Zarah | 2 | 2 | 100.00 |
| Ritva on Berakhot | 15 | 12 | 80.00 |
| Ritva on Kiddushin | 1 | 1 | 100.00 |
| Ritva on Megillah | 2 | 2 | 100.00 |
| Ritva on Pesachim | 9 | 9 | 100.00 |
| Ritva on Sukkah | 6 | 6 | 100.00 |
| Rosh David | 1 | 1 | 100.00 |
| Rosh Hashanah | 1024 | 1024 | 100.00 |
| Rosh on Avodah Zarah | 1 | 1 | 100.00 |
| Rosh on Bava Kamma | 1 | 1 | 100.00 |
| Rosh on Bava Metzia | 1 | 1 | 100.00 |
| Rosh on Berakhot | 6 | 6 | 100.00 |
| Rosh on Kiddushin | 1 | 1 | 100.00 |
| Rosh on Pesachim | 4 | 4 | 100.00 |
| Rosh on Rosh Hashanah | 16 | 16 | 100.00 |
| Rosh on Sanhedrin | 3 | 3 | 100.00 |
| Rosh on Shabbat | 2 | 2 | 100.00 |
| Rosh on Torah | 1 | 1 | 100.00 |
| Ruth | 85 | 85 | 100.00 |
| Saadia Gaon on Deuteronomy | 3 | 3 | 100.00 |
| Saadia Gaon on Exodus | 2 | 2 | 100.00 |
| Saadia Gaon on Genesis | 13 | 13 | 100.00 |
| Saadia Gaon on Numbers | 3 | 2 | 66.67 |
| Sanhedrin | 4163 | 4163 | 100.00 |
| Sefer Daniel; Opportunity in Exile | 706 | 706 | 100.00 |
| Sforno on Deuteronomy | 695 | 495 | 71.22 |
| Sforno on Exodus | 830 | 783 | 94.34 |
| Sforno on Genesis | 1286 | 889 | 69.13 |
| Sforno on Leviticus | 315 | 315 | 100.00 |
| Sforno on Numbers | 506 | 462 | 91.30 |
| Shabbat | 3773 | 3773 | 100.00 |
| Shadal on Deuteronomy | 2 | 2 | 100.00 |
| Shadal on Exodus | 37 | 37 | 100.00 |
| Shadal on Genesis | 92 | 91 | 98.91 |
| Shadal on Leviticus | 6 | 6 | 100.00 |
| Shadal on Numbers | 7 | 7 | 100.00 |
| Shelom Esther | 4 | 4 | 100.00 |
| Shevuot | 1553 | 1553 | 100.00 |
| Sheyarei Korban on Jerusalem Talmud Pesachim | 1 | 1 | 100.00 |
| Shiltei HaGiborim on Megillah | 4 | 4 | 100.00 |
| Shiltei HaGiborim on Menachot | 2 | 2 | 100.00 |
| Shita Mekubetzet on Bava Metzia | 43 | 43 | 100.00 |
| Shita Mekubetzet on Berakhot | 1 | 1 | 100.00 |
| Siftei Chakhamim | 5828 | 5818 | 99.83 |
| Song of Songs | 117 | 117 | 100.00 |
| Sotah | 1634 | 1634 | 100.00 |
| Steinsaltz on Bava Metzia | 7 | 7 | 100.00 |
| Steinsaltz on Berakhot | 6 | 6 | 100.00 |
| Steinsaltz on Sanhedrin | 10 | 10 | 100.00 |
| Sukkah | 1361 | 1361 | 100.00 |
| Taanit | 895 | 894 | 99.89 |
| Tafsir Rasag | 326 | 326 | 100.00 |
| Tamid | 205 | 205 | 100.00 |
| Targum Jerusalem | 4137 | 3789 | 91.59 |
| Targum Jonathan on Deuteronomy | 956 | 956 | 100.00 |
| Targum Jonathan on Exodus | 1210 | 1210 | 100.00 |
| Targum Jonathan on Ezekiel | 63 | 63 | 100.00 |
| Targum Jonathan on Genesis | 1530 | 1530 | 100.00 |
| Targum Jonathan on Isaiah | 1291 | 1291 | 100.00 |
| Targum Jonathan on Jeremiah | 40 | 40 | 100.00 |
| Targum Jonathan on Jonah | 48 | 48 | 100.00 |
| Targum Jonathan on Leviticus | 859 | 859 | 100.00 |
| Targum Jonathan on Malachi | 11 | 11 | 100.00 |
| Targum Jonathan on Numbers | 1288 | 1288 | 100.00 |
| Targum Jonathan on Obadiah | 21 | 20 | 95.24 |
| Targum Jonathan on Zechariah | 9 | 9 | 100.00 |
| Targum Neofiti | 8 | 8 | 100.00 |
| Targum Sheni on Esther | 157 | 118 | 75.16 |
| Targum of I Chronicles | 86 | 86 | 100.00 |
| Temurah | 1146 | 1146 | 100.00 |
| Toledot Yitzchak on Torah | 2 | 0 | 0.00 |
| Torah Temimah on Torah | 38 | 30 | 78.95 |
| Tosafot HaRosh on Kiddushin | 3 | 3 | 100.00 |
| Tosafot Rid on Avodah Zarah Second Recension | 3 | 3 | 100.00 |
| Tosafot Yeshanim on Yoma | 1 | 1 | 100.00 |
| Tosafot Yom Tov Introduction to the Mishnah | 31 | 31 | 100.00 |
| Tosafot Yom Tov on Mishnah Negaim | 1 | 1 | 100.00 |
| Tosafot Yom Tov on Mishnah Oholot | 3 | 3 | 100.00 |
| Tosafot Yom Tov on Mishnah Pesachim | 1 | 1 | 100.00 |
| Tosafot Yom Tov on Pirkei Avot | 369 | 369 | 100.00 |
| Tosafot on Arakhin | 5 | 5 | 100.00 |
| Tosafot on Avodah Zarah | 119 | 119 | 100.00 |
| Tosafot on Bava Batra | 500 | 24 | 4.80 |
| Tosafot on Bava Kamma | 214 | 5 | 2.34 |
| Tosafot on Bava Metzia | 103 | 36 | 34.95 |
| Tosafot on Beitzah | 3 | 3 | 100.00 |
| Tosafot on Bekhorot | 1 | 1 | 100.00 |
| Tosafot on Berakhot | 191 | 33 | 17.28 |
| Tosafot on Chagigah | 10 | 10 | 100.00 |
| Tosafot on Chullin | 8 | 8 | 100.00 |
| Tosafot on Eruvin | 21 | 21 | 100.00 |
| Tosafot on Gittin | 540 | 20 | 3.70 |
| Tosafot on Ketubot | 345 | 7 | 2.03 |
| Tosafot on Kiddushin | 113 | 113 | 100.00 |
| Tosafot on Makkot | 3 | 2 | 66.67 |
| Tosafot on Megillah | 56 | 26 | 46.43 |
| Tosafot on Menachot | 7 | 7 | 100.00 |
| Tosafot on Nazir | 3 | 3 | 100.00 |
| Tosafot on Nedarim | 4 | 4 | 100.00 |
| Tosafot on Niddah | 2 | 1 | 50.00 |
| Tosafot on Pesachim | 13 | 12 | 92.31 |
| Tosafot on Rosh Hashanah | 9 | 9 | 100.00 |
| Tosafot on Sanhedrin | 13 | 13 | 100.00 |
| Tosafot on Shabbat | 55 | 54 | 98.18 |
| Tosafot on Sotah | 5 | 5 | 100.00 |
| Tosafot on Sukkah | 13 | 13 | 100.00 |
| Tosafot on Taanit | 1 | 1 | 100.00 |
| Tosafot on Yevamot | 3 | 2 | 66.67 |
| Tosafot on Zevachim | 1 | 1 | 100.00 |
| Tractate Avadim | 25 | 25 | 100.00 |
| Tractate Derekh Eretz Rabbah | 99 | 99 | 100.00 |
| Tractate Derekh Eretz Zuta | 128 | 2 | 1.56 |
| Tractate Gerim | 34 | 34 | 100.00 |
| Tractate Kallah | 26 | 26 | 100.00 |
| Tractate Kallah Rabbati | 129 | 129 | 100.00 |
| Tractate Kutim | 21 | 21 | 100.00 |
| Tractate Mezuzah | 23 | 23 | 100.00 |
| Tractate Sefer Torah | 60 | 60 | 100.00 |
| Tractate Semachot | 231 | 231 | 100.00 |
| Tractate Soferim | 227 | 227 | 100.00 |
| Tractate Tefillin | 21 | 21 | 100.00 |
| Tractate Tzitzit | 11 | 11 | 100.00 |
| Tur HaArokh | 2794 | 1884 | 67.43 |
| Tze'enah Ure'enah | 5143 | 5143 | 100.00 |
| Tziyyun LeNefesh Chayyah on Berakhot | 5 | 5 | 100.00 |
| Tzror HaMor on Torah | 6 | 6 | 100.00 |
| Yachin on Mishnah Bava Batra | 2 | 2 | 100.00 |
| Yachin on Mishnah Challah | 3 | 3 | 100.00 |
| Yachin on Mishnah Maasrot | 3 | 3 | 100.00 |
| Yachin on Mishnah Pesachim | 1 | 1 | 100.00 |
| Yachin on Mishnah Taanit | 2 | 2 | 100.00 |
| Yachin on Mishnah Tamid | 13 | 13 | 100.00 |
| Yachin on Mishnah Yadayim | 1 | 1 | 100.00 |
| Yachin on Pirkei Avot | 9 | 9 | 100.00 |
| Yevamot | 3865 | 3865 | 100.00 |
| Yoma | 2268 | 2268 | 100.00 |
| Zechariah | 211 | 211 | 100.00 |
| Zephaniah | 53 | 53 | 100.00 |
| Zevachim | 3814 | 3814 | 100.00 |
