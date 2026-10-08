/* otsaplugin — the five reader views.
 *
 * Every renderer receives the same `ctx` and writes into `ctx.host`. Pack text
 * is rendered with createTextNode or the HTML allow-list in sanitize.js.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});
  var Views = (NS.Views = {});

  // ---- address labels -----------------------------------------------------

  Views.addressLabel = function (book, unit, index, segmentGroups) {
    var a = (unit.a && unit.a[0]) || 1;
    var n = segmentGroups && segmentGroups[index] > 0 ? segmentGroups[index] : index + 1;
    switch (book.schema) {
      case 'daf':
        return NS.dafLabel(a) + ':' + n;
      case 'verse':
      case 'mishnah':
      case 'halakha':
      case 'siman':
        return a + ':' + n;
      default:
        return String(index + 1);
    }
  };

  Views.unitLabel = function (book, unit) {
    var a = (unit.a && unit.a[0]) || 1;
    switch (book.schema) {
      case 'daf':
        return NS.t('דף') + ' ' + NS.dafLabel(a);
      case 'siman':
        return NS.t('סימן') + ' ' + a;
      default:
        return NS.t('פרק') + ' ' + a;
    }
  };

  // ---- small builders -----------------------------------------------------

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.appendChild(document.createTextNode(text));
    return node;
  }

  function numberChip(label) {
    return el('span', 'seg-num', label);
  }

  function englishBody(parent, seg, index, ctx) {
    var p = el('span', 'seg-en-body');
    NS.renderSafe(p, seg);
    parent.appendChild(p);
    var notes = ctx.notesFor(index);
    if (notes && notes.length) {
      var details = el('details', 'seg-notes');
      var summary = el('summary', null, NS.t('הערות') + ' (' + notes.length + ')');
      details.appendChild(summary);
      for (var i = 0; i < notes.length; i++) {
        var note = el('div', 'seg-note');
        NS.renderSafe(note, notes[i]);
        details.appendChild(note);
      }
      parent.appendChild(details);
    }
  }

  /** Hebrew text for a segment: Otzaria's own when it was safely aligned. */
  function hebrewFor(ctx, index) {
    if (ctx.hebrew && ctx.hebrew[index] !== undefined && ctx.hebrew[index] !== null) {
      return ctx.hebrew[index];
    }
    if (ctx.unit.h) return ctx.unit.h[index] || '';
    return '';
  }

  function address(ctx, index) {
    return Views.addressLabel(ctx.book, ctx.unit, index, ctx.segmentGroups);
  }

  // ---- the views ----------------------------------------------------------

  /** 1. English only, segmented. */
  Views.english = function (ctx) {
    var list = el('ol', 'seg-list english-only');
    if (!ctx.options.numbers) list.classList.add('no-numbers');
    for (var i = ctx.from; i < ctx.to; i++) {
      var seg = ctx.unit.e[i];
      if (!seg) continue;
      var li = el('li', 'seg');
      li.dataset.index = String(i);
      if (ctx.options.numbers) li.appendChild(numberChip(address(ctx, i)));
      englishBody(li, seg, i, ctx);
      list.appendChild(li);
    }
    ctx.host.appendChild(list);
  };

  /**
   * 2. Side by side: one grid row per passage, Hebrew on one side, English on
   * the other.
   *
   * The row is what gets laid out — the headings and every passage are rows of
   * the same grid — so the two cells of a row are one line of the page and share
   * its height. Passage N is therefore always the English of passage N beside
   * the Hebrew of passage N. Stacking two independent columns instead let each
   * side grow at its own pace: the further down the chapter the reader went, the
   * further the English drifted from the verse it translates, until the pairing
   * could only be guessed at by eye.
   */
  Views.sidebyside = function (ctx) {
    var englishFirst = ctx.options.order === 'english-first';
    var wrap = el('div', 'sbs');
    var grid = el('div', 'sbs-grid');
    grid.classList.add(englishFirst ? 'order-en' : 'order-he');

    var headRow = el('div', 'sbs-row sbs-headrow');
    headRow.appendChild(el('div', 'sbs-head', englishFirst ? NS.t('אנגלית') : NS.t('עברית')));
    headRow.appendChild(el('div', 'sbs-head', englishFirst ? NS.t('עברית') : NS.t('אנגלית')));
    grid.appendChild(headRow);

    if (ctx.unit.al === 1) {
      for (var i = ctx.from; i < ctx.to; i++) {
        grid.appendChild(sbsSegmentRow(ctx, i, englishFirst));
      }
    } else {
      // No confirmed per-passage Hebrew pairing: one row holding the whole
      // section, so the two sides still start together and stay together.
      grid.appendChild(sbsSectionRow(ctx, englishFirst));
    }

    wrap.appendChild(grid);
    ctx.host.appendChild(wrap);
  };

  function sbsCell(cls, dir) {
    var cell = el('div', 'sbs-cell ' + cls);
    cell.dir = dir;
    return cell;
  }

  /** One passage: its Hebrew cell and its English cell, as a single row. */
  function sbsSegmentRow(ctx, i, englishFirst) {
    var row = el('div', 'sbs-row');
    row.dataset.index = String(i);

    var he = sbsCell('sbs-he', 'rtl');
    if (ctx.options.numbers) he.appendChild(numberChip(address(ctx, i)));
    he.appendChild(el('span', 'seg-he-text', hebrewFor(ctx, i)));

    var en = sbsCell('sbs-en', 'ltr');
    if (ctx.options.numbers) en.appendChild(numberChip(address(ctx, i)));
    englishBody(en, ctx.unit.e[i] || '', i, ctx);

    row.appendChild(englishFirst ? en : he);
    row.appendChild(englishFirst ? he : en);
    sbsLink(ctx, row, i);
    return row;
  }

  /** Whole section as one row, used when a 1:1 Hebrew alignment is unavailable. */
  function sbsSectionRow(ctx, englishFirst) {
    var row = el('div', 'sbs-row section-level');

    var he = sbsCell('sbs-he', 'rtl');
    var heText = ctx.hebrew && ctx.hebrew.length ? ctx.hebrew.join(' ') : (ctx.unit.h || []).join(' ');
    he.appendChild(el('span', 'seg-he-text', heText));

    var en = sbsCell('sbs-en', 'ltr');
    for (var i = ctx.from; i < ctx.to; i++) {
      var seg = el('div', 'flow-seg');
      englishBody(seg, ctx.unit.e[i] || '', i, ctx);
      en.appendChild(seg);
    }

    row.appendChild(englishFirst ? en : he);
    row.appendChild(englishFirst ? he : en);
    return row;
  }

  /** Hovering or clicking either half acts on the passage as a whole. */
  function sbsLink(ctx, row, i) {
    row.addEventListener('mouseenter', function () {
      row.classList.add('hl');
    });
    row.addEventListener('mouseleave', function () {
      row.classList.remove('hl');
    });
    row.addEventListener('click', function () {
      NS.focusSegment(ctx, i);
    });
  }

  /** 3. Interleaved: Hebrew segment, English directly beneath. */
  Views.interleaved = function (ctx) {
    var list = el('div', 'interleaved');
    var aligned = ctx.unit.al === 1;
    for (var i = ctx.from; i < ctx.to; i++) {
      var block = el('div', 'ilv-block');
      block.dataset.index = String(i);
      var head = el('div', 'ilv-head');
      if (ctx.options.numbers) head.appendChild(numberChip(address(ctx, i)));
      block.appendChild(head);
      if (aligned) {
        var heLine = el('div', 'ilv-he');
        heLine.dir = 'rtl';
        heLine.appendChild(el('span', 'seg-he-text', hebrewFor(ctx, i)));
        block.appendChild(heLine);
      }
      var enLine = el('div', 'ilv-en');
      enLine.dir = 'ltr';
      englishBody(enLine, ctx.unit.e[i] || '', i, ctx);
      block.appendChild(enLine);
      list.appendChild(block);
    }
    if (!aligned) {
      var section = el('div', 'ilv-he section-level');
      section.dir = 'rtl';
      section.appendChild(el('span', 'seg-he-text', (ctx.unit.h || []).join(' ')));
      list.insertBefore(section, list.firstChild);
    }
    ctx.host.appendChild(list);
  };

  /** 4. Flowing: continuous English for the whole chapter/daf. */
  Views.flowing = function (ctx) {
    var flow = el('div', 'flowing');
    flow.dir = 'ltr';
    for (var i = ctx.from; i < ctx.to; i++) {
      var seg = ctx.unit.e[i];
      if (!seg) continue;
      var span = el('span', 'flow-seg');
      span.dataset.index = String(i);
      if (ctx.options.numbers) span.appendChild(numberChip(address(ctx, i)));
      englishBody(span, seg, i, ctx);
      span.appendChild(document.createTextNode(' '));
      flow.appendChild(span);
    }
    ctx.host.appendChild(flow);
  };

  /** 5. Tap to reveal: Hebrew with the English hidden until tapped. */
  Views.reveal = function (ctx) {
    var list = el('div', 'reveal');
    var aligned = ctx.unit.al === 1;
    if (!aligned) {
      var section = el('div', 'reveal-section');
      section.dir = 'rtl';
      var sectionHebrew = ctx.hebrew && ctx.hebrew.length ? ctx.hebrew : (ctx.unit.h || []);
      section.appendChild(el('span', 'seg-he-text', sectionHebrew.join(' ')));
      list.appendChild(section);
    }
    for (var i = ctx.from; i < ctx.to; i++) {
      var row = el('div', 'reveal-row');
      row.dataset.index = String(i);
      var he = el('div', 'reveal-he');
      he.dir = 'rtl';
      if (ctx.options.numbers) he.appendChild(numberChip(address(ctx, i)));
      if (aligned) he.appendChild(el('span', 'seg-he-text', hebrewFor(ctx, i)));
      var badge = el('span', 'reveal-badge', NS.t('הצג תרגום'));
      he.appendChild(badge);
      row.appendChild(he);

      var en = el('div', 'reveal-en hidden');
      en.dir = 'ltr';
      englishBody(en, ctx.unit.e[i] || '', i, ctx);
      row.appendChild(en);

      (function (rowNode, enNode, badgeNode) {
        function toggle() {
          var shown = !enNode.classList.contains('hidden');
          enNode.classList.toggle('hidden', shown);
          rowNode.classList.toggle('open', !shown);
          badgeNode.textContent = shown ? NS.t('הצג תרגום') : NS.t('הסתר תרגום');
        }
        rowNode.addEventListener('click', toggle);
        rowNode.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            toggle();
          }
        });
        rowNode.tabIndex = 0;
      })(row, en, badge);

      list.appendChild(row);
    }
    ctx.host.appendChild(list);
  };

  Views.LIST = ['english', 'sidebyside', 'interleaved', 'flowing', 'reveal'];

  Views.label = function (view) {
    switch (view) {
      case 'english':
        return NS.t('אנגלית בלבד');
      case 'sidebyside':
        return NS.t('זה לצד זה');
      case 'interleaved':
        return NS.t('משולב');
      case 'flowing':
        return NS.t('רצף');
      case 'reveal':
        return NS.t('לחיצה לחשיפה');
      default:
        return view;
    }
  };
})();
