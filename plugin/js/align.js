/* otsaplugin — aligning Otzaria's own Hebrew to the pack's per-segment Hebrew.
 *
 * The English in the pack is segmented (one entry per verse / mishnah / line) and
 * ships with Sefaria's normalised Hebrew for the same segment (`unit.h`). The
 * reader, however, is showing *Otzaria's* Hebrew, and the requirement is to show
 * that text — not a second copy of Sefaria's — whenever it can be tied back to
 * the segment without guessing.
 *
 * So we align letter-for-letter. Both sides are reduced to bare Hebrew letters
 * (niqqud, punctuation, geresh/gershayim, HTML tags and whitespace all dropped),
 * and the pack's segments are concatenated. The alignment succeeds only when
 * Otzaria's section text contains exactly that letter sequence — then every
 * letter of the section maps back to one segment, and the segment's Otzaria
 * Hebrew is the slice of the original text those letters came from (so niqqud
 * and punctuation are preserved for display).
 *
 * Anything less than an exact letter-sequence match returns `aligned: false`.
 * The caller then shows the section as a whole and says the alignment is
 * approximate. Never a re-split guess.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});

  // Hebrew letters, including the five final forms. U+05D0-U+05EA.
  var HEBREW_LETTER = /[\u05d0-\u05ea]/;

  function hebrewLetters(text, label) {
    var chars = [];
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (HEBREW_LETTER.test(ch)) chars.push({ ch: ch, at: i, k: label });
    }
    return chars;
  }

  /**
   * @param {string} otzariaText  the section text the reader is showing
   * @param {string[]} segments   per-segment Hebrew (the pack's `unit.h`)
   * @returns {{aligned:boolean, reason:string, spans:(Array<number[]>|null), headerPrefix:boolean}}
   */
  NS.alignHebrew = function (otzariaText, segments) {
    var out = { aligned: false, reason: 'no-text', spans: null, headerPrefix: false };
    if (!otzariaText || !segments || !segments.length) return out;

    var A = hebrewLetters(otzariaText, -1);
    if (!A.length) {
      out.reason = 'no-hebrew-in-otzaria-text';
      return out;
    }

    // B: the pack's segments concatenated, each letter tagged with its segment.
    var B = [];
    var empty = [];
    for (var k = 0; k < segments.length; k++) {
      var letters = hebrewLetters(segments[k], k);
      if (!letters.length) empty.push(k);
      for (var j = 0; j < letters.length; j++) B.push(letters[j]);
    }
    if (!B.length) {
      out.reason = 'no-hebrew-in-pack';
      return out;
    }

    var aStr = '';
    for (var i = 0; i < A.length; i++) aStr += A[i].ch;
    var bStr = '';
    for (var q = 0; q < B.length; q++) bStr += B[q].ch;

    var start = aStr.indexOf(bStr);
    if (start < 0) {
      out.reason = 'letter-sequence-mismatch';
      return out;
    }
    // A repeated occurrence means the match is not unique — refuse rather than
    // pick one and risk labelling the wrong span.
    if (aStr.indexOf(bStr, start + 1) >= 0) {
      out.reason = 'ambiguous-match';
      return out;
    }
    if (start > 0) out.headerPrefix = true;

    var spans = [];
    for (var s2 = 0; s2 < segments.length; s2++) spans.push(null);
    for (var t = 0; t < B.length; t++) {
      var segIndex = B[t].k;
      var offset = A[start + t].at;
      var cur = spans[segIndex];
      if (!cur) spans[segIndex] = [offset, offset + 1];
      else cur[1] = offset + 1;
    }
    // A segment with no Hebrew letters (an empty Sefaria segment) keeps `null`;
    // callers must not render it as if it were aligned.
    out.aligned = empty.length === 0;
    out.emptySegments = empty;
    out.spans = spans;
    out.reason = out.aligned ? 'ok' : 'empty-segments';
    return out;
  };

  /** Slice Otzaria's original text for each aligned segment. */
  NS.sliceAligned = function (otzariaText, alignment) {
    if (!alignment || !alignment.aligned || !alignment.spans) return null;
    var out = [];
    for (var i = 0; i < alignment.spans.length; i++) {
      var span = alignment.spans[i];
      out.push(span ? String(otzariaText).substring(span[0], span[1]).trim() : null);
    }
    return out;
  };
})();
