/* otsaplugin — Otzaria position -> Sefaria address.
 *
 * Two independent steps, because a wrong verse is worse than no verse:
 *
 *  1. RESOLVE THE BOOK. Otzaria's Hebrew book title -> Sefaria work key, using
 *     the pack's generated title index (Sefaria's own heTitle plus mechanical
 *     aliases) and the hand-maintained override table baked into it.
 *  2. RESOLVE THE ADDRESS. Parse Otzaria's Hebrew ref into the schema the work
 *     uses (verse / mishnah / daf / halakha / chapter). Then CONFIRM against the
 *     Hebrew text Otzaria actually shows. Anything that does not confirm is
 *     degraded to chapter/daf level and flagged `approximate` — never silently
 *     shown as an exact verse.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});
  var Ref = (NS.Ref = {});

  // ---- Hebrew numerals ----------------------------------------------------

  var LETTERS = {
    '\u05d0': 1, '\u05d1': 2, '\u05d2': 3, '\u05d3': 4, '\u05d4': 5, '\u05d5': 6,
    '\u05d6': 7, '\u05d7': 8, '\u05d8': 9, '\u05d9': 10, '\u05db': 20, '\u05dc': 30,
    '\u05de': 40, '\u05e0': 50, '\u05e1': 60, '\u05e2': 70, '\u05e4': 80, '\u05e6': 90,
    '\u05e7': 100, '\u05e8': 200, '\u05e9': 300, '\u05ea': 400,
    '\u05da': 20, '\u05dd': 40, '\u05df': 50, '\u05e3': 80, '\u05e5': 90,
  };

  /** Mirrors build/sefaria_text.py:hebrew_numeral_to_int. */
  NS.hebrewToInt = function (raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw).trim();
    s = s.replace(/[\u05f3\u05f4'\u2019\u2018"]/g, '');
    if (!s) return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    var total = 0;
    for (var i = 0; i < s.length; i++) {
      var v = LETTERS[s.charAt(i)];
      if (v === undefined) return null;
      total += v;
    }
    return total || null;
  };

  /**
   * Does this string look like a Hebrew numeral rather than a word?
   *
   * Hebrew numerals put letter values in non-increasing order (תרפג =
   * 400+200+80+3), with the standard exceptions ט״ו (15) and ט״ז (16), which avoid
   * spelling the divine name. Words fail on length or on order, so פרק and
   * לאידוע are rejected instead of silently becoming a chapter number.
   */
  NS.isPlausibleNumeral = function (raw) {
    var t = String(raw || '').replace(/[\u05f3\u05f4'"\u2019\s]/g, '');
    if (!t || t.length > 4) return false;
    var values = [];
    for (var i = 0; i < t.length; i++) {
      var v = LETTERS[t.charAt(i)];
      if (v === undefined) return false;
      values.push(v);
    }
    if (values.length === 1) return true;
    for (var j = 1; j < values.length; j++) {
      if (values[j] > values[j - 1]) {
        return t === '\u05d8\u05d5' || t === '\u05d8\u05d6';
      }
    }
    return true;
  };

  // A token that looks like a Hebrew numeral: letters from the numeral set,
  // optionally separated by gershayim/geresh. `ט״ו`, `קכ״ג`, `ב`.
  var NUM_TOKEN = '[\u05d0-\u05ea\u05f3\u05f4\'"\u2019]{1,6}';

  // ---- Daf (Bavli folio) --------------------------------------------------

  /** Sefaria 1-based section -> '2a'. Mirrors build/sefaria_text.py:daf_from_section. */
  NS.dafLabel = function (section) {
    var n = Math.floor((section + 1) / 2);
    return n + (section % 2 === 1 ? 'a' : 'b');
  };

  /** '2a' -> 3. Mirrors build/sefaria_text.py:daf_to_section. */
  NS.dafToSection = function (label) {
    var m = /^\s*(\d+)\s*([abAB])\s*$/.exec(String(label || ''));
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (n < 1) return null;
    return 2 * (n - 1) + (m[2].toLowerCase() === 'a' ? 1 : 2);
  };

  // ---- Ref parsing --------------------------------------------------------

  var RE_PEREK = new RegExp('\\u05e4\\u05e8\\u05e7\\s*(' + NUM_TOKEN + '|\\d+)'); // פרק
  var RE_SIMAN = new RegExp('\\u05e1\\u05d9\\u05de\\u05df\\s*(' + NUM_TOKEN + '|\\d+)'); // סימן
  var RE_PASUK = new RegExp('\\u05e4\\u05e1\\u05d5\\u05e7\\s*(' + NUM_TOKEN + '|\\d+)'); // פסוק
  var RE_MISHNAH = new RegExp('\\u05de\\u05e9\\u05e0\\u05d4\\s*(' + NUM_TOKEN + '|\\d+)'); // משנה
  var RE_HALAKHA = new RegExp('\\u05d4\\u05dc\\u05db\\u05d4\\s*(' + NUM_TOKEN + '|\\d+)'); // הלכה
  var RE_SEIF = new RegExp('\\u05e1\\u05e2\\u05d9\\u05e3\\s*(' + NUM_TOKEN + '|\\d+)'); // סעיף
  // דף <n> [עמוד א | ע"א / ע״א | ב. | ב:]
  // The amud marker arrives in several shapes and all of them must be read, or a
  // daf is reported one whole section early.
  var RE_DAF = new RegExp(
    '\\u05d3\\u05e3\\s*(' + NUM_TOKEN + '|\\d+)\\s*' +
      '(?:' +
        '\\u05e2\\u05de\\u05d5\\u05d3\\s*([\\u05d0\\u05d1])' +
        '|\\u05e2(?:[\"\'\\u05f3\\u05f4\\u2019])?\\s*([\\u05d0\\u05d1]|a|b)' +
        '|([.:])' +
      ')?',
    'i'
  );
  var RE_DAF_SHORT = new RegExp('(?:^|[^\\u05d0-\\u05ea])(' + NUM_TOKEN + '|\\d+)\\s*([.:\\u05f3\\u05f4\'])', 'i'); // ב. / ב: / ב׳
  // 3:5 / ג:ה / ג׳:ה׳ — either side may be Arabic or Hebrew numerals.
  var RE_CHAPTER_VERSE = new RegExp('^\\s*(\\d+|' + NUM_TOKEN + ')\\s*[:,\\u05f3\\u05f4]\\s*(\\d+|' + NUM_TOKEN + ')\\s*$');

  /**
   * Parse an Otzaria Hebrew ref.
   * @returns {{chapter:?number, sub:?number, dafSection:?number, level:string, exact:boolean}}
   */
  Ref.parse = function (ref, schema) {
    var out = { chapter: null, sub: null, dafSection: null, level: 'none', exact: false, raw: ref || '' };
    if (!ref) return out;
    var s = String(ref);

    if (schema === 'daf') {
      var m = RE_DAF.exec(s);
      if (m) {
        var dafNo = NS.hebrewToInt(m[1]);
        var amud = null;
        var amudRaw = m[2] || m[3] || '';
        if (/[\u05d0a]/i.test(amudRaw)) amud = 'a';
        else if (/[\u05d1b]/i.test(amudRaw)) amud = 'b';
        // "ב." is amud a, "ב:" is amud b — Otzaria's short form.
        if (!amud && m[4]) amud = m[4] === ':' ? 'b' : 'a';
        if (dafNo) {
          out.dafSection = NS.dafToSection(dafNo + (amud || 'a'));
          out.chapter = out.dafSection;
          out.level = amud ? 'daf' : 'daf-partial';
          out.exact = !!amud;
          return out;
        }
      }
      var short = RE_DAF_SHORT.exec(s);
      if (short) {
        var d = NS.hebrewToInt(short[1]);
        if (d) {
          // A trailing '.' is Otzaria's "amud a", ':' is "amud b".
          var mark = short[2];
          var am = mark === ':' ? 'b' : 'a';
          out.dafSection = NS.dafToSection(d + am);
          out.chapter = out.dafSection;
          out.level = 'daf';
          out.exact = true;
          return out;
        }
      }
      var bare = NS.hebrewToInt(s.replace(/[^\u05d0-\u05ea\u05f3\u05f4]/g, ''));
      if (bare) {
        out.chapter = bare;
        out.level = 'daf-partial';
        return out;
      }
      return out;
    }

    // Chapter-level address. Mishnah Berurah and Shulchan Arukh use simanim.
    var chapterMatch = (schema === 'siman' ? RE_SIMAN : RE_PEREK).exec(s);
    if (chapterMatch) out.chapter = NS.hebrewToInt(chapterMatch[1]);
    var subRe = schema === 'mishnah' ? RE_MISHNAH : schema === 'halakha' ? RE_HALAKHA : schema === 'siman' ? RE_SEIF : RE_PASUK;
    var sub = subRe.exec(s);
    if (sub) out.sub = NS.hebrewToInt(sub[1]);
    if (!sub && schema !== 'siman') {
      var pasuk = RE_PASUK.exec(s);
      if (pasuk) out.sub = NS.hebrewToInt(pasuk[1]);
    }

    if (out.chapter === null) {
      var cv = RE_CHAPTER_VERSE.exec(s.trim());
      if (cv) {
        var cvChapter = NS.hebrewToInt(cv[1]);
        var cvSub = NS.hebrewToInt(cv[2]);
        // Both sides must be readable as numbers. If only one is, we would be
        // guessing at the other, and a guessed verse is worse than no verse.
        if (cvChapter !== null && cvSub !== null) {
          out.chapter = cvChapter;
          out.sub = cvSub;
        }
      }
    }
    if (out.chapter === null) {
      // A bare Hebrew numeral is the chapter.
      var only = s.replace(/[\u05f3\u05f4'"\u2019\s]/g, '');
      // Only when it actually looks like a numeral: every Hebrew letter has a
      // value, so without this guard "לא ידוע" ("unknown") reads as chapter 121.
      if (only && NS.isPlausibleNumeral(only)) out.chapter = NS.hebrewToInt(only);
      else if (/^\d+$/.test(s.trim())) out.chapter = parseInt(s.trim(), 10);
    }

    if (out.chapter !== null && out.sub !== null) {
      out.level = 'sub';
      out.exact = true;
    } else if (out.chapter !== null) {
      out.level = 'chapter';
    }
    return out;
  };

  // ---- Book resolution ----------------------------------------------------

  NS.normalizeTitle = function (title) {
    var t = String(title || '')
      .trim()
      .toLowerCase()
      .replace(/[\u05f3\u05f4'"\u2019\u2018\u00b4]/g, '')
      .replace(/[,.\u003a;\u060c\u061b]/g, ' ')
      .replace(/\u05be/g, ' ');
    var parts = t.split(/\s+/);
    while (parts.length) {
      if (parts[0] === '\u05de\u05e9\u05e0\u05d4' && parts[1] === '\u05ea\u05d5\u05e8\u05d4') {
        parts.splice(0, 2); // Mishneh Torah / Rambam prefix
      } else if (
        parts[0] === '\u05de\u05e9\u05e0\u05d4' ||
        parts[0] === '\u05de\u05e1\u05db\u05ea' ||
        parts[0] === '\u05e8\u05de\u05d1\u05dd'
      ) {
        parts.splice(0, 1);
      } else {
        break;
      }
    }
    return parts.join(' ').trim();
  };

  /**
   * Resolve an Otzaria book title to a Sefaria work key using the pack's title
   * index. Returns null when the pack has no English for that book.
   */
  Ref.resolveBook = function (manifest, otzariaTitle) {
    if (!manifest || !otzariaTitle) return null;
    var n = NS.normalizeTitle(otzariaTitle);
    if (!n) return null;
    var idx = manifest.titleIndex || {};
    if (!idx[n]) return null;
    // A list here means the title is ambiguous ("ברכות" is both Mishnah and
    // Bavli). Hand the list back; the caller must ask, never pick.
    return idx[n];
  };

  /**
   * Walk a `library.getTree` result and report which Otzaria books map to a work
   * in the pack. Used by the "Coverage" screen and by tests; the same function
   * powers reports/otzaria-coverage at runtime.
   */
  Ref.coverage = function (manifest, tree) {
    var mapped = [];
    var unmapped = [];
    (function walk(node) {
      if (!node) return;
      var books = node.books || [];
      for (var i = 0; i < books.length; i++) {
        var b = books[i];
        var title = b.title || b.bookId;
        var key = Ref.resolveBook(manifest, title);
        (key ? mapped : unmapped).push({ title: title, path: node.path, work: key, type: b.type });
      }
      var cats = node.categories || [];
      for (var j = 0; j < cats.length; j++) walk(cats[j]);
    })(tree);
    return { mapped: mapped, unmapped: unmapped, total: mapped.length + unmapped.length };
  };

  // ---- Segment location ---------------------------------------------------

  /**
   * Find which segment of `unit` contains `hebrewText`.
   *
   * @param {object} unit  a pack unit: { a, e, h?, p, al }
   * @param {string} hebrewText  the Hebrew the user selected (or the section text)
   * @returns {{index:number, score:number}|null}  index -1 means "the whole unit"
   */
  Ref.locateSegment = function (unit, hebrewText) {
    if (!unit || !unit.h) return null;
    var needle = NS.normalizeHebrew(hebrewText);
    if (!needle) return null;
    var needleTokens = needle.split(' ');
    var best = -1;
    var bestScore = 0;
    for (var i = 0; i < unit.h.length; i++) {
      var hay = NS.normalizeHebrew(unit.h[i]);
      if (!hay) continue;
      if (hay.indexOf(needle) >= 0 || needle.indexOf(hay) >= 0) {
        return { index: i, score: 1 };
      }
      var hits = 0;
      for (var k = 0; k < needleTokens.length; k++) {
        if (hay.indexOf(needleTokens[k]) >= 0) hits++;
      }
      var score = hits / needleTokens.length;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    // Below this the match is a guess; report "no segment" rather than a wrong
    // verse. The caller then falls back to the whole chapter/daf.
    if (bestScore < 0.6) return null;
    return { index: best, score: bestScore };
  };

  /** Similarity between Otzaria's section text and the Sefaria Hebrew of a unit. */
  Ref.unitSimilarity = function (unit, otzariaSectionText) {
    if (!unit || !unit.h) return 0;
    return NS.similarity(unit.h.join(' '), otzariaSectionText || '');
  };

  /** Pick the unit whose address matches a parsed ref. */
  Ref.unitFor = function (chunk, parsed) {
    if (!chunk || !chunk.units) return null;
    var want = parsed.chapter;
    if (want === null || want === undefined) return null;
    for (var i = 0; i < chunk.units.length; i++) {
      if (chunk.units[i].a && chunk.units[i].a[0] === want) return chunk.units[i];
    }
    return null;
  };
})();
