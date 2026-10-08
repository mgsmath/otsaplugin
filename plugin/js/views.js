/* otsaplugin — the six reader views.
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

  /** 2. Side by side, aligned per segment when the text permits it. */
  Views.sidebyside = function (ctx) {
    var wrap = el('div', 'sbs');
    var grid = el('div', 'sbs-grid');
    grid.classList.add(ctx.options.order === 'english-first' ? 'order-en' : 'order-he');
    var heCol = el('div', 'sbs-col sbs-he');
    var enCol = el('div', 'sbs-col sbs-en');
    heCol.dir = 'rtl';
    enCol.dir = 'ltr';
    heCol.appendChild(el('div', 'sbs-head', NS.t('עברית')));
    enCol.appendChild(el('div', 'sbs-head', NS.t('אנגלית')));

    if (ctx.unit.al !== 1) {
      Views.sectionColumns(ctx, heCol, enCol);
      grid.appendChild(ctx.options.order === 'english-first' ? enCol : heCol);
      grid.appendChild(ctx.options.order === 'english-first' ? heCol : enCol);
      wrap.appendChild(grid);
      ctx.host.appendChild(wrap);
      return;
    }

    for (var i = ctx.from; i < ctx.to; i++) {
      var hRow = el('div', 'sbs-row');
      hRow.dataset.index = String(i);
      if (ctx.options.numbers) hRow.appendChild(numberChip(address(ctx, i)));
      hRow.appendChild(el('span', 'seg-he-text', hebrewFor(ctx, i)));
      heCol.appendChild(hRow);

      var eRow = el('div', 'sbs-row');
      eRow.dataset.index = String(i);
      if (ctx.options.numbers) eRow.appendChild(numberChip(address(ctx, i)));
      englishBody(eRow, ctx.unit.e[i] || '', i, ctx);
      enCol.appendChild(eRow);

      (function (idx, a, b) {
        function on() {
          a.classList.add('hl');
          b.classList.add('hl');
        }
        function off() {
          a.classList.remove('hl');
          b.classList.remove('hl');
        }
        a.addEventListener('mouseenter', on);
        a.addEventListener('mouseleave', off);
        b.addEventListener('mouseenter', on);
        b.addEventListener('mouseleave', off);
        a.addEventListener('click', function () {
          NS.focusSegment(ctx, idx);
        });
        b.addEventListener('click', function () {
          NS.focusSegment(ctx, idx);
        });
      })(i, hRow, eRow);
    }
    grid.appendChild(ctx.options.order === 'english-first' ? enCol : heCol);
    grid.appendChild(ctx.options.order === 'english-first' ? heCol : enCol);
    wrap.appendChild(grid);
    ctx.host.appendChild(wrap);
  };

  /** Section-level columns used when a 1:1 Hebrew alignment is unavailable. */
  Views.sectionColumns = function (ctx, heCol, enCol) {
    var he = el('div', 'sbs-row section-level');
    he.dir = 'rtl';
    var heText = ctx.hebrew && ctx.hebrew.length ? ctx.hebrew.join(' ') : (ctx.unit.h || []).join(' ');
    he.appendChild(el('span', 'seg-he-text', heText));
    heCol.appendChild(he);
    var en = el('div', 'sbs-row section-level');
    en.dir = 'ltr';
    for (var i = ctx.from; i < ctx.to; i++) {
      var s = el('div', 'flow-seg');
      englishBody(s, ctx.unit.e[i] || '', i, ctx);
      en.appendChild(s);
    }
    enCol.appendChild(en);
  };

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

  /** 5. Peek: the selected passage plus/minus N segments of context. */
  Views.peek = function (ctx) {
    var list = el('div', 'peek');
    for (var i = ctx.from; i < ctx.to; i++) {
      var block = el('div', 'peek-block');
      block.dataset.index = String(i);
      if (i === ctx.focus) block.classList.add('focus');
      var head = el('div', 'peek-head');
      head.appendChild(numberChip(address(ctx, i)));
      block.appendChild(head);
      if (ctx.unit.al === 1) {
        var heLine = el('div', 'peek-he');
        heLine.dir = 'rtl';
        heLine.appendChild(el('span', 'seg-he-text', hebrewFor(ctx, i)));
        block.appendChild(heLine);
      }
      var enLine = el('div', 'peek-en');
      enLine.dir = 'ltr';
      englishBody(enLine, ctx.unit.e[i] || '', i, ctx);
      block.appendChild(enLine);
      list.appendChild(block);
    }
    ctx.host.appendChild(list);
  };

  /** 6. Tap to reveal: Hebrew with the English hidden until tapped. */
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

  Views.LIST = ['english', 'sidebyside', 'interleaved', 'flowing', 'peek', 'reveal'];

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
      case 'peek':
        return NS.t('הצצה');
      case 'reveal':
        return NS.t('לחיצה לחשיפה');
      default:
        return view;
    }
  };
})();
