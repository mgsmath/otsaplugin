/* otsaplugin — environment, SDK bridge and shared state.
 *
 * Classic script (no ES modules): on Linux and Android the plugin page is served
 * from a file:// origin where Chromium blocks modules. Every file in this plugin
 * attaches to `window.OtzEn` and is loaded with a plain <script src>.
 *
 * All colours and fonts come from the theme API (see css/plugin.css). Nothing
 * here hardcodes a colour.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});

  NS.PLUGIN_ID = 'org.sefaria.otzaria-english';
  NS.PACK_FORMAT_VERSION = 1;

  // ---- SDK plumbing -------------------------------------------------------

  var booted = false;
  var bootPayload = null;
  var pendingBoot = [];

  NS.hasBoot = function () {
    return booted;
  };
  NS.bootPayload = function () {
    return bootPayload;
  };

  /** Wrap a callback so it only runs after plugin.boot. */
  NS.afterBoot = function (fn) {
    if (booted) {
      fn(bootPayload);
    } else {
      pendingBoot.push(fn);
    }
  };

  NS.init = function () {
    if (!window.Otzaria || typeof window.Otzaria.on !== 'function') {
      document.documentElement.classList.add('no-sdk');
      return;
    }
    window.Otzaria.on('plugin.boot', function (payload) {
      bootPayload = payload || {};
      booted = true;
      NS.platform = (payload && payload.app && payload.app.platform) || 'unknown';
      NS.runMode = (payload && payload.app && payload.app.runMode) || 'foreground';
      var queue = pendingBoot;
      pendingBoot = [];
      for (var i = 0; i < queue.length; i++) {
        try {
          queue[i](bootPayload);
        } catch (err) {
          NS.log('boot handler failed', err);
        }
      }
    });
    window.Otzaria.on('theme.changed', function (theme) {
      NS.applyTheme(theme);
    });
  };

  NS.log = function () {
    if (window.console && console.log) console.log.apply(console, arguments);
  };

  /** Unwrap the {success,data,error} envelope. Throws with the SDK error code. */
  function unwrap(res, method) {
    if (res && res.success) return res.data;
    var err = (res && res.error) || {};
    var e = new Error(err.message || method + ' failed');
    e.code = err.code || 'error.unknown';
    throw e;
  }
  NS.unwrap = unwrap;

  // ---- Theme --------------------------------------------------------------

  function setVar(name, value) {
    if (value === undefined || value === null || value === '') return;
    document.documentElement.style.setProperty(name, value);
  }

  NS.applyTheme = function (theme) {
    if (!theme) return;
    var cs = theme.colorScheme || {};
    var pairs = {
      '--color-primary': cs.primary,
      '--color-on-primary': cs.onPrimary,
      '--color-primary-container': cs.primaryContainer,
      '--color-on-primary-container': cs.onPrimaryContainer,
      '--color-secondary': cs.secondary,
      '--color-on-secondary': cs.onSecondary,
      '--color-secondary-container': cs.secondaryContainer,
      '--color-on-secondary-container': cs.onSecondaryContainer,
      '--color-tertiary': cs.tertiary,
      '--color-on-tertiary': cs.onTertiary,
      '--color-tertiary-container': cs.tertiaryContainer,
      '--color-on-tertiary-container': cs.onTertiaryContainer,
      '--color-surface': cs.surface,
      '--color-on-surface': cs.onSurface,
      '--color-on-surface-variant': cs.onSurfaceVariant,
      '--color-surface-container-lowest': cs.surfaceContainerLowest,
      '--color-surface-container-low': cs.surfaceContainerLow,
      '--color-surface-container': cs.surfaceContainer,
      '--color-surface-container-high': cs.surfaceContainerHigh,
      '--color-surface-container-highest': cs.surfaceContainerHighest,
      '--color-error': cs.error,
      '--color-on-error': cs.onError,
      '--color-error-container': cs.errorContainer,
      '--color-on-error-container': cs.onErrorContainer,
      '--color-outline': cs.outline,
      '--color-outline-variant': cs.outlineVariant,
      '--color-inverse-surface': cs.inverseSurface,
      '--color-on-inverse-surface': cs.onInverseSurface,
      '--color-shadow': cs.shadow,
      '--color-scrim': cs.scrim,
    };
    for (var k in pairs) {
      if (Object.prototype.hasOwnProperty.call(pairs, k)) setVar(k, pairs[k]);
    }
    // Derived translucency used for hover/selection states. Built from the role
    // colours so it follows the theme instead of a baked-in rgba().
    if (cs.primary) setVar('--color-primary-subtle', withAlpha(cs.primary, 0.12));
    if (cs.secondary) setVar('--color-secondary-subtle', withAlpha(cs.secondary, 0.14));

    var ty = theme.typography || {};
    if (ty.fontFamily) setVar('--font-main', "'" + ty.fontFamily + "', 'David', serif");
    if (ty.commentatorsFontFamily) setVar('--font-commentary', "'" + ty.commentatorsFontFamily + "', serif");
    if (ty.uiFontFamily) setVar('--font-ui', "'" + ty.uiFontFamily + "', system-ui, sans-serif");
    if (ty.fontSize) setVar('--font-size-base', ty.fontSize + 'px');
    if (ty.commentatorsFontSize) setVar('--font-size-commentary', ty.commentatorsFontSize + 'px');
    if (ty.lineHeight) setVar('--line-height', String(ty.lineHeight));

    document.documentElement.classList.toggle('mode-dark', theme.mode === 'dark');
  };

  function withAlpha(hex, alpha) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }
  NS.withAlpha = withAlpha;

  // ---- Settings (plugin storage) -----------------------------------------

  NS.DEFAULTS = {
    view: null, // last used view; null = per-entry-point default
    viewForContext: null, // { selection: 'sidebyside', reader: 'interleaved' }
    follow: false,
    splitNewPages: true, // new pages open beside the reader in Otzaria's split view: reader on the left, English on the right
    order: 'hebrew-first', // side-by-side order: 'hebrew-first' (Hebrew left) | 'english-first'
    numbers: true,
    density: 'comfortable', // 'compact' | 'comfortable'
    fontScale: 1,
    dataSource: 'bundled', // 'bundled' | 'imported'
    importToken: null,
  };

  NS.settings = Object.assign({}, NS.DEFAULTS);

  NS.loadSettings = function () {
    return window.Otzaria.call('storage.get', { key: 'settings' })
      .then(function (res) {
        var data = NS.unwrap(res, 'storage.get');
        if (data && typeof data === 'object') {
          for (var k in NS.DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(NS.DEFAULTS, k) && data[k] !== undefined) {
              NS.settings[k] = data[k];
            }
          }
        }
        return NS.settings;
      })
      .catch(function (err) {
        NS.log('settings load failed', err && err.code);
        return NS.settings;
      });
  };

  var saveTimer = null;
  NS.saveSettings = function () {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      window.Otzaria.call('storage.set', { key: 'settings', value: NS.settings })['catch'](
        function (err) {
          NS.log('settings save failed', err && err.code);
        }
      );
    }, 150);
  };

  // ---- i18n ---------------------------------------------------------------

  // The plugin interface is intentionally English regardless of Otzaria's locale.
  NS.lang = 'en';
  NS.dir = 'ltr';

  NS.setLanguage = function () {
    NS.lang = 'en';
    NS.dir = 'ltr';
    NS._dict = (window.TRANSLATIONS && window.TRANSLATIONS.en) || null;
  };

  /** UI strings are English; the Hebrew keys are stable internal identifiers. */
  NS.t = function (key) {
    var d = NS._dict || (window.TRANSLATIONS && window.TRANSLATIONS.en);
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    return key;
  };

  NS.applyDirection = function () {
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.setAttribute('lang', 'en');
  };

  // ---- Text helpers shared by the views ----------------------------------

  NS.HEBREW_MARK_RE =
    /[\u0591-\u05af\u05b0-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u05c3\u05be\u05f3\u05f4"'“”‘’]/g;

  NS.normalizeHebrew = function (text) {
    if (!text) return '';
    return String(text)
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(NS.HEBREW_MARK_RE, '')
      .replace(/[,.:;!?()[\]{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  NS.hebrewTokens = function (text) {
    var n = NS.normalizeHebrew(text);
    return n ? n.split(' ') : [];
  };

  /** Token-level Jaccard similarity, 0..1. */
  NS.similarity = function (a, b) {
    var ta = NS.hebrewTokens(a);
    var tb = NS.hebrewTokens(b);
    if (!ta.length && !tb.length) return 1;
    if (!ta.length || !tb.length) return 0;
    var setA = {};
    for (var i = 0; i < ta.length; i++) setA[ta[i]] = 1;
    var inter = 0;
    for (var j = 0; j < tb.length; j++) if (setA[tb[j]]) inter++;
    var union = {};
    for (var k = 0; k < ta.length; k++) union[ta[k]] = 1;
    for (var l = 0; l < tb.length; l++) union[tb[l]] = 1;
    var u = Object.keys(union).length;
    return u ? inter / u : 0;
  };

  /** Expand a run-length encoded integer array (source ids or segment groups). */
  NS.expandRuns = function (pairs, length, fallback) {
    var out = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var count = pairs[i][0];
      var value = pairs[i][1];
      for (var n = 0; n < count; n++) out.push(value);
    }
    while (out.length < length) out.push(fallback === undefined ? -1 : fallback);
    return out.slice(0, length);
  };

  // Retained for older test packs / import files that use source provenance.
  NS.expandProvenance = function (pairs, length) {
    return NS.expandRuns(pairs, length, -1);
  };
})();
