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

  // Context-menu item ids declared in manifest.json.
  var MENU_TRANSLATE_ID = 'english-translation';
  var MENU_SPLIT_ID = 'english-translation-split';

  var state = {
    manifest: null,
    bookKey: null,
    book: null,
    chunk: null,
    view: null,
    entry: 'reader', // 'selection' | 'reader'
    lastRef: null,
    lastBookId: null,
    lastTitle: null,
    lastUnitAddress: null,
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

    // The two declarative context-menu actions are delivered after boot without
    // needing a background instance. Both translate the selected passage in the
    // panel — the whole section, scrolled to that passage, never a window
    // around it; the second one always shows both languages at once.
    window.Otzaria.on('reader.context_menu_item_clicked', function (payload) {
      payload = payload || {};
      var itemId = payload.itemId;
      if (itemId && itemId !== MENU_TRANSLATE_ID && itemId !== MENU_SPLIT_ID) return;
      var split = payload.param === 'split' || itemId === MENU_SPLIT_ID;
      state.entry = 'selection';
      // The split action pins the view; the plain one opens in whatever this
      // entry point last used.
      state.view = split ? 'sidebyside' : null;
      var req = readerLocation(payload);
      req.selection = payload.selectedText || payload.selection || '';
      req.entry = 'selection';
      App.show(req);
    });

    window.Otzaria.on('plugin.page_opened', function (payload) {
      payload = payload || {};
      var param = payload.param || {};
      if (param.entry === 'selection' || param.entry === 'reader') state.entry = param.entry;
      if (param.view && NS.Views[param.view]) state.view = param.view;
    });

    // Entry point B: follow the reader. The location normalizer accepts both
    // current and older SDK payload spellings, so missing optional fields do not
    // break updates.
    window.Otzaria.on('reader.current_ref_changed', function (payload) {
      if (!NS.settings.follow) return;
      var req = readerLocation(payload || {});
      if (!req.bookTitle && !req.bookId && !req.ref) return;
      state.entry = 'reader';
      state.view = null;
      req.entry = 'reader';
      App.show(req);
    });
  };

  function openDefault(viewOverride) {
    // Read the location on demand instead of relying on the last event; this
    // keeps the Translate and Split view buttons useful even when follow is off.
    state.entry = 'reader';
    state.view = viewOverride && NS.Views[viewOverride] ? viewOverride : null;
    return window.Otzaria
      .call('reader.getCurrentRef')
      .then(function (res) {
        var data = NS.unwrap(res, 'reader.getCurrentRef');
        var req = readerLocation(data || {});
        req.entry = 'reader';
        if (!req.bookTitle && !req.bookId) {
          NS.setStatus(
            NS.t('אין ספר פתוח בקורא. בחר קטע בטקסט ובחר „תרגום לאנגלית” בתפריט, או פתח ספר בקורא.'),
            'info'
          );
          return null;
        }
        return App.show(req);
      })['catch'](function (err) {
        NS.setStatus(
          NS.t('אין ספר פתוח בקורא. בחר קטע בטקסט ובחר „תרגום לאנגלית” בתפריט, או פתח ספר בקורא.'),
          'info'
        );
        NS.log('getCurrentRef failed', err && err.code);
      });
  }

  function readerLocation(data) {
    data = data || {};
    var book = data.bookTitle || data.currentBook || data.book || data.title || '';
    if (book && typeof book === 'object') book = book.title || book.name || book.bookTitle || '';
    var bookId = data.bookId || data.currentBookId || data.bookUid || data.uid || '';
    var ref = data.ref || data.currentRef || data.reference || data.currentReference || '';
    if (ref && typeof ref === 'object') ref = ref.ref || ref.reference || ref.title || '';
    var sectionIndex = data.sectionIndex;
    if (sectionIndex === undefined || sectionIndex === null) sectionIndex = data.index;
    return {
      bookTitle: String(book || bookId || ''),
      bookId: bookId ? String(bookId) : '',
      ref: ref ? String(ref) : '',
      sectionIndex: sectionIndex,
      selection: data.selectedText || data.selection || '',
    };
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
        if (unit.g && unit.g.length) {
          var groups = NS.expandRuns(unit.g, unit.e.length, -1);
          for (var gi = 0; gi < groups.length; gi++) {
            if (groups[gi] === parsed.sub) {
              focus = gi;
              break;
            }
          }
        } else {
          var idx = parsed.sub - 1;
          if (idx >= 0 && idx < unit.e.length) focus = idx;
        }
      }
      if (focus === null && req.selection) {
        var located = Ref.locateSegment(unit, req.selection);
        if (located && located.index >= 0) focus = located.index;
        else if (state.entry === 'selection') {
          // If the selection cannot be mapped safely, the whole unit is shown
          // and nothing is highlighted rather than the wrong passage marked.
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
   * pack's segments (see js/align.js). If it cannot be aligned exactly, use the
   * packed Hebrew when available and keep the fallback quiet in the reader UI.
   */
  function hebrewForUnit(book, unit, req, parsed) {
    if (!window.Otzaria) {
      return Promise.resolve({ text: unit.h || null, source: 'pack', aligned: !!unit.h });
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
        if (slices) return { text: slices, source: 'reader', aligned: true };
        NS.log('reader Hebrew could not be aligned; using packed Hebrew:', alignment.reason);
        return { text: unit.h || null, source: 'pack', aligned: !!unit.h };
      })['catch'](function (err) {
        NS.log('getSectionTextMap unavailable; using packed Hebrew', err && err.code);
        return { text: unit.h || null, source: 'pack', aligned: !!unit.h };
      });
  }

  function draw(book, unit, parsed, focus, hebrew, req) {
    var view = App.currentView();
    // Every view renders the whole unit — the chapter or daf the reader is on —
    // and the passage the reader came from is scrolled to and outlined. A view
    // showing only a few passages around the selection lost the reader the
    // thread of the chapter, so there is no windowed view any more.
    var n = unit.e.length;
    var from = 0;
    var to = n;

    var segmentGroups = unit.g ? NS.expandRuns(unit.g, n, -1) : null;
    var ctxObj = {
      host: NS.renderHost(),
      book: book,
      chunk: state.chunk,
      unit: unit,
      from: from,
      to: to,
      focus: focus,
      segmentGroups: segmentGroups,
      hebrew: hebrew.text,
      options: {
        numbers: NS.settings.numbers,
        order: NS.settings.order,
        density: NS.settings.density,
      },
      notesFor: function (i) {
        return (unit.n && unit.n[i]) || [];
      },
    };

    NS.renderHost().textContent = '';
    state.lastUnitAddress = unit.a[0];
    NS.setHeader(NS.Views.unitLabel(book, unit), book.he + ' · ' + (req.ref || ''));

    if (book.missing > 0) {
      var missingInUnit = 0;
      for (var i = 0; i < n; i++) if (!unit.e[i]) missingInUnit++;
      if (missingInUnit > 0) {
        NS.flashNotice(
          NS.t('חלק מהשורות ללא תרגום') + ' (' + missingInUnit + '/' + n + ')',
          'info'
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
    if (state.view && NS.Views[state.view]) return state.view;
    var perEntry = (NS.settings.viewForContext || {})[state.entry];
    if (perEntry && NS.Views[perEntry]) return perEntry;
    return 'sidebyside';
  };

  App.setView = function (view) {
    if (!NS.Views[view]) return;
    state.view = view;
    NS.settings.viewForContext = NS.settings.viewForContext || {};
    NS.settings.viewForContext[state.entry] = view;
    NS.saveSettings();
    applySettingsToChrome();
    if (state.chunk && state.book) {
      App.show({
        // Keep the reader's actual id so opening the source text works even
        // when Otzaria uses an id different from the displayed title.
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
    on('btn-translate', 'click', function () {
      openDefault();
    });
    on('btn-split', 'click', function () {
      openDefault('sidebyside');
    });
    on('btn-options', 'click', function () {
      NS.showPanel(NS.panelOpen === 'options' ? null : 'options');
    });
    on('btn-reader', 'click', function () {
      if (!state.book) return;
      window.Otzaria
        .call('reader.openBookAtRef', {
          bookId: state.lastBookId || state.book.he,
          ref: state.lastRef || '',
        })
        .then(function (res) {
          return NS.unwrap(res, 'reader.openBookAtRef');
        })['catch'](function (err) {
          NS.log('openBookAtRef failed', err && err.code);
          NS.setStatus('Could not open this text in the reader' + (err && err.message ? ': ' + err.message : ''), 'error');
        });
    });
    on('panel-close', 'click', function () {
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
    on('opt-order', 'change', function (ev) {
      NS.settings.order = ev.target.value;
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
    var split = document.getElementById('btn-split');
    if (split) {
      split.classList.toggle('active', view === 'sidebyside');
      split.setAttribute('aria-pressed', view === 'sidebyside' ? 'true' : 'false');
    }
    setChecked('opt-numbers', NS.settings.numbers);
    setValue('opt-order', NS.settings.order);
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
      manifest.stats.books + ' ' + NS.t('ספרים');
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
        (title ? title + ' — ' : '') + NS.t('נסה לטעון ספריית תרגום מורחבת בהגדרות.')
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
        sub.appendChild(document.createTextNode((book.cat || book.catHe || []).join(' › ')));
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
          NS.t('אין תרגום לקטע זה')
      )
    );
    box.appendChild(p);
    if (book.missing) {
      var note = document.createElement('p');
      note.className = 'note';
      note.appendChild(
        document.createTextNode(
          book.missing + ' ' + NS.t('קטעים ללא תרגום')
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
      var cat = (b.cat && b.cat[0]) || (b.catHe && b.catHe[0]) || '';
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
