/* otsaplugin — the six view modes.
 *
 * Every renderer receives the same `ctx` and writes into `ctx.host`. None of
 * them touches innerHTML with pack data: text goes through createTextNode and
 * inline markup through OtzEn.renderSafe (see js/sanitize.js).
 *
 * Hebrew comes from Otzaria when it can be aligned; otherwise the view falls
 * back to Sefaria's normalised Hebrew and says so in the UI. A unit whose
 * Hebrew could not be aligned 1:1 is rendered at section level, never
 * misaligned.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});
  var Views = (NS.Views = {});

  // ---- address labels -----------------------------------------------------

  Views.addressLabel = function (book, unit, index) {
    var a = (unit.a && unit.a[0]) || 1;
    var n = index + 1;
    switch (book.schema) {
      case 'daf':
        return NS.dafLabel(a) + ':' + n;
      case 'verse':
      case 'mishnah':
      case 'halakha':
      case 'siman':
        return a + ':' + n;
      default:
        return String(n);
    }
  };

  Views.unitLabel = function (book, unit) {
    var a = (unit.a && unit.a[0]) || 1;
    switch (book.schema) {
      case 'daf':
        return NS.t('דף') + ' ' + NS.dafLabel(a);
      case 'mishnah':
        return NS.t('פרק') + ' ' + a;
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

  /** Hebrew text for a segment: Otzaria's own when aligned, else Sefaria's. */
  function hebrewFor(ctx, index) {
    if (ctx.hebrew && ctx.hebrew[index] !== undefined && ctx.hebrew[index] !== null) {
      return { text: ctx.hebrew[index], source: 'otzaria' };
    }
    if (ctx.unit.h) return { text: ctx.unit.h[index] || '', source: 'sefaria' };
    return { text: '', source: 'none' };
  }

  function creditLine(ctx) {
    var line = el('div', 'credit-line');
    var ids = {};
    var prov = ctx.provenance;
    for (var i = ctx.from; i < ctx.to; i++) {
      if (prov[i] >= 0) ids[prov[i]] = 1;
    }
    var keys = Object.keys(ids);
    if (!keys.length) {
      line.appendChild(document.createTextNode(NS.t('אין תרגום זמין לקטע זה')));
      return line;
    }
    line.appendChild(document.createTextNode(NS.t('מקור') + ': '));
    for (var k = 0; k < keys.length; k++) {
      var src = ctx.manifest.sources[Number(keys[k])];
      if (!src) continue;
      if (k) line.appendChild(document.createTextNode(' · '));
      var chip = el('span', 'credit-chip');
      chip.appendChild(document.createTextNode(src.title));
      chip.appendChild(el('span', 'credit-lic', src.license));
      chip.title = src.url || src.title;
      line.appendChild(chip);
    }
    var more = el('button', 'linkish credit-more', NS.t('פרטים ורשיונות'));
    more.type = 'button';
    more.addEventListener('click', function () {
      NS.openCredits(ctx.bookKey, ctx.unit.a[0]);
    });
    line.appendChild(more);
    return line;
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
      if (ctx.options.numbers) li.appendChild(numberChip(Views.addressLabel(ctx.book, ctx.unit, i)));
      englishBody(li, seg, i, ctx);
      list.appendChild(li);
    }
    ctx.host.appendChild(list);
    if (ctx.options.creditLine) ctx.host.appendChild(creditLine(ctx));
  };

  /** 2. Side by side, aligned per segment, with synchronised highlight. */
  Views.sidebyside = function (ctx) {
    var wrap = el('div', 'sbs');
    var grid = el('div', 'sbs-grid');
    grid.classList.add(ctx.options.order === 'english-first' ? 'order-en' : 'order-he');
    var heCol = el('div', 'sbs-col sbs-he');
    var enCol = el('div', 'sbs-col sbs-en');
    heCol.dir = 'rtl';
    enCol.dir = 'ltr';
    heCol.appendChild(el('div', 'sbs-head', NS.t('עברית') + (ctx.hebrewSource === 'sefaria' ? ' · ' + NS.t('ספריא') : '')));
    enCol.appendChild(el('div', 'sbs-head', NS.t('אנגלית')));

    var aligned = ctx.unit.al === 1;
    if (!aligned) {
      var notice = el('div', 'notice', NS.t('היישור בין השורות אינו ודאי — מוצג ברמת הקטע כולו'));
      notice.classList.add('warn');
      ctx.host.appendChild(notice);
      Views.sectionColumns(ctx, heCol, enCol);
      grid.appendChild(ctx.options.order === 'english-first' ? enCol : heCol);
      grid.appendChild(ctx.options.order === 'english-first' ? heCol : enCol);
      wrap.appendChild(grid);
      ctx.host.appendChild(wrap);
      if (ctx.options.creditLine) ctx.host.appendChild(creditLine(ctx));
      return;
    }

    for (var i = ctx.from; i < ctx.to; i++) {
      var he = hebrewFor(ctx, i);
      var hRow = el('div', 'sbs-row');
      hRow.dataset.index = String(i);
      if (ctx.options.numbers) hRow.appendChild(numberChip(Views.addressLabel(ctx.book, ctx.unit, i)));
      hRow.appendChild(el('span', 'seg-he-text', he.text));
      heCol.appendChild(hRow);

      var eRow = el('div', 'sbs-row');
      eRow.dataset.index = String(i);
      if (ctx.options.numbers) eRow.appendChild(numberChip(Views.addressLabel(ctx.book, ctx.unit, i)));
      englishBody(eRow, ctx.unit.e[i] || '', i, ctx);
      enCol.appendChild(eRow);

      // Synchronised highlight: hover on either side lights the other.
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
    if (ctx.options.creditLine) ctx.host.appendChild(creditLine(ctx));
  };

  /** Section-level columns, used when 1:1 alignment could not be confirmed. */
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
      if (ctx.options.numbers) head.appendChild(numberChip(Views.addressLabel(ctx.book, ctx.unit, i)));
      block.appendChild(head);
      if (aligned) {
        var he = hebrewFor(ctx, i);
        var heLine = el('div', 'ilv-he');
        heLine.dir = 'rtl';
        heLine.appendChild(el('span', 'seg-he-text', he.text));
        block.appendChild(heLine);
      }
      var enLine = el('div', 'ilv-en');
      enLine.dir = 'ltr';
      englishBody(enLine, ctx.unit.e[i] || '', i, ctx);
      block.appendChild(enLine);
      list.appendChild(block);
    }
    if (!aligned) {
      list.insertBefore(
        el('div', 'notice warn', NS.t('היישור בין השורות אינו ודאי — העברית מוצגת ברמת הקטע')),
        list.firstChild
      );
      var section = el('div', 'ilv-he section-level');
      section.dir = 'rtl';
      section.appendChild(
        el('span', 'seg-he-text', (ctx.unit.h || []).join(' '))
      );
      list.insertBefore(section, list.children[1] || null);
    }
    ctx.host.appendChild(list);
    if (ctx.options.creditLine) ctx.host.appendChild(creditLine(ctx));
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
      if (ctx.options.numbers) {
        span.appendChild(numberChip(Views.addressLabel(ctx.book, ctx.unit, i)));
      }
      englishBody(span, seg, i, ctx);
      span.appendChild(document.createTextNode(' '));
      flow.appendChild(span);
    }
    ctx.host.appendChild(flow);
    if (ctx.options.creditLine) ctx.host.appendChild(creditLine(ctx));
  };

  /** 5. Peek: the selected passage plus/minus N segments of context. */
  Views.peek = function (ctx) {
    var list = el('div', 'peek');
    for (var i = ctx.from; i < ctx.to; i++) {
      var block = el('div', 'peek-block');
      block.dataset.index = String(i);
      if (i === ctx.focus) block.classList.add('focus');
      var head = el('div', 'peek-head');
      head.appendChild(numberChip(Views.addressLabel(ctx.book, ctx.unit, i)));
      block.appendChild(head);
      if (ctx.unit.al === 1) {
        var he = hebrewFor(ctx, i);
        var heLine = el('div', 'peek-he');
        heLine.dir = 'rtl';
        heLine.appendChild(el('span', 'seg-he-text', he.text));
        block.appendChild(heLine);
      }
      var enLine = el('div', 'peek-en');
      enLine.dir = 'ltr';
      englishBody(enLine, ctx.unit.e[i] || '', i, ctx);
      block.appendChild(enLine);
      list.appendChild(block);
    }
    ctx.host.appendChild(list);
    if (ctx.options.creditLine) ctx.host.appendChild(creditLine(ctx));
  };

  /** 6. Tap to reveal: Hebrew with the English hidden until tapped. */
  Views.reveal = function (ctx) {
    var list = el('div', 'reveal');
    var aligned = ctx.unit.al === 1;
    for (var i = ctx.from; i < ctx.to; i++) {
      var row = el('div', 'reveal-row');
      row.dataset.index = String(i);
      var he = el('div', 'reveal-he');
      he.dir = 'rtl';
      if (ctx.options.numbers) he.appendChild(numberChip(Views.addressLabel(ctx.book, ctx.unit, i)));
      he.appendChild(
        el('span', 'seg-he-text', aligned ? hebrewFor(ctx, i).text : (ctx.unit.h || [])[i] || '')
      );
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
    if (!aligned) {
      list.insertBefore(
        el('div', 'notice warn', NS.t('היישור בין השורות אינו ודאי — העברית מספריא, מנורמלת')),
        list.firstChild
      );
    }
    ctx.host.appendChild(list);
    if (ctx.options.creditLine) ctx.host.appendChild(creditLine(ctx));
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
