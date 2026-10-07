/* otsaplugin — runtime HTML whitelist.
 *
 * The pack is already sanitised at build time (build/sanitize_html.py). This is
 * the second, independent gate, and it deliberately does NOT use a browser HTML
 * parser: nothing from the pack is ever assigned to innerHTML, and no
 * DOMParser/document.implementation quirks get a vote. A small explicit
 * tokeniser reads the string, keeps only whitelisted inline elements, copies the
 * single allowed attribute, and hands every piece of text to createTextNode —
 * so escaping stays the browser's job.
 *
 * Being parser-free also means this file runs unchanged under Node, which is how
 * tests/run_tests.js exercises it against the real pack.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});

  var ALLOWED = {
    B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, SMALL: 1, BIG: 1, SUP: 1, SUB: 1, BR: 1, SPAN: 1,
  };
  var VOID_TAGS = { BR: 1, HR: 1, IMG: 1 };
  // Only these class values survive, and only on an allowed element.
  var ALLOWED_CLASS = { 'footnote-marker': 1, footnote: 1 };

  var ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
    lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  };

  /** Decode the handful of entities that can appear in sanitised pack text. */
  NS.decodeEntities = function (s) {
    return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (whole, body) {
      if (body.charAt(0) === '#') {
        var code =
          body.charAt(1) === 'x' || body.charAt(1) === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        if (!isFinite(code) || code < 0 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch (e) {
          return whole;
        }
      }
      var key = body.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : whole;
    });
  };

  /** Index of the '>' that closes the tag starting at `lt`, or -1. */
  function tagEnd(s, lt) {
    var quote = null;
    for (var i = lt + 1; i < s.length; i++) {
      var c = s.charAt(i);
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        return i;
      }
    }
    return -1;
  }

  function attrValue(inner, name) {
    var re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
    var m = re.exec(inner);
    if (!m) return null;
    return m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
  }

  /**
   * Append `html` to `target`, keeping only whitelisted inline markup.
   * @returns {number} how many elements were dropped.
   */
  NS.renderSafe = function (target, html) {
    var s = String(html === null || html === undefined ? '' : html);
    if (!s) return 0;
    var dropped = 0;
    var stack = [target];
    var i = 0;

    function text(chunk) {
      if (!chunk) return;
      stack[stack.length - 1].appendChild(document.createTextNode(NS.decodeEntities(chunk)));
    }

    while (i < s.length) {
      var lt = s.indexOf('<', i);
      if (lt < 0) {
        text(s.slice(i));
        break;
      }
      if (lt > i) text(s.slice(i, lt));

      // Comments, doctypes and processing instructions: dropped whole.
      if (s.substr(lt, 4) === '<!--') {
        var close = s.indexOf('-->', lt + 4);
        i = close < 0 ? s.length : close + 3;
        continue;
      }
      if (s.charAt(lt + 1) === '!' || s.charAt(lt + 1) === '?') {
        var gt0 = s.indexOf('>', lt);
        i = gt0 < 0 ? s.length : gt0 + 1;
        continue;
      }

      var gt = tagEnd(s, lt);
      if (gt < 0) {
        // An unterminated '<' is text, not markup.
        text(s.slice(lt));
        break;
      }
      var inner = s.slice(lt + 1, gt);
      i = gt + 1;

      var isClose = inner.charAt(0) === '/';
      if (isClose) inner = inner.slice(1);
      var trimmed = inner.replace(/\s+$/, '');
      var selfClose = /\/$/.test(trimmed);
      if (selfClose) trimmed = trimmed.slice(0, -1);

      var nameMatch = /^\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(trimmed);
      if (!nameMatch) continue;
      var tag = nameMatch[1].toUpperCase();

      if (isClose) {
        // Pop to the matching element if it is open; ignore stray end tags.
        for (var d = stack.length - 1; d > 0; d--) {
          if (stack[d].tagName === tag) {
            stack.length = d;
            break;
          }
        }
        continue;
      }

      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') {
        // Drop the element AND its content: script text is code, not prose.
        dropped++;
        var endRe = new RegExp('<\\s*/\\s*' + tag + '\\s*>', 'i');
        var em = endRe.exec(s.slice(i));
        i = em ? i + em.index + em[0].length : s.length;
        continue;
      }

      if (!ALLOWED[tag]) {
        // Unknown element: keep the text it contained, drop the element.
        dropped++;
        continue;
      }

      var el = document.createElement(tag.toLowerCase());
      var cls = attrValue(trimmed, 'class');
      if (cls !== null && ALLOWED_CLASS[String(cls).trim()]) {
        el.setAttribute('class', String(cls).trim());
      }
      stack[stack.length - 1].appendChild(el);
      if (!VOID_TAGS[tag] && !selfClose) stack.push(el);
    }
    return dropped;
  };

  /** Plain-text projection, used for matching and for `title` attributes. */
  NS.safeText = function (html) {
    var s = String(html === null || html === undefined ? '' : html);
    if (!s) return '';
    var out = '';
    var i = 0;
    while (i < s.length) {
      var lt = s.indexOf('<', i);
      if (lt < 0) {
        out += s.slice(i);
        break;
      }
      out += s.slice(i, lt);
      if (s.substr(lt, 4) === '<!--') {
        var close = s.indexOf('-->', lt + 4);
        i = close < 0 ? s.length : close + 3;
        continue;
      }
      var gt = tagEnd(s, lt);
      if (gt < 0) {
        out += s.slice(lt);
        break;
      }
      var inner = s.slice(lt + 1, gt);
      i = gt + 1;
      var isClose = inner.charAt(0) === '/';
      if (isClose) inner = inner.slice(1);
      var nameMatch = /^\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(inner);
      var tag = nameMatch ? nameMatch[1].toUpperCase() : '';
      if (!isClose && (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT')) {
        var endRe = new RegExp('<\\s*/\\s*' + tag + '\\s*>', 'i');
        var em = endRe.exec(s.slice(i));
        i = em ? i + em.index + em[0].length : s.length;
      }
    }
    return NS.decodeEntities(out);
  };
})();
