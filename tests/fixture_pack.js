/* Small in-memory translation pack for the dependency-free Node test suite. */
'use strict';

const sources = [
  {
    id: 0,
    title: 'Test translation',
    license: 'CC0',
    licenseFamily: 'pd',
    url: 'https://example.invalid/test',
    priority: 0,
    segments: 0,
    books: 0,
  },
];

function book(title, he, schema, category, chunk, units) {
  return {
    he,
    cat: [category],
    catHe: [category],
    sec: schema === 'daf'
      ? ['Daf', 'Line']
      : schema === 'siman'
        ? ['Siman', 'Seif']
        : schema === 'halakha'
          ? ['Chapter', 'Halakhah']
          : ['Chapter', schema === 'verse' ? 'Verse' : 'Mishnah'],
    schema,
    n: units.reduce((n, unit) => n + unit.e.length, 0),
    missing: 0,
    aligned: units.filter((unit) => unit.al === 1).length,
    chunk,
    src: [0],
  };
}

const genesisUnits = [
  {
    a: [1],
    e: [
      'In the beginning God created the heaven and the earth.',
      'And the earth was without form, and void; and darkness was upon the face of the deep.',
      'And God said, Let there be light: and there was light.',
      'And God saw the light, that it was good.',
    ],
    p: [[4, 0]],
    al: 1,
    h: [
      'בראשית ברא אלהים את השמים ואת הארץ',
      'והארץ היתה תהו ובהו וחשך על פני תהום',
      'ויאמר אלהים יהי אור ויהי אור',
      'וירא אלהים את האור כי טוב',
    ],
  },
  {
    a: [2],
    e: ['Thus the heavens and the earth were finished.', 'And on the seventh day God ended his work.'],
    p: [[2, 0]],
    al: 1,
    h: ['ויכלו השמים והארץ', 'ויכל אלהים ביום השביעי'],
  },
  {
    a: [3],
    e: ['Now these are the generations of the heavens and of the earth.'],
    p: [[1, 0]],
    al: 1,
    h: ['אלה תולדות השמים והארץ'],
  },
];

const exodusUnits = [
  {
    a: [1],
    e: ['Now these are the names of the children of Israel, which came into Egypt.'],
    p: [[1, 0]],
    al: 1,
    h: ['ואלה שמות בני ישראל הבאים מצרימה'],
  },
  {
    a: [2],
    e: ['And Joseph died, and all his brethren, and all that generation.'],
    p: [[1, 0]],
    al: 1,
    h: ['וימת יוסף וכל אחיו וכל הדור ההוא'],
  },
];

const berakhotUnits = [
  { a: [3], e: ['From what time may one recite the evening Shema?'], p: [[1, 0]], al: 1, h: ['מאימתי קורין את שמע בערבין'] },
  { a: [4], e: ['The sages said: until midnight.'], p: [[1, 0]], al: 1, h: ['וחכמים אומרים עד חצות'] },
];

const mishnahBerakhotUnits = [
  { a: [1], e: ['From what time may one recite the evening Shema?'], p: [[1, 0]], al: 1, h: ['מאימתי קורין את שמע בערבין'] },
  { a: [2], e: ['Until the end of the first watch.'], p: [[1, 0]], al: 1, h: ['עד סוף האשמורה הראשונה'] },
];

const shabbatUnits = [
  { a: [3], e: ['The poor person stands outside.'], p: [[1, 0]], al: 1, h: ['העני עומד בחוץ'] },
];

const mishnahShabbatUnits = [
  { a: [1], e: ['The acts of Shabbat begin at twilight.'], p: [[1, 0]], al: 1, h: ['יציאות השבת שתים שהן ארבע'] },
];

const mishnahBerurahUnits = [
  { a: [1], e: ['One should be careful in the laws of this section.'], p: [[1, 0]], al: 1, h: ['יש להיזהר בהלכות אלו'] },
];
const avotUnits = [
  { a: [1], e: ['Moses received the Torah from Sinai.'], p: [[1, 0]], al: 1, h: ['משה קיבל תורה מסיני'] },
];
const rambamUnits = [
  { a: [1], e: ['One should return to God and confess.'], p: [[1, 0]], al: 1, h: ['ישוב אל ה׳ ויתודה'] },
];

const books = {
  Genesis: book('Genesis', 'בראשית', 'verse', 'Tanakh', 'Genesis', genesisUnits),
  Exodus: book('Exodus', 'שמות', 'verse', 'Tanakh', 'Exodus', exodusUnits),
  Berakhot: book('Berakhot', 'ברכות', 'daf', 'Talmud', 'Berakhot', berakhotUnits),
  'Mishnah Berakhot': book('Mishnah Berakhot', 'משנה ברכות', 'mishnah', 'Mishnah', 'Mishnah_Berakhot', mishnahBerakhotUnits),
  Shabbat: book('Shabbat', 'שבת', 'daf', 'Talmud', 'Shabbat', shabbatUnits),
  'Mishnah Shabbat': book('Mishnah Shabbat', 'משנה שבת', 'mishnah', 'Mishnah', 'Mishnah_Shabat', mishnahShabbatUnits),
  'Mishnah Berurah': book('Mishnah Berurah', 'משנה ברורה', 'siman', 'Halakhah', 'Mishnah_Berurah', mishnahBerurahUnits),
  'Pirkei Avot': book('Pirkei Avot', 'אבות', 'mishnah', 'Mishnah', 'Pirkei_Avot', avotUnits),
  'Mishneh Torah, Repentance': book('Mishneh Torah, Repentance', 'משנה תורה, הלכות תשובה', 'halakha', 'Halakhah', 'Mishneh_Torah_Repentance', rambamUnits),
};

const titleIndex = {
  'בראשית': 'Genesis',
  genesis: 'Genesis',
  'שמות': 'Exodus',
  exodus: 'Exodus',
  'ברכות': ['Berakhot', 'Mishnah Berakhot'],
  'משנה ברכות': 'Mishnah Berakhot',
  berakhot: 'Berakhot',
  'שבת': ['Shabbat', 'Mishnah Shabbat'],
  'משנה שבת': 'Mishnah Shabbat',
  shabbat: 'Shabbat',
  'ברורה': 'Mishnah Berurah',
  'משנה ברורה': 'Mishnah Berurah',
  'אבות': 'Pirkei Avot',
  'pirkei avot': 'Pirkei Avot',
  'הלכות תשובה': 'Mishneh Torah, Repentance',
  'mishneh torah repentance': 'Mishneh Torah, Repentance',
};

const chunks = {
  Genesis: { book: 'Genesis', units: genesisUnits },
  Exodus: { book: 'Exodus', units: exodusUnits },
  Berakhot: { book: 'Berakhot', units: berakhotUnits },
  Mishnah_Berakhot: { book: 'Mishnah Berakhot', units: mishnahBerakhotUnits },
  Shabbat: { book: 'Shabbat', units: shabbatUnits },
  Mishnah_Shabat: { book: 'Mishnah Shabbat', units: mishnahShabbatUnits },
  Mishnah_Berurah: { book: 'Mishnah Berurah', units: mishnahBerurahUnits },
  Pirkei_Avot: { book: 'Pirkei Avot', units: avotUnits },
  Mishneh_Torah_Repentance: { book: 'Mishneh Torah, Repentance', units: rambamUnits },
};

const manifest = {
  formatVersion: 1,
  sefaria: { commit: 'test-fixture', builtAt: 'test' },
  stats: {
    books: Object.keys(books).length,
    segments: Object.values(books).reduce((n, value) => n + value.n, 0),
  },
  sources,
  books,
  titleIndex,
};

sources[0].books = manifest.stats.books;
sources[0].segments = manifest.stats.segments;

module.exports = { manifest, chunks };
