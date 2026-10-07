/* otsaplugin — application controller.
 *
 * Wires the two entry points, resolves an Otzaria location to a pack unit, and
 * drives the view renderers. Nothing here loads anything from the network.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});
  var Ref = NS.Ref;
  var App = (NS.App = {});

  // The context-menu item id declared in manifest.json.
  var MENU_ID = 'english-translation'; // must match manifest.json contributes.startup

  var state = {
    manifest: null,
    bookKey: null,
    book: null,
    chunk: null,
    view: null,
    entry: 'reader', // 'peek' | 'reader'
    otzariaText: null,
    otzariaAlignment: null,
    lastRef: null,
    lastBookId: null,
    treePromise: null,
    renderToken: 0,
  };

  // ---- boot ---------------------------------------------------------------

  App.start = function () {
    NS.init();
    NS.applyDirection();
    bindChrome();

    if (!window.Otzaria) {
      NS.setStatus(NS.t('אין חיבור לאוצריא — התצוגה מוצגת ללא נתונים חיים.'), 'warn');
      return;
    }

    window.Otzaria.on('plugin.boot', function (payload) {
      var app = (payload && payload.app) || {};
      NS.setLanguage(app.language, app.textDirection);
      NS.applyDirection();
      NS.applyTheme(payload && payload.theme);
      NS.loadSettings()
        .then(function () {
          applySettingsToChrome();
          return NS.Data.init();
        })
        .then(function (manifest) {
          state.manifest = manifest;
          NS.setPackInfo(manifest);
          return openDefault();
        })['catch'](function (err) {
          NS.setStatus(NS.t('טעינת הנתונים נכשלה') + ': ' + (err && err.message), 'error');
        });
    });

    // Entry point A: the declarative context-menu item. The manifest declares it
    // with openPlugin:true, so the click is queued and delivered after boot even
    // though this plugin runs no background instance.
    window.Otzaria.on('reader.context_menu_item_clicked', function (payload) {
      payload = payload || {};
      state.entry = 'peek';
      App.show({
        bookTitle: payload.currentBook,
        bookId: payload.currentBookId,
        ref: payload.currentRef,
        selection: payload.selectedText,
        entry: 'peek',
      });
    });

    window.Otzaria.on('plugin.page_opened', function (payload) {
      payload = payload || {};
      if (payload.param && payload.param.entry) state.entry = payload.param.entry;
    });

    // Entry point B: follow the reader, if the user turned it on.
    window.Otzaria.on('reader.current_ref_changed', function (payload) {
      if (!NS.settings.follow) return;
      payload = payload || {};
      state.entry = 'reader';
      App.show({
        bookTitle: payload.bookTitle || payload.currentBook,
        bookId: payload.bookId,
        ref: payload.ref || payload.currentRef,
        entry: 'reader',
      });
    });
  };

  function openDefault() {
    // Whatever the reader has open right now.
    return window.Otzaria
      .call('reader.getCurrentRef')
      .then(function (res) {
        var data = NS.unwrap(res, 'reader.getCurrentRef');
        state.entry = NS.settings.viewForContext && NS.settings.viewForContext.reader ? 'reader' : 'reader';
        return App.show({
          bookTitle: data && data.bookTitle,
          bookId: data && (data.bookId || data.bookUid),
          ref: data && data.ref,
          sectionIndex: data && data.index,
          entry: 'reader',
        });
      })['catch'](function (err) {
        NS.setStatus(
          NS.t('אין ספר פתוח בקורא. בחר קטע בטקסט ובחר „תרגום לאנגלית” בתפריט, או פתח ספר בקורא.'),
          'info'
        );
        NS.log('getCurrentRef failed', err && err.code);
      });
  }

  // ---- book resolution ----------------------------------------------------

  /**
   * Otzaria titles are not unique: Bavli Berakhot and Mishnah Berakhot are both
   * "ברכות". The pack therefore stores an ambiguity list, and resolution without
   * a category hint returns `{ambiguous:[...]}` instead of picking one.
   */
  App.resolveWork = function (title, hint) {
    var manifest = state.manifest;
    if (!manifest || !title) return { error: 'no-title' };
    var entry = Ref.resolveBook(manifest, title);
    if (!entry) return { error: 'not-in-pack', title: title };
    if (typeof entry === 'string') return { work: entry };
    // Ambiguous: need a category hint from the library tree.
    var pick = null;
    if (hint && hint.path) {
      for (var i = 0; i < entry.length; i++) {
        var catHe = (manifest.books[entry[i]].catHe || []).join('/');
        if (catHe && hint.path.indexOf(catHe) >= 0) {
          pick = entry[i];
          break;
        }
      }
    }
    if (pick) return { work: pick };
    return { ambiguous: entry, title: title };
  };

  App.treeHintFor = function (bookTitle) {
    if (!bookTitle) return Promise.resolve(null);
    if (!state.treePromise) {
      state.treePromise = window.Otzaria
        .call('library.getTree')
        .then(function (res) {
          return NS.unwrap(res, 'library.getTree');
        })['catch'](function (err) {
          NS.log('library.getTree failed', err && err.code);
          return null;
        });
    }
    return state.treePromise.then(function (tree) {
      if (!tree) return null;
      var want = NS.normalizeTitle(bookTitle);
      var found = null;
      (function walk(node) {
        if (!node || found) return;
        var books = node.books || [];
        for (var i = 0; i < books.length; i++) {
          if (NS.normalizeTitle(books[i].title) === want) {
            found = { path: node.path || '', title: books[i].title, bookId: books[i].bookId };
            return;
          }
        }
        var cats = node.categories || [];
        for (var j = 0; j < cats.length; j++) walk(cats[j]);
      })(tree);
      return found;
    });
  };

  // ---- rendering ----------------------------------------------------------

  App.show = function (req) {
    var token = ++state.renderToken;
    req = req || {};
    if (!state.manifest) {
      NS.setStatus(NS.t('הנתונים עדיין נטענים…'), 'info');
      return Promise.resolve();
    }
    if (!req.bookTitle && req.bookId) {
      // Otzaria uses the Hebrew title as the bookId for library text books.
      req.bookTitle = String(req.bookId);
    }

    return App.treeHintFor(req.bookTitle)
      .then(function (hint) {
        var resolved = App.resolveWork(req.bookTitle, hint);
        if (resolved.error === 'no-title') {
          NS.setStatus(NS.t('לא התקבל שם ספר מהקורא.'), 'warn');
          return null;
        }
        if (resolved.error === 'not-in-pack') {
          NS.showNoEnglish(req.bookTitle);
          return null;
        }
        if (resolved.ambiguous) {
          NS.showAmbiguous(resolved.ambiguous, req);
          return null;
        }
        return renderWork(resolved.work, req, hint, token);
      })['catch'](function (err) {
        NS.log('render failed', err);
        NS.setStatus(NS.t('שגיאה בטעינה') + ': ' + (err && err.message), 'error');
      });
  };

  function renderWork(workKey, req, hint, token) {
    var manifest = state.manifest;
    var book = manifest.books[workKey];
    state.bookKey = workKey;
    state.book = book;
    // Remembered so a view switch re-renders the same place and so "open in
    // reader" knows where to send the user.
    state.lastRef = req.ref || null;
    state.lastBookId = req.bookId || book.he;
    state.lastTitle = req.bookTitle || book.he;

    return NS.Data.book(book.chunk).then(function (chunk) {
      if (token !== state.renderToken) return null; // a newer request superseded us
      state.chunk = chunk;

      var parsed = Ref.parse(req.ref, book.schema);
      if (parsed.chapter === null) {
        NS.showRefNotParsed(req, book);
        return null;
      }
      var unit = Ref.unitFor(chunk, parsed);
      if (!unit) {
        NS.showUnitMissing(book, parsed, req);
        return null;
      }

      var focus = null;
      if (parsed.level === 'sub' && parsed.sub !== null) {
        var idx = parsed.sub - 1;
        if (idx >= 0 && idx < unit.e.length) focus = idx;
      }
      if (focus === null && req.selection) {
        var located = Ref.locateSegment(unit, req.selection);
        if (located && located.index >= 0) focus = located.index;
        else if (NS.settings.entry === 'peek') {
          // The selection could not be tied to a segment. Show the whole unit
          // rather than a guess.
          NS.flashNotice(NS.t('הקטע שנבחר לא זוהה בוודאות — מוצג הקטע כולו'));
        }
      }

      return hebrewForUnit(book, unit, req, parsed).then(function (hebrew) {
        if (token !== state.renderToken) return null;
        draw(book, unit, parsed, focus, hebrew, req);
        return unit;
      });
    });
  }

  /**
   * Hebrew to show next to the English.
   *
   * Preferred: Otzaria's own section text, aligned letter-for-letter to the
   * pack's segments (see js/align.js). If the alignment is not exact we do NOT
   * re-split it; we hand back the pack's Sefaria Hebrew and label it.
   */
  function hebrewForUnit(book, unit, req, parsed) {
    if (NS.settings.hebrewSource !== 'otzaria' || !window.Otzaria) {
      return Promise.resolve({ text: unit.h || null, source: 'sefaria', aligned: !!unit.h });
    }
    var sectionIndex =
      req.sectionIndex !== undefined && req.sectionIndex !== null
        ? Number(req.sectionIndex)
        : parsed.chapter - 1;
    return window.Otzaria
      .call('reader.getSectionTextMap', {
        bookId: req.bookId || book.he,
        sectionIndex: sectionIndex,
        layer: 'source',
        includeWords: false,
        includeChars: false,
        includeSourceMap: false,
        limit: 2000,
      })
      .then(function (res) {
        var data = NS.unwrap(res, 'reader.getSectionTextMap');
        var text = data && (data.sourceText || data.renderedText);
        if (!text) throw new Error('no source text');
        var alignment = NS.alignHebrew(text, unit.h || []);
        var slices = NS.sliceAligned(text, alignment);
        if (slices) return { text: slices, source: 'otzaria', aligned: true, headerPrefix: alignment.headerPrefix };
        NS.log('hebrew alignment failed:', alignment.reason);
        return { text: unit.h || null, source: 'sefaria', aligned: !!unit.h, reason: alignment.reason };
      })['catch'](function (err) {
        NS.log('getSectionTextMap unavailable, using pack Hebrew', err && err.code);
        return { text: unit.h || null, source: 'sefaria', aligned: !!unit.h, reason: err && err.message };
      });
  }

  function draw(book, unit, parsed, focus, hebrew, req) {
    var view = App.currentView();
    var n = unit.e.length;
    var from = 0;
    var to = n;
    if (view === 'peek') {
      var ctx = NS.settings.revealContext || 2;
      var centre = focus === null ? 0 : focus;
      from = Math.max(0, centre - ctx);
      to = Math.min(n, centre + ctx + 1);
      if (focus === null && req.selection) {
        // No segment identified: showing ±2 around an unknown centre would be a
        // guess. Fall back to the whole unit.
        from = 0;
        to = n;
      }
    } else if (focus !== null && NS.settings.scrollToFocus !== false) {
      // Whole unit, but scrolled to the verse the reader is on.
    }

    var provenance = NS.expandProvenance(unit.p, n);
    var ctxObj = {
      host: NS.renderHost(),
      manifest: state.manifest,
      book: book,
      bookKey: state.bookKey,
      chunk: state.chunk,
      unit: unit,
      from: from,
      to: to,
      focus: focus,
      provenance: provenance,
      hebrew: hebrew.text,
      hebrewSource: hebrew.source,
      options: {
        numbers: NS.settings.numbers,
        order: NS.settings.order,
        creditLine: NS.settings.creditLine,
        density: NS.settings.density,
      },
      notesFor: function (i) {
        return (unit.n && unit.n[i]) || [];
      },
    };

    NS.renderHost().textContent = '';
    NS.setHeader(NS.Views.unitLabel(book, unit), book.he + ' · ' + (req.ref || ''));

    if (hebrew.source === 'sefaria' && unit.h && unit.h.length && view !== 'english' && view !== 'flowing') {
      NS.flashNotice(
        NS.t('העברית המוצגת היא של ספריא (מנורמלת), לא הטקסט של אוצריא') +
          (hebrew.reason ? ' — ' + hebrew.reason : '')
      );
    }
    if (book.missing > 0) {
      var missingInUnit = 0;
      for (var i = 0; i < n; i++) if (!unit.e[i]) missingInUnit++;
      if (missingInUnit > 0) {
        NS.flashNotice(
          NS.t('לקטע זה אין תרגום ברשיון מתאים עבור חלק מהשורות') + ' (' + missingInUnit + '/' + n + ')',
          'warn'
        );
      }
    }

    var renderer = NS.Views[view];
    if (typeof renderer !== 'function') {
      NS.setStatus(NS.t('תצוגה לא מוכרת') + ': ' + view, 'error');
      return;
    }
    renderer(ctxObj);
    NS.setStatus('', '');

    if (focus !== null) NS.scrollToSegment(focus);

    // Remember the view per entry point.
    NS.settings.viewForContext = NS.settings.viewForContext || {};
    NS.settings.viewForContext[state.entry] = view;
    NS.saveSettings();
  }

  // ---- view switching -----------------------------------------------------

  App.currentView = function () {
    if (state.view) return state.view;
    var perEntry = (NS.settings.viewForContext || {})[state.entry];
    if (perEntry) return perEntry;
    return state.entry === 'peek' ? 'peek' : 'sidebyside';
  };

  App.setView = function (view) {
    state.view = view;
    applySettingsToChrome();
    if (state.chunk && state.book) {
      App.show({
        // The title the user actually resolved, so an ambiguous title does not
        // prompt again on every view switch.
        bookTitle: state.lastTitle || state.book.he,
        bookId: state.lastBookId || state.book.he,
        ref: state.lastRef,
        entry: state.entry,
      });
    }
  };

  App.toggleFollow = function () {
    NS.settings.follow = !NS.settings.follow;
    NS.saveSettings();
    applySettingsToChrome();
    if (NS.settings.follow) openDefault();
  };

  // ---- chrome (top bar, tabs, panels) ------------------------------------

  function bindChrome() {
    var tabs = document.getElementById('view-tabs');
    if (tabs) {
      for (var i = 0; i < NS.Views.LIST.length; i++) {
        (function (view) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'view-tab';
          b.dataset.view = view;
          b.appendChild(document.createTextNode(NS.Views.label(view)));
          b.addEventListener('click', function () {
            App.setView(view);
          });
          tabs.appendChild(b);
        })(NS.Views.LIST[i]);
      }
    }
    on('btn-follow', 'click', App.toggleFollow);
    on('btn-options', 'click', function () {
      NS.showPanel(NS.panelOpen === 'options' ? null : 'options');
    });
    on('btn-credits', 'click', function () {
      NS.openCredits(state.bookKey, state.lastUnitAddress);
    });
    on('btn-reader', 'click', function () {
      if (!state.book) return;
      window.Otzaria
        .call('reader.openBookAtRef', { bookId: state.book.he, ref: state.lastRef || '' })['catch'](
        function (err) {
          NS.log('openBookAtRef failed', err && err.code);
        }
      );
    });
    on('panel-close', 'click', function () {
      NS.showPanel(null);
    });
    on('panel-close-2', 'click', function () {
      NS.showPanel(null);
    });
    var scrimEl = document.getElementById('scrim');
    if (scrimEl) {
      scrimEl.addEventListener('click', function () {
        NS.showPanel(null);
      });
    }
    on('opt-numbers', 'change', function (ev) {
      NS.settings.numbers = ev.target.checked;
      NS.saveSettings();
      App.setView(App.currentView());
    });
    on('opt-credit', 'change', function (ev) {
      NS.settings.creditLine = ev.target.checked;
      NS.saveSettings();
      App.setView(App.currentView());
    });
    on('opt-order', 'change', function (ev) {
      NS.settings.order = ev.target.value;
      NS.saveSettings();
      App.setView(App.currentView());
    });
    on('opt-hebrew', 'change', function (ev) {
      NS.settings.hebrewSource = ev.target.value;
      NS.saveSettings();
      App.setView(App.currentView());
    });
    on('opt-context', 'change', function (ev) {
      NS.settings.revealContext = Math.max(0, Math.min(10, parseInt(ev.target.value, 10) || 2));
      NS.saveSettings();
      App.setView(App.currentView());
    });
    on('opt-import', 'click', function () {
      NS.Data.pickAndUsePack()
        .then(function (m) {
          if (!m) return;
          state.manifest = m;
          NS.setPackInfo(m);
          openDefault();
        })['catch'](function (err) {
          NS.setStatus(NS.t('טעינת קובץ הנתונים נכשלה') + ': ' + (err && err.message), 'error');
        });
    });
    on('opt-bundled', 'click', function () {
      NS.Data.useBundled()
        .then(function (m) {
          state.manifest = m;
          NS.setPackInfo(m);
          openDefault();
        })['catch'](function (err) {
          NS.setStatus(NS.t('טעינת הנתונים נכשלה') + ': ' + (err && err.message), 'error');
        });
    });
  }

  function on(id, event, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  }

  function applySettingsToChrome() {
    var view = App.currentView();
    var tabs = document.getElementById('view-tabs');
    if (tabs) {
      var buttons = tabs.querySelectorAll('.view-tab');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.toggle('active', buttons[i].dataset.view === view);
        buttons[i].setAttribute('aria-pressed', buttons[i].dataset.view === view ? 'true' : 'false');
      }
    }
    var follow = document.getElementById('btn-follow');
    if (follow) {
      follow.classList.toggle('active', !!NS.settings.follow);
      follow.setAttribute('aria-pressed', NS.settings.follow ? 'true' : 'false');
      follow.textContent = NS.settings.follow ? NS.t('עוקב אחרי הקורא: פעיל') : NS.t('עקוב אחרי הקורא');
    }
    setChecked('opt-numbers', NS.settings.numbers);
    setChecked('opt-credit', NS.settings.creditLine);
    setValue('opt-order', NS.settings.order);
    setValue('opt-hebrew', NS.settings.hebrewSource);
    setValue('opt-context', String(NS.settings.revealContext));
    var root = document.documentElement;
    root.classList.toggle('density-compact', NS.settings.density === 'compact');
    root.classList.toggle('order-en', NS.settings.order === 'english-first');
  }

  function setChecked(id, v) {
    var el = document.getElementById(id);
    if (el) el.checked = !!v;
  }
  function setValue(id, v) {
    var el = document.getElementById(id);
    if (el && el.value !== v) el.value = v;
  }

  // ---- helpers used by other modules -------------------------------------

  NS.renderHost = function () {
    return document.getElementById('render-host');
  };

  NS.setStatus = function (text, kind) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.classList.toggle('hidden', !text);
  };

  NS.setHeader = function (title, subtitle) {
    var t = document.getElementById('bar-title');
    var s = document.getElementById('bar-subtitle');
    if (t) t.textContent = title || '';
    if (s) s.textContent = subtitle || '';
  };

  NS.setPackInfo = function (manifest) {
    var el = document.getElementById('pack-info');
    if (!el || !manifest) return;
    el.textContent =
      (NS.Data.mode() === 'imported' ? NS.t('חבילה מיובאת') : NS.t('חבילה מובנית')) +
      ' · ' +
      manifest.stats.books + ' ' + NS.t('ספרים') +
      ' · ' + manifest.policy;
  };

  var noticeTimer = null;
  NS.flashNotice = function (text, kind) {
    var el = document.getElementById('notice');
    if (!el) return;
    var line = document.createElement('div');
    line.className = 'notice ' + (kind || 'info');
    line.appendChild(document.createTextNode(text));
    el.appendChild(line);
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () {
      el.textContent = '';
    }, 9000);
  };

  NS.panelOpen = null;
  NS.showPanel = function (which) {
    NS.panelOpen = which;
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.toggle('open', panels[i].id === 'panel-' + which);
    }
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.classList.toggle('open', !!which);
  };

  NS.focusSegment = function (ctx, index) {
    state.lastUnitAddress = ctx.unit.a[0];
    NS.scrollToSegment(index);
  };

  NS.scrollToSegment = function (index) {
    var host = NS.renderHost();
    if (!host) return;
    var node = host.querySelector('[data-index="' + index + '"]');
    if (!node) return;
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    var marked = host.querySelectorAll('.focused');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('focused');
    node.classList.add('focused');
  };

  // ---- the "we can't be sure" screens ------------------------------------

  NS.showNoEnglish = function (title) {
    var host = NS.renderHost();
    if (!host) return;
    host.textContent = '';
    var box = document.createElement('div');
    box.className = 'empty';
    var h = document.createElement('h2');
    h.appendChild(document.createTextNode(NS.t('אין תרגום אנגלי לספר זה בחבילה')));
    box.appendChild(h);
    var p = document.createElement('p');
    p.appendChild(
      document.createTextNode(
        (title || '') +
          ' — ' +
          NS.t(
            'החבילה כוללת רק תרגומים ברשיון המאפשר הפצה. ייתכן שלספר זה אין תרגום כזה בספריא.'
          )
      )
    );
    box.appendChild(p);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.appendChild(document.createTextNode(NS.t('מה כן יש בחבילה?')));
    b.addEventListener('click', function () {
      NS.showCoverage();
    });
    box.appendChild(b);
    host.appendChild(box);
    NS.setStatus('', '');
  };

  NS.showAmbiguous = function (candidates, req) {
    var host = NS.renderHost();
    if (!host) return;
    host.textContent = '';
    var box = document.createElement('div');
    box.className = 'empty';
    var h = document.createElement('h2');
    h.appendChild(document.createTextNode(NS.t('השם אינו חד-משמעי')));
    box.appendChild(h);
    var p = document.createElement('p');
    p.appendChild(
      document.createTextNode(
        NS.t('יש כמה ספרים בשם זה. בחר לאיזה מהם להציג תרגום — התוסף לא מנחש.')
      )
    );
    box.appendChild(p);
    var list = document.createElement('div');
    list.className = 'choice-list';
    for (var i = 0; i < candidates.length; i++) {
      (function (key) {
        var book = state.manifest.books[key];
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn choice';
        var label = document.createElement('span');
        label.appendChild(document.createTextNode(book.he));
        b.appendChild(label);
        var sub = document.createElement('span');
        sub.className = 'choice-sub';
        sub.appendChild(document.createTextNode((book.catHe || book.cat || []).join(' › ')));
        b.appendChild(sub);
        b.addEventListener('click', function () {
          state.manifest.titleIndex[NS.normalizeTitle(req.bookTitle)] = key; // sticky for this session
          App.show(req);
        });
        list.appendChild(b);
      })(candidates[i]);
    }
    box.appendChild(list);
    host.appendChild(box);
  };

  NS.showRefNotParsed = function (req, book) {
    var host = NS.renderHost();
    if (!host) return;
    host.textContent = '';
    var box = document.createElement('div');
    box.className = 'empty';
    var h = document.createElement('h2');
    h.appendChild(document.createTextNode(NS.t('לא הצלחתי לזהות את המיקום')));
    box.appendChild(h);
    var p = document.createElement('p');
    p.appendChild(
      document.createTextNode(
        NS.t('ההפניה') +
          ' „' + (req.ref || '') + '” ' +
          NS.t('לא פוענחה. כדי לא להציג פסוק שגוי, התוסף אינו מנחש מיקום.')
      )
    );
    box.appendChild(p);
    var hint = document.createElement('p');
    hint.className = 'note';
    hint.appendChild(document.createTextNode(book.he + ' · ' + (book.sec || []).join(' / ')));
    box.appendChild(hint);
    host.appendChild(box);
  };

  NS.showUnitMissing = function (book, parsed, req) {
    var host = NS.renderHost();
    if (!host) return;
    host.textContent = '';
    var box = document.createElement('div');
    box.className = 'empty';
    var h = document.createElement('h2');
    h.appendChild(document.createTextNode(NS.t('אין תרגום לקטע זה')));
    box.appendChild(h);
    var p = document.createElement('p');
    p.appendChild(
      document.createTextNode(
        book.he +
          ' ' + (req.ref || '') +
          ' — ' +
          NS.t('לקטע זה אין תרגום ברשיון מתאים בחבילה.')
      )
    );
    box.appendChild(p);
    if (book.missing) {
      var note = document.createElement('p');
      note.className = 'note';
      note.appendChild(
        document.createTextNode(
          NS.t('בספר זה חסרים') + ' ' + book.missing + ' ' + NS.t('קטעים ללא תרגום ברשיון מתאים')
        )
      );
      box.appendChild(note);
    }
    host.appendChild(box);
  };

  NS.showCoverage = function () {
    var host = NS.renderHost();
    if (!host || !state.manifest) return;
    host.textContent = '';
    var box = document.createElement('div');
    box.className = 'coverage';
    var h = document.createElement('h2');
    h.appendChild(document.createTextNode(NS.t('תכולת החבילה')));
    box.appendChild(h);
    var byCat = {};
    var keys = Object.keys(state.manifest.books).sort();
    for (var i = 0; i < keys.length; i++) {
      var b = state.manifest.books[keys[i]];
      var cat = (b.catHe && b.catHe[0]) || (b.cat && b.cat[0]) || '';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(b);
    }
    Object.keys(byCat).forEach(function (cat) {
      var h3 = document.createElement('h3');
      h3.appendChild(document.createTextNode(cat + ' (' + byCat[cat].length + ')'));
      box.appendChild(h3);
      var ul = document.createElement('div');
      ul.className = 'coverage-list';
      byCat[cat].forEach(function (b) {
        var chip = document.createElement('span');
        chip.className = 'coverage-chip';
        chip.appendChild(document.createTextNode(b.he));
        chip.title = b.n + ' ' + NS.t('קטעים');
        ul.appendChild(chip);
      });
      box.appendChild(ul);
    });
    host.appendChild(box);
  };
})();
