/* otsaplugin — application controller.
 *
 * Wires the entry points, resolves an Otzaria location to a pack unit, and
 * keeps the open English pages. Nothing here loads anything from the network.
 *
 * Pages: the panel can hold several English pages at once, each with its own
 * text, reference, view and split state. Only the active page is on screen; a
 * page keeps its loaded data, so switching back to it redraws without a fetch.
 * Follow reader updates the active page only, so any other page stays put.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});
  var Ref = NS.Ref;
  var App = (NS.App = {});

  // Context-menu item id declared in manifest.json.
  var MENU_TRANSLATE_ID = 'english-translation';

  // The view-bar buttons, one per view, kept so the active one can be marked.
  var viewButtons = [];

  var state = {
    manifest: null,
    pages: [], // open pages, in tab order
    activeId: null, // id of the page on screen
    nextId: 1,
    treePromise: null,
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.appendChild(document.createTextNode(text));
    return node;
  }

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
          // Pages opened before the data arrived are loaded now; with none, show
          // the reader's location.
          return reloadPages().then(function () {
            if (!state.pages.some(function (page) { return !!page.req; })) return openDefault();
          });
        })['catch'](function (err) {
          NS.setStatus(NS.t('טעינת הנתונים נכשלה') + ': ' + (err && err.message), 'error');
        });
    });

    // The context-menu action opens the selected passage on a new page: the
    // whole section it belongs to, scrolled to and outlined, never a window of
    // nearby passages.
    window.Otzaria.on('reader.context_menu_item_clicked', function (payload) {
      payload = payload || {};
      if (payload.itemId && payload.itemId !== MENU_TRANSLATE_ID) return;
      var req = readerLocation(payload);
      req.selection = payload.selectedText || payload.selection || '';
      req.entry = 'selection';
      openPage('selection', req);
    });

    // Follow the reader: the active page is kept in step with the current
    // reference. The location normalizer accepts both current and older SDK
    // payload spellings, so missing optional fields do not break updates.
    window.Otzaria.on('reader.current_ref_changed', function (payload) {
      if (!NS.settings.follow) return;
      var req = readerLocation(payload || {});
      if (!req.bookTitle && !req.bookId && !req.ref) return;
      req.entry = 'reader';
      showInPage(ensureActivePage('reader'), req);
    });
  };

  /** Read the reader's current location and show it on the active page. */
  function openDefault() {
    // Read the location on demand instead of relying on the last event.
    return window.Otzaria
      .call('reader.getCurrentRef')
      .then(function (res) {
        var data = NS.unwrap(res, 'reader.getCurrentRef');
        var req = readerLocation(data || {});
        req.entry = 'reader';
        if (!req.bookTitle && !req.bookId) return noBook();
        return showInPage(ensureActivePage('reader'), req);
      })['catch'](function (err) {
        NS.log('getCurrentRef failed', err && err.code);
        return noBook();
      });
  }

  function noBook() {
    if (activePage()) {
      NS.setStatus(NS.t('אין ספר פתוח בקורא. פתח ספר בקורא, או בחר „תרגום לאנגלית” בתפריט הקטע.'), 'info');
      return null;
    }
    return openPage('reader', null);
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

  // ---- pages --------------------------------------------------------------

  function activePage() {
    return pageById(state.activeId);
  }

  function pageById(id) {
    for (var i = 0; i < state.pages.length; i++) {
      if (state.pages[i].id === id) return state.pages[i];
    }
    return null;
  }

  function isActive(page) {
    return !!page && page.id === state.activeId;
  }

  /** The view a page opens with when it is not in split view. */
  function defaultView(entry) {
    var per = (NS.settings.viewForContext || {})[entry];
    return per && NS.Views[per] ? per : 'sidebyside';
  }

  function createPage(entry) {
    var split = !!NS.settings.splitNewPages;
    var page = {
      id: state.nextId++,
      entry: entry || 'reader',
      split: split,
      // Split pages open on English only: the reader is already on the left.
      view: split ? 'english' : defaultView(entry || 'reader'),
      req: null,
      label: NS.t('עמוד חדש'),
      book: null,
      bookKey: null,
      chunk: null,
      unit: null,
      parsed: null,
      focus: null,
      focusNext: false,
      hebrew: null,
      lastRef: null,
      lastBookId: null,
      lastTitle: null,
      paint: null, // function(): draws the page into the render host
      token: 0,
      scrolls: null,
    };
    state.pages.push(page);
    return page;
  }

  /** The active page, creating and opening an empty one when there is none. */
  function ensureActivePage(entry) {
    var page = activePage();
    if (page) return page;
    page = createPage(entry);
    activatePage(page);
    return page;
  }

  /** Open a new page for a location (or an empty page when there is none). */
  function openPage(entry, req) {
    var page = createPage(entry);
    activatePage(page);
    if (!req || (!req.bookTitle && !req.bookId)) {
      setScreen(page, function () {
        NS.setStatus(NS.t('אין ספר פתוח בקורא. פתח ספר בקורא, או בחר „תרגום לאנגלית” בתפריט הקטע.'), 'info');
      });
      return Promise.resolve(null);
    }
    req.entry = entry;
    return loadPage(page, req);
  }

  /** Load a location into a page, and show that page if it is the active one. */
  function showInPage(page, req) {
    page.entry = req.entry || page.entry;
    if (!isActive(page)) activatePage(page);
    return loadPage(page, req);
  }

  /** Make a page the one on screen. The scroll position of the old page is kept. */
  function activatePage(page) {
    var prev = activePage();
    if (prev && prev !== page) prev.scrolls = readScrolls();
    state.activeId = page ? page.id : null;
    renderTabs();
    applySettingsToChrome();
    if (!page) {
      NS.renderHost().textContent = '';
      NS.setHeader('', '');
      NS.setStatus(NS.t('אין עמוד פתוח. לחץ על „עמוד חדש” או פתח ספר בקורא.'), 'info');
      return;
    }
    repaint(page, page.scrolls);
  }

  /** Clear the render host and draw the page. Restores scroll unless the page focused a passage. */
  function repaint(page, scrolls) {
    NS.setStatus('', '');
    NS.renderHost().textContent = '';
    var focused = false;
    if (page.paint) {
      focused = !!page.paint();
    } else {
      NS.setStatus(NS.t('הנתונים עדיין נטענים…'), 'info');
    }
    if (!focused && scrolls) restoreScrolls(scrolls);
    renderTabs();
    applySettingsToChrome();
  }

  /** Draw a page that has nothing but a message to show. */
  function setScreen(page, draw) {
    page.paint = function () {
      draw();
      return false;
    };
    if (isActive(page)) repaint(page, null);
  }

  function closePage(id) {
    var idx = -1;
    for (var i = 0; i < state.pages.length; i++) {
      if (state.pages[i].id === id) idx = i;
    }
    if (idx < 0) return;
    var wasActive = state.activeId === id;
    state.pages.splice(idx, 1);
    if (!wasActive) {
      renderTabs();
      return;
    }
    var next = state.pages[idx] || state.pages[idx - 1] || null;
    activatePage(next);
  }

  /** Re-load every open page from its last request (after the data changes). */
  function reloadPages() {
    return state.pages.slice().reduce(function (chain, page) {
      return chain.then(function () {
        return page.req ? loadPage(page, page.req) : null;
      });
    }, Promise.resolve());
  }

  function repaintActive() {
    var page = activePage();
    if (page && page.unit) repaint(page, readScrolls());
  }

  // ---- scrolling ----------------------------------------------------------

  /** The elements that scroll for the current page: each split pane, or the content. */
  function scrollers() {
    var out = [];
    var host = NS.renderHost();
    var panes = host ? host.querySelectorAll('.split-pane') : [];
    for (var i = 0; i < panes.length; i++) out.push(panes[i]);
    if (!out.length) out.push(document.getElementById('app-content'));
    return out;
  }

  function readScrolls() {
    var list = scrollers();
    var values = [];
    for (var i = 0; i < list.length; i++) values.push(list[i] ? list[i].scrollTop : 0);
    return { count: list.length, values: values };
  }

  function restoreScrolls(saved) {
    var list = scrollers();
    if (!saved || saved.count !== list.length) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i]) list[i].scrollTop = saved.values[i] || 0;
    }
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

  // ---- loading and rendering ----------------------------------------------

  /** Resolve a request and load its section into the page. Newest request wins. */
  function loadPage(page, req) {
    req = req || {};
    if (!req.bookTitle && req.bookId) {
      // Otzaria uses the Hebrew title as the bookId for library text books.
      req.bookTitle = String(req.bookId);
    }
    page.req = req;
    page.entry = req.entry || page.entry;
    page.label = req.bookTitle || page.label;
    var token = (page.token = (page.token || 0) + 1);
    renderTabs();
    if (!state.manifest) {
      // Data is still loading; boot loads every page that has a request.
      if (isActive(page)) NS.setStatus(NS.t('הנתונים עדיין נטענים…'), 'info');
      return Promise.resolve();
    }

    return App.treeHintFor(req.bookTitle)
      .then(function (hint) {
        if (token !== page.token) return null;
        var resolved = App.resolveWork(req.bookTitle, hint);
        if (resolved.error === 'no-title') {
          setScreen(page, function () {
            NS.setStatus(NS.t('לא התקבל שם ספר מהקורא.'), 'warn');
          });
          return null;
        }
        if (resolved.error === 'not-in-pack') {
          setScreen(page, function () {
            NS.showNoEnglish(req.bookTitle);
          });
          return null;
        }
        if (resolved.ambiguous) {
          setScreen(page, function () {
            NS.showAmbiguous(resolved.ambiguous, req, function () {
              loadPage(page, req);
            });
          });
          return null;
        }
        return renderWork(page, resolved.work, req, token);
      })
      ['catch'](function (err) {
        NS.log('render failed', err);
        if (token !== page.token) return;
        setScreen(page, function () {
          NS.setStatus(NS.t('שגיאה בטעינה') + ': ' + (err && err.message), 'error');
        });
      });
  }

  function renderWork(page, workKey, req, token) {
    var book = state.manifest.books[workKey];
    page.bookKey = workKey;
    page.book = book;
    // Remembered so a view switch re-renders the same place and so "open in
    // reader" knows where to send the user.
    page.lastRef = req.ref || null;
    page.lastBookId = req.bookId || book.he;
    page.lastTitle = req.bookTitle || book.he;

    return NS.Data.book(book.chunk).then(function (chunk) {
      if (token !== page.token) return null; // a newer request superseded us

      var parsed = Ref.parse(req.ref, book.schema);
      if (parsed.chapter === null) {
        setScreen(page, function () {
          NS.showRefNotParsed(req, book);
        });
        return null;
      }
      var unit = Ref.unitFor(chunk, parsed);
      if (!unit) {
        setScreen(page, function () {
          NS.showUnitMissing(book, parsed, req);
        });
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
        else if (page.entry === 'selection') {
          // If the selection cannot be mapped safely, the whole unit is shown
          // and nothing is highlighted rather than the wrong passage marked.
          NS.flashNotice(NS.t('הקטע שנבחר לא זוהה בוודאות — מוצג הקטע כולו'));
        }
      }

      return hebrewForUnit(book, unit, req, parsed).then(function (hebrew) {
        if (token !== page.token) return null;
        page.chunk = chunk;
        page.parsed = parsed;
        page.unit = unit;
        page.focus = focus;
        page.focusNext = true;
        page.hebrew = hebrew;
        page.label = book.he + (page.lastRef ? ' · ' + page.lastRef : '');
        page.paint = function () {
          return drawPage(page);
        };
        if (book.missing > 0) {
          var missingInUnit = 0;
          for (var i = 0; i < unit.e.length; i++) if (!unit.e[i]) missingInUnit++;
          if (missingInUnit > 0) {
            NS.flashNotice(
              NS.t('חלק מהשורות ללא תרגום') + ' (' + missingInUnit + '/' + unit.e.length + ')',
              'info'
            );
          }
        }
        if (isActive(page)) repaint(page, null);
        else renderTabs();
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

  /** Draw a page that has a loaded unit. Returns true when it scrolled to a passage. */
  function drawPage(page) {
    var view = page.view;
    var unit = page.unit;
    var n = unit.e.length;

    var segmentGroups = unit.g ? NS.expandRuns(unit.g, n, -1) : null;
    var ctx = {
      host: NS.renderHost(),
      book: page.book,
      chunk: page.chunk,
      unit: unit,
      from: 0,
      to: n,
      focus: page.focus,
      segmentGroups: segmentGroups,
      hebrew: page.hebrew.text,
      view: view,
      options: {
        numbers: NS.settings.numbers,
        order: NS.settings.order,
        density: NS.settings.density,
      },
      notesFor: function (i) {
        return (unit.n && unit.n[i]) || [];
      },
    };

    // Every view renders the whole unit — the chapter or daf the reader is on —
    // and the passage the reader came from is scrolled to and outlined.
    NS.setHeader(NS.Views.unitLabel(page.book, unit), page.book.he + ' · ' + (page.lastRef || ''));

    var renderer = NS.Views[view];
    if (typeof renderer !== 'function') {
      NS.setStatus(NS.t('תצוגה לא מוכרת') + ': ' + view, 'error');
      return false;
    }
    if (page.split) NS.Views.split(ctx);
    else renderer(ctx);
    NS.setStatus('', '');

    var focused = false;
    if (page.focusNext && page.focus !== null) {
      NS.scrollToSegment(page.focus);
      focused = true;
    }
    page.focusNext = false;
    return focused;
  }

  // ---- view and split -----------------------------------------------------

  App.currentView = function () {
    var page = activePage();
    return page && NS.Views[page.view] ? page.view : 'sidebyside';
  };

  App.setView = function (view) {
    if (!NS.Views[view]) return;
    var page = activePage();
    if (!page) return;
    page.view = view;
    if (!page.split) {
      // The remembered view is for pages that are not in split view.
      NS.settings.viewForContext = NS.settings.viewForContext || {};
      NS.settings.viewForContext[page.entry] = view;
      NS.saveSettings();
    }
    applySettingsToChrome();
    repaintActive();
  };

  /**
   * Split view for the active page: the reader's Hebrew on the left, the English
   * on the right. Turning it on opens the English on "English only"; turning it
   * off goes back to the page's ordinary view.
   */
  App.toggleSplit = function () {
    var page = activePage();
    if (!page) return;
    page.split = !page.split;
    page.view = page.split ? 'english' : defaultView(page.entry);
    applySettingsToChrome();
    repaintActive();
  };

  App.toggleFollow = function () {
    NS.settings.follow = !NS.settings.follow;
    NS.saveSettings();
    applySettingsToChrome();
    if (NS.settings.follow) openDefault();
  };

  // ---- chrome (top bar, page tabs, view bar, settings) --------------------

  function bindChrome() {
    var tabs = document.getElementById('view-tabs');
    if (tabs) {
      var split = el('button', 'view-tab split-toggle', NS.t('פיצול'));
      split.setAttribute('id', 'btn-split');
      split.type = 'button';
      split.title = NS.t('הקורא משמאל והאנגלית מימין');
      split.addEventListener('click', App.toggleSplit);
      tabs.appendChild(split);
      var sep = el('span', 'tab-sep');
      sep.setAttribute('aria-hidden', 'true');
      tabs.appendChild(sep);
      for (var i = 0; i < NS.Views.LIST.length; i++) {
        (function (view) {
          var b = el('button', 'view-tab', NS.Views.label(view));
          b.type = 'button';
          b.dataset.view = view;
          viewButtons.push(b);
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
    on('btn-reader', 'click', function () {
      var page = activePage();
      if (!page || !page.book) return;
      window.Otzaria
        .call('reader.openBookAtRef', {
          bookId: page.lastBookId || page.book.he,
          ref: page.lastRef || '',
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
    on('opt-split-default', 'change', function (ev) {
      NS.settings.splitNewPages = ev.target.checked;
      NS.saveSettings();
    });
    on('opt-numbers', 'change', function (ev) {
      NS.settings.numbers = ev.target.checked;
      NS.saveSettings();
      repaintActive();
    });
    on('opt-order', 'change', function (ev) {
      NS.settings.order = ev.target.value;
      NS.saveSettings();
      repaintActive();
    });
    on('opt-import', 'click', function () {
      NS.Data.pickAndUsePack()
        .then(function (m) {
          if (!m) return;
          state.manifest = m;
          NS.setPackInfo(m);
          return reloadPages().then(function () {
            if (!state.pages.some(function (page) { return !!page.req; })) return openDefault();
          });
        })['catch'](function (err) {
          NS.setStatus(NS.t('טעינת קובץ הנתונים נכשלה') + ': ' + (err && err.message), 'error');
        });
    });
    on('opt-bundled', 'click', function () {
      NS.Data.useBundled()
        .then(function (m) {
          state.manifest = m;
          NS.setPackInfo(m);
          return reloadPages().then(function () {
            if (!state.pages.some(function (page) { return !!page.req; })) return openDefault();
          });
        })['catch'](function (err) {
          NS.setStatus(NS.t('טעינת הנתונים נכשלה') + ': ' + (err && err.message), 'error');
        });
    });

    // A short bar that does not fit is dragged rather than scrolled by a bar.
    NS.dragScroll(document.getElementById('topbar-actions'));
    NS.dragScroll(document.getElementById('page-tabs'));
    NS.dragScroll(document.getElementById('view-tabs'));
  }

  function on(id, event, fn) {
    var node = document.getElementById(id);
    if (node) node.addEventListener(event, fn);
  }

  /** Open page tabs, with the "+ New page" button at the end of the strip. */
  function renderTabs() {
    var bar = document.getElementById('page-tabs');
    if (!bar) return;
    bar.textContent = '';
    for (var i = 0; i < state.pages.length; i++) {
      (function (page) {
        var active = page.id === state.activeId;
        var tab = el('div', 'page-tab' + (active ? ' active' : ''));
        var label = el('button', 'page-tab-label', page.label || '');
        label.type = 'button';
        label.title = page.label || '';
        label.setAttribute('aria-pressed', active ? 'true' : 'false');
        label.addEventListener('click', function () {
          if (!isActive(page)) activatePage(page);
        });
        var close = el('button', 'page-tab-close', '×');
        close.type = 'button';
        close.title = NS.t('סגור עמוד');
        close.setAttribute('aria-label', NS.t('סגור עמוד'));
        close.addEventListener('click', function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          closePage(page.id);
        });
        tab.appendChild(label);
        tab.appendChild(close);
        bar.appendChild(tab);
      })(state.pages[i]);
    }
    var add = el('button', 'page-tab-new', '+ ' + NS.t('עמוד חדש'));
    add.type = 'button';
    add.title = NS.t('פתח עמוד חדש במיקום הנוכחי של הקורא');
    add.addEventListener('click', function () {
      newPageFromReader();
    });
    bar.appendChild(add);
  }

  function newPageFromReader() {
    if (!window.Otzaria) return openPage('reader', null);
    return window.Otzaria
      .call('reader.getCurrentRef')
      .then(function (res) {
        var data = NS.unwrap(res, 'reader.getCurrentRef');
        return openPage('reader', readerLocation(data || {}));
      })['catch'](function () {
        return openPage('reader', null);
      });
  }

  function applySettingsToChrome() {
    var page = activePage();
    var view = App.currentView();
    for (var i = 0; i < viewButtons.length; i++) {
      var isCurrent = viewButtons[i].dataset.view === view;
      viewButtons[i].classList.toggle('active', isCurrent);
      viewButtons[i].setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
    }
    var split = document.getElementById('btn-split');
    if (split) {
      var isSplit = !!(page && page.split);
      split.classList.toggle('active', isSplit);
      split.setAttribute('aria-pressed', isSplit ? 'true' : 'false');
    }
    var follow = document.getElementById('btn-follow');
    if (follow) {
      follow.classList.toggle('active', !!NS.settings.follow);
      follow.setAttribute('aria-pressed', NS.settings.follow ? 'true' : 'false');
      follow.textContent = NS.settings.follow ? NS.t('עוקב אחרי הקורא: פעיל') : NS.t('עקוב אחרי הקורא');
    }
    var content = document.getElementById('app-content');
    if (content) content.classList.toggle('split-mode', !!(page && page.split));
    setChecked('opt-numbers', NS.settings.numbers);
    setChecked('opt-split-default', NS.settings.splitNewPages);
    setValue('opt-order', NS.settings.order);
    var root = document.documentElement;
    root.classList.toggle('density-compact', NS.settings.density === 'compact');
    root.classList.toggle('order-en', NS.settings.order === 'english-first');
  }

  function setChecked(id, v) {
    var node = document.getElementById(id);
    if (node) node.checked = !!v;
  }
  function setValue(id, v) {
    var node = document.getElementById(id);
    if (node && node.value !== v) node.value = v;
  }

  // ---- helpers used by other modules -------------------------------------

  NS.renderHost = function () {
    return document.getElementById('render-host');
  };

  NS.setStatus = function (text, kind) {
    var node = document.getElementById('status');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'status' + (kind ? ' ' + kind : '');
    node.classList.toggle('hidden', !text);
  };

  NS.setHeader = function (title, subtitle) {
    var t = document.getElementById('bar-title');
    var s = document.getElementById('bar-subtitle');
    if (t) t.textContent = title || '';
    if (s) s.textContent = subtitle || '';
  };

  NS.setPackInfo = function (manifest) {
    var node = document.getElementById('pack-info');
    if (!node || !manifest) return;
    node.textContent =
      (NS.Data.mode() === 'imported' ? NS.t('חבילה מיובאת') : NS.t('חבילה מובנית')) +
      ' · ' +
      manifest.stats.books + ' ' + NS.t('ספרים');
  };

  var noticeTimer = null;
  NS.flashNotice = function (text, kind) {
    var node = document.getElementById('notice');
    if (!node) return;
    var line = document.createElement('div');
    line.className = 'notice ' + (kind || 'info');
    line.appendChild(document.createTextNode(text));
    node.appendChild(line);
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () {
      node.textContent = '';
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

  /** Scroll to a passage in every pane that shows it, and outline it there. */
  NS.focusSegment = function (ctx, index) {
    NS.scrollToSegment(index);
  };

  NS.scrollToSegment = function (index) {
    var host = NS.renderHost();
    if (!host) return;
    var nodes = host.querySelectorAll('[data-index="' + index + '"]');
    if (!nodes.length) return;
    var marked = host.querySelectorAll('.focused');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('focused');
    for (var j = 0; j < nodes.length; j++) {
      if (typeof nodes[j].scrollIntoView === 'function') {
        nodes[j].scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      nodes[j].classList.add('focused');
    }
  };

  /**
   * Drag-to-scroll for a bar that does not fit: press and move the mouse to
   * pan it. There is no scroll bar. A press that does not move is still a click.
   * The vertical wheel also pans the bar, so it works without a drag.
   */
  NS.dragScroll = function (node) {
    if (!node) return;
    var down = false;
    var moved = false;
    var startX = 0;
    var startLeft = 0;
    var swallowClick = false;

    node.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      down = true;
      moved = false;
      startX = ev.clientX;
      startLeft = node.scrollLeft;
    });
    node.addEventListener('pointermove', function (ev) {
      if (!down) return;
      var dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) {
        moved = true;
        node.classList.add('dragging');
      }
      node.scrollLeft = startLeft - dx;
      if (ev.preventDefault) ev.preventDefault();
    });
    function release() {
      if (!down) return;
      down = false;
      node.classList.remove('dragging');
      if (moved) {
        // The click that ends a drag must not also press the button under it.
        swallowClick = true;
        setTimeout(function () {
          swallowClick = false;
        }, 0);
      }
    }
    node.addEventListener('pointerup', release);
    node.addEventListener('pointerleave', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener(
      'click',
      function (ev) {
        if (!swallowClick) return;
        swallowClick = false;
        if (ev.stopPropagation) ev.stopPropagation();
        if (ev.preventDefault) ev.preventDefault();
      },
      true
    );
    node.addEventListener(
      'wheel',
      function (ev) {
        if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
        node.scrollLeft += ev.deltaY;
        if (ev.preventDefault) ev.preventDefault();
      },
      { passive: false }
    );
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

  /** Several texts share the title: ask which one, and reload the page with the choice. */
  NS.showAmbiguous = function (candidates, req, onPick) {
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
          onPick();
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
