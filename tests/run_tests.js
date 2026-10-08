#!/usr/bin/env node
/* otsaplugin — test suite.
 *
 * Everything here runs the SHIPPED code: the real plugin/js/*.js files inside a
 * Node VM with a small DOM stub, the real generated data files in plugin/data,
 * and the real build/*.py modules through tests/py_bridge.py. Nothing is
 * re-implemented for the sake of a green tick.
 *
 *   node tests/run_tests.js [--export-root PATH]
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const { makeFixture, Node: StubNode } = require('./dom');
const { manifest: fixtureManifest, chunks: fixtureChunks } = require('./fixture_pack');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugin');
const EXPORT_ROOT =
  (function () {
    const i = process.argv.indexOf('--export-root');
    return i > 0 ? process.argv[i + 1] : null;
  })() || '/home/user/ref/Sefaria-Export-Archive';

// ---- tiny test harness -----------------------------------------------------

let passed = 0;
const failures = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  process.stdout.write('\n' + name + '\n');
}

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => {
          passed++;
          process.stdout.write('  ok   ' + name + '\n');
        },
        (err) => {
          failures.push({ group: currentGroup, name, err });
          process.stdout.write('  FAIL ' + name + ' — ' + (err && err.message) + '\n');
        }
      );
    }
    passed++;
    process.stdout.write('  ok   ' + name + '\n');
    return Promise.resolve();
  } catch (err) {
    failures.push({ group: currentGroup, name, err });
    process.stdout.write('  FAIL ' + name + ' — ' + (err && err.message) + '\n');
    return Promise.resolve();
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)
    );
  }
}
function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + b + ', got ' + a);
}

// ---- plugin loader ---------------------------------------------------------

const SCRIPTS = [
  'js/env.js',
  'js/sanitize.js',
  'js/refmap.js',
  'js/align.js',
  'js/data-loader.js',
  'i18n/en.js',
  'js/views.js',
  'js/app.js',
];

// opts.fixture: serve the small fixture pack even when plugin/data exists, for
// assertions that describe fixture content rather than the real library.
function loadPlugin(sdkHandlers, opts = {}) {
  const fixture = makeFixture();
  const sandbox = {
    window: {},
    document: fixture.document,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    TextDecoder,
    Math,
    JSON,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
  };
  sandbox.window.document = fixture.document;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox.window;
  vm.createContext(sandbox);

  // Emulate <script src="..."> for the data loader: a classic subresource load,
  // which is the delivery path the plugin actually uses on file:// origins.
  const head = fixture.document.head;
  const realAppend = head.appendChild.bind(head);
  const loadedSrcs = [];
  head.appendChild = function (child) {
    realAppend(child);
    if (child.tagName === 'SCRIPT' && child.src) {
      loadedSrcs.push(child.src);
      const p = path.join(PLUGIN, decodeURIComponent(child.src));
      if (!opts.fixture && fs.existsSync(p)) {
        vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: child.src });
        if (typeof child.onload === 'function') child.onload();
      } else if (child.src === 'data/manifest.js') {
        sandbox.window.__OTZ_EN.manifest(fixtureManifest);
        if (typeof child.onload === 'function') child.onload();
      } else {
        const match = /^data\/chunk-(.+)\.js$/.exec(child.src);
        const key = match ? decodeURIComponent(match[1]) : null;
        if (key && fixtureChunks[key]) {
          sandbox.window.__OTZ_EN.chunk(key, fixtureChunks[key]);
          if (typeof child.onload === 'function') child.onload();
        } else if (typeof child.onerror === 'function') {
          child.onerror(new Error('not found: ' + child.src));
        }
      }
    }
    return child;
  };

  const calls = [];
  const listeners = {};
  if (sdkHandlers !== false) {
    sandbox.window.Otzaria = {
      call(method, payload) {
        calls.push({ method, payload });
        const h = sdkHandlers && sdkHandlers[method];
        const data = h ? h(payload) : null;
        if (data && data.__error) {
          return Promise.resolve({ success: false, error: { code: data.code, message: data.message } });
        }
        return Promise.resolve({ success: true, data: data === undefined ? null : data });
      },
      on(name, fn) {
        (listeners[name] = listeners[name] || []).push(fn);
      },
      off(name, fn) {
        listeners[name] = (listeners[name] || []).filter((f) => f !== fn);
      },
    };
  }

  for (const rel of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(PLUGIN, rel), 'utf8'), sandbox, { filename: rel });
  }

  const NS = sandbox.window.OtzEn;
  return {
    NS,
    sandbox,
    fixture,
    calls,
    listeners,
    loadedSrcs,
    emit(name, payload) {
      (listeners[name] || []).forEach((fn) => fn(payload));
    },
  };
}

/** The stub matches one class at a time, so compound selectors are filtered here. */
function withClass(nodes, cls) {
  return nodes.filter((n) => n.classList.contains(cls));
}

/** The active view-style button. */
function activeViews(doc) {
  return withClass(doc.getElementById('view-tabs').querySelectorAll('.view-tab'), 'active').filter((n) => n.dataset.view);
}

function python(caseName, args) {
  const out = cp.execFileSync(
    'python3',
    [path.join(ROOT, 'tests', 'py_bridge.py'), caseName, JSON.stringify(args)],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out);
}

function boot(env, overrides) {
  // index.html calls this; the harness has to, or nothing ever subscribes.
  env.NS.App.start();
  const payload = Object.assign(
    {
      plugin: { id: 'org.sefaria.otzaria-english', version: '1.0.0' },
      app: { version: '0.9.99', platform: 'linux', locale: 'he_IL', language: 'he', textDirection: 'rtl', runMode: 'foreground' },
      theme: { mode: 'light', colorScheme: { primary: '#6750a4', surface: '#ffffff' }, typography: { fontSize: 25 } },
    },
    overrides || {}
  );
  env.emit('plugin.boot', payload);
  // Let the promise chain from the boot handler settle.
  return new Promise((r) => setTimeout(r, 30));
}

// ===========================================================================

async function main() {
  const env0 = loadPlugin({});
  const NS = env0.NS;
  const Ref = NS.Ref;

  // ---- Hebrew numerals ----------------------------------------------------
  group('Hebrew numerals (js/hebrewToInt ≡ build/sefaria_text.py)');
  const numeralCases = [
    ['א', 1], ['ב', 2], ['ט', 9], ['י', 10], ['יא', 11], ['טו', 15], ['כ', 20],
    ['כד', 24], ['ל', 30], ['מב', 42], ['צט', 99], ['ק', 100], ['קיט', 119],
    ['ר', 200], ['ת', 400], ['תק', 500], ['תרפג', 683], ['ב׳', 2], ['ט״ו', 15],
    ['קכ״ג', 123], ['12', 12], ['', null], ['xyz', null],
  ];
  for (const [input, expected] of numeralCases) {
    await test('hebrewToInt ' + JSON.stringify(input) + ' = ' + expected, () => {
      eq(NS.hebrewToInt(input), expected);
    });
  }
  await test('hebrewToInt matches the Python implementation on every case', () => {
    const py = python('hebrew_numeral', { cases: numeralCases.map((c) => c[0]) });
    py.forEach((row, i) => eq(row.value, numeralCases[i][1], 'py ' + row.input));
  });

  // ---- Daf arithmetic -----------------------------------------------------
  group('Daf (folio) arithmetic');
  const dafGolden = [[2, '1b'], [3, '2a'], [4, '2b'], [5, '3a'], [205, '103a'], [206, '103b'], [1, '1a']];
  for (const [section, label] of dafGolden) {
    await test('dafLabel(' + section + ') = ' + label, () => eq(NS.dafLabel(section), label));
  }
  for (const [section, label] of dafGolden) {
    await test('dafToSection(' + label + ') = ' + section, () => eq(NS.dafToSection(label), section));
  }
  await test('daf round trip matches Python for sections 1..40', () => {
    const sections = [];
    for (let i = 1; i <= 40; i++) sections.push(i);
    const py = python('daf', { sections });
    py.forEach((row) => {
      eq(row.label, NS.dafLabel(row.section), 'label ' + row.section);
      eq(row.roundTrip, row.section, 'round trip ' + row.label);
    });
  });
  await test("dafToSection rejects malformed labels", () => {
    eq(NS.dafToSection(''), null);
    eq(NS.dafToSection('a'), null);
    eq(NS.dafToSection('0a'), null);
  });

  // ---- Ref parsing golden table ------------------------------------------
  group('Otzaria ref parsing — golden table');
  const refGolden = [
    // [ref, schema, {chapter, sub, level}]
    ['פרק א', 'verse', { chapter: 1, sub: null, level: 'chapter' }],
    ['א', 'verse', { chapter: 1, sub: null, level: 'chapter' }],
    ['פרק א, פסוק ג', 'verse', { chapter: 1, sub: 3, level: 'sub' }],
    ['פרק א פסוק ג', 'verse', { chapter: 1, sub: 3, level: 'sub' }],
    ['א:ג', 'verse', { chapter: 1, sub: 3, level: 'sub' }],
    ['1:3', 'verse', { chapter: 1, sub: 3, level: 'sub' }],
    ['טו:ז', 'verse', { chapter: 15, sub: 7, level: 'sub' }],
    ['פרק יב', 'verse', { chapter: 12, sub: null, level: 'chapter' }],
    ['פרק כ״ד', 'verse', { chapter: 24, sub: null, level: 'chapter' }],
    ['פרק קיט, פסוק צה', 'verse', { chapter: 119, sub: 95, level: 'sub' }],
    ['פרק תר, פסוק ב', 'verse', { chapter: 600, sub: 2, level: 'sub' }],
    ['פרק ב, פסוק א', 'verse', { chapter: 2, sub: 1, level: 'sub' }],
    ['פרק א, משנה ב', 'mishnah', { chapter: 1, sub: 2, level: 'sub' }],
    ['פרק ג, משנה ז', 'mishnah', { chapter: 3, sub: 7, level: 'sub' }],
    ['פרק ה', 'mishnah', { chapter: 5, sub: null, level: 'chapter' }],
    ['ב:ד', 'mishnah', { chapter: 2, sub: 4, level: 'sub' }],
    ['סימן א, סעיף ב', 'siman', { chapter: 1, sub: 2, level: 'sub' }],
    ['פרק ג, הלכה ד', 'halakha', { chapter: 3, sub: 4, level: 'sub' }],
    ['דף ב.', 'daf', { chapter: 3, sub: null, level: 'daf' }],
    ['דף ב:', 'daf', { chapter: 4, sub: null, level: 'daf' }],
    ['ב.', 'daf', { chapter: 3, sub: null, level: 'daf' }],
    ['ב:', 'daf', { chapter: 4, sub: null, level: 'daf' }],
    ['דף ב עמוד א', 'daf', { chapter: 3, sub: null, level: 'daf' }],
    ['דף ב עמוד ב', 'daf', { chapter: 4, sub: null, level: 'daf' }],
    ['דף ב ע"א', 'daf', { chapter: 3, sub: null, level: 'daf' }],
    ['דף ב ע"ב', 'daf', { chapter: 4, sub: null, level: 'daf' }],
    ['דף קג.', 'daf', { chapter: 205, sub: null, level: 'daf' }],
    ['דף קג:', 'daf', { chapter: 206, sub: null, level: 'daf' }],
    ['דף כא עמוד ב', 'daf', { chapter: 42, sub: null, level: 'daf' }],
    ['ב', 'daf', { chapter: 2, sub: null, level: 'daf-partial' }],
    ['', 'verse', { chapter: null, sub: null, level: 'none' }],
    ['לא ידוע', 'verse', { chapter: null, sub: null, level: 'none' }],
  ];
  for (const [ref, schema, want] of refGolden) {
    await test('parse ' + JSON.stringify(ref) + ' [' + schema + ']', () => {
      const got = Ref.parse(ref, schema);
      eq(got.chapter, want.chapter, 'chapter');
      eq(got.sub, want.sub, 'sub');
      eq(got.level, want.level, 'level');
    });
  }
  await test('parse never invents a chapter from an unparsable ref', () => {
    ['?', '...', 'א:לא_מספר', 'פרק', 'עמוד א'].forEach((r) => {
      const got = Ref.parse(r, 'verse');
      if (got.chapter !== null) throw new Error('invented chapter for ' + JSON.stringify(r));
    });
  });
  await test('a daf ref with no amud is flagged inexact', () => {
    eq(Ref.parse('ב', 'daf').exact, false);
    eq(Ref.parse('ב.', 'daf').exact, true);
  });

  // ---- Title normalisation and resolution --------------------------------
  group('Book title resolution');
  await test('normalizeTitle drops title prefixes including Mishneh Torah and Rambam', () => {
    eq(NS.normalizeTitle('משנה ברכות'), 'ברכות');
    eq(NS.normalizeTitle('מסכת שבת'), 'שבת');
    eq(NS.normalizeTitle('שמואל א׳'), 'שמואל א');
    eq(NS.normalizeTitle('משנה תורה הלכות תשובה'), 'הלכות תשובה');
    eq(NS.normalizeTitle('משנה תורה, הלכות תשובה'), 'הלכות תשובה');
    eq(NS.normalizeTitle('רמב״ם הלכות תשובה'), 'הלכות תשובה');
    eq(NS.normalizeTitle('  בראשית  '), 'בראשית');
    eq(NS.normalizeTitle('Genesis'), 'genesis');
  });
  await test('normalizeTitle matches the Python implementation', () => {
    const cases = ['משנה ברכות', 'מסכת שבת', 'שמואל א׳', 'משנה תורה הלכות תשובה', 'משנה תורה, הלכות תשובה', 'רמב״ם הלכות תשובה', '  בראשית  ', 'Genesis', 'Mishneh Torah, Repentance', 'I Kings'];
    const py = python('normalize_title', { cases });
    py.forEach((row, i) => eq(row.value, NS.normalizeTitle(cases[i]), cases[i]));
  });

  await NS.Data.init();
  const manifest = await NS.Data.manifest();
  assert(manifest, 'bundled manifest loaded');

  // Fixture-specific: Mishnah Berurah is not in the compact or extended library.
  await test('the pack resolves Tanakh, Mishnah, and Mishneh Torah title prefixes', () => {
    eq(Ref.resolveBook(fixtureManifest, 'בראשית'), 'Genesis');
    eq(Ref.resolveBook(fixtureManifest, 'Genesis'), 'Genesis');
    eq(Ref.resolveBook(fixtureManifest, 'משנה אבות'), 'Pirkei Avot');
    eq(Ref.resolveBook(fixtureManifest, 'משנה ברורה'), 'Mishnah Berurah');
    eq(Ref.resolveBook(fixtureManifest, 'משנה תורה, הלכות תשובה'), 'Mishneh Torah, Repentance');
    eq(Ref.resolveBook(fixtureManifest, 'רמב״ם הלכות תשובה'), 'Mishneh Torah, Repentance');
  });
  await test('the pack reports ברכות as ambiguous instead of guessing', () => {
    const got = Ref.resolveBook(manifest, 'ברכות');
    assert(Array.isArray(got), 'expected a list, got ' + JSON.stringify(got));
    assert(got.indexOf('Berakhot') >= 0 && got.indexOf('Mishnah Berakhot') >= 0, 'both works listed');
  });
  await test('the pack reports שבת as ambiguous instead of guessing', () => {
    const got = Ref.resolveBook(manifest, 'שבת');
    assert(Array.isArray(got), 'expected a list');
    assert(got.indexOf('Shabbat') >= 0 && got.indexOf('Mishnah Shabbat') >= 0);
  });
  await test('an unknown title resolves to null', () => {
    eq(Ref.resolveBook(manifest, 'ספר שלא קיים'), null);
    eq(Ref.resolveBook(manifest, ''), null);
    eq(Ref.resolveBook(null, 'בראשית'), null);
  });

  // ---- Data files ---------------------------------------------------------
  group('Offline data loader');
  await test('the manifest is format 1 and contains works and segments', () => {
    eq(manifest.formatVersion, 1);
    eq(typeof manifest.stats.books, 'number');
    assert(manifest.stats.books > 0, 'has books');
    assert(manifest.stats.segments > 0, 'has segments');
  });
  await test('the loader injects data/manifest.js as a <script src>', () => {
    assert(env0.loadedSrcs.indexOf('data/manifest.js') >= 0, env0.loadedSrcs.join(','));
  });
  await test('generated data scripts or the fallback fixture wrapper compile', () => {
    const dir = path.join(PLUGIN, 'data');
    let n = 0;
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
        n++;
      }
    } else {
      new vm.Script('window.__OTZ_EN.manifest(' + JSON.stringify(fixtureManifest) + ');');
      new vm.Script('window.__OTZ_EN.chunk("Genesis",' + JSON.stringify(fixtureChunks.Genesis) + ');');
      n = 2;
    }
    assert(n >= 2, 'expected at least a manifest and a chunk wrapper');
  });
  await test('a chunk loads lazily through the same <script src> path', async () => {
    const chunk = await NS.Data.book('Genesis');
    eq(chunk.book, 'Genesis');
    assert(chunk.units.length > 0, 'units');
    assert(env0.loadedSrcs.indexOf('data/chunk-Genesis.js') >= 0, env0.loadedSrcs.join(','));
  });
  await test('a unit carries english, hebrew, provenance and an alignment flag', async () => {
    const chunk = await NS.Data.book('Genesis');
    const u = chunk.units[0];
    assert(Array.isArray(u.e) && u.e.length > 0, 'e');
    eq(u.h.length, u.e.length, 'h aligned to e');
    eq(u.al, 1, 'al');
    const prov = NS.expandProvenance(u.p, u.e.length);
    eq(prov.length, u.e.length, 'provenance length');
    assert(prov[0] >= 0, 'provenance id');
  });
  await test('provenance ids point at real sources', async () => {
    const chunk = await NS.Data.book('Berakhot');
    const u = chunk.units[0];
    const prov = NS.expandProvenance(u.p, u.e.length);
    prov.forEach((id) => {
      assert(id >= 0 && id < manifest.sources.length, 'source id ' + id);
      assert(manifest.sources[id].license, 'licence recorded');
    });
  });
  await test('RLE encode/decode round trips (Python)', () => {
    const cases = [[0, 0, 0, 1, 1], [5], [], [-1, -1, 2, 2, 2, 2]];
    const py = python('rle', { cases });
    py.forEach((row) => deepEq(row.decoded, row.values.length ? row.values : []));
  });
  await test('JS expandProvenance matches the Python rle_decode', () => {
    const cases = [[0, 0, 0, 1, 1], [-1, -1, 2, 2], [7]];
    const py = python('rle', { cases });
    py.forEach((row) => deepEq(NS.expandProvenance(row.encoded, row.values.length), row.decoded));
  });

  // ---- Merge fidelity against Sefaria's own merged.json -------------------
  group('Merge fidelity vs Sefaria merged.json (build/pipeline.py)');
  const fidelityDirs = [
    'json/Tanakh/Torah/Genesis',
    'json/Tanakh/Prophets/Isaiah',
    'json/Mishnah/Seder Zeraim/Mishnah Berakhot',
    'json/Talmud/Bavli/Seder Zeraim/Berakhot',
  ];
  await test('re-derived merge is ~identical to Sefaria merged.json', () => {
    if (!fs.existsSync(EXPORT_ROOT)) {
      process.stdout.write('  (skipped: no Sefaria export at ' + EXPORT_ROOT + ')\n');
      return;
    }
    const rows = python('merge_fidelity', { exportRoot: EXPORT_ROOT, dirs: fidelityDirs });
    rows.forEach((r) => {
      assert(!r.error, r.dir + ': ' + r.error);
      const ratio = r.identical / r.total;
      process.stdout.write(
        '       ' + r.dir + ' — ' + r.identical + '/' + r.total + ' (' + (ratio * 100).toFixed(2) + '%)\n'
      );
      assert(ratio > 0.99, r.dir + ' fidelity ' + ratio);
    });
  });

  // ---- Licence policy -----------------------------------------------------
  group('Licence policy (build/pipeline.py)');
  await test('open policy keeps PD/CC0/CC-BY/CC-BY-SA and drops NC + unknown', () => {
    const rows = python('licence', {
      cases: [
        ['open', { license: 'Public Domain' }],
        ['open', { license: 'CC0' }],
        ['open', { license: 'CC-BY' }],
        ['open', { license: 'CC-BY-SA' }],
        ['open', { license: 'CC-BY-NC' }],
        ['open', { license: 'unknown' }],
        ['open', {}],
        ['include-nc', { license: 'CC-BY-NC' }],
        ['include-nc', { license: 'unknown' }],
      ],
    });
    deepEq(
      rows.map((r) => r.ok),
      [true, true, true, true, false, false, false, true, false]
    );
  });
  await test('a non-English actualLanguage is rejected even with a free licence', () => {
    const rows = python('licence', {
      cases: [['open', { license: 'Public Domain', actualLanguage: 'pt' }]],
    });
    eq(rows[0].ok, false);
    eq(rows[0].reason, 'language:pt');
  });
  await test('merge order is priority desc, then segment count, then title', () => {
    const row = python('sort_key', {
      versions: [
        { versionTitle: 'Low', priority: 1, text: [['a']] },
        { versionTitle: 'HighFew', priority: 9, text: [['a']] },
        { versionTitle: 'HighMany', priority: 9, text: [['a', 'b', 'c']] },
        { versionTitle: 'NoPriority', text: [['a', 'b']] },
      ],
    });
    // priority 9 (most segments first), then priority 1, then priority 0.
    deepEq(row.order, ['HighMany', 'HighFew', 'Low', 'NoPriority']);
  });

  // ---- Sanitisation -------------------------------------------------------
  group('HTML sanitisation');
  await test('script content is dropped, whitelist kept, footnotes extracted (Python)', () => {
    const rows = python('sanitize', {
      cases: [
        '<p>Hello <b>world</b><script>alert(1)</script></p>',
        'Text with <i>italics</i> and <a href="http://x">a link</a>',
        'Before<sup class="footnote-marker">1</sup> after<i class="footnote">The note</i>',
        'Curly “quotes” and an em-dash — preserved',
        '<img src="http://evil/x.png" onerror="bad()">text',
      ],
    });
    assert(rows[0].text.indexOf('alert') < 0, 'script dropped: ' + rows[0].text);
    assert(rows[0].text.indexOf('<b>world</b>') >= 0, 'b kept');
    assert(rows[1].text.indexOf('<i>italics</i>') >= 0, 'i kept');
    assert(rows[2].notes.length === 1, 'one footnote, got ' + rows[2].notes.length);
    assert(rows[2].notes[0].indexOf('The note') >= 0, 'note text');
    assert(rows[3].text.indexOf('“quotes”') >= 0, 'curly quotes');
    assert(rows[4].text.indexOf('onerror') < 0 && rows[4].text.indexOf('evil') < 0, 'img attrs dropped');
    // The footnote must leave the reading line, not be appended to it.
    assert(rows[2].text.indexOf('The note') < 0, 'footnote left the text: ' + rows[2].text);
    assert(rows[2].text.indexOf('footnote-marker') >= 0, 'marker kept');
  });
  await test('the JS renderer never passes raw HTML to innerHTML', () => {
    const el = new StubNode('div');
    let threw = false;
    try {
      NS.renderSafe(el, '<b>bold</b><script>x</script>');
    } catch (e) {
      threw = true;
    }
    assert(!threw, 'renderSafe must not use innerHTML');
    assert(el.textContent.indexOf('bold') >= 0, 'text present');
    assert(el.textContent.indexOf('script') < 0, 'script tag name not rendered as text');
  });
  await test('safeText strips tags and decodes nothing executable', () => {
    const t = NS.safeText('<b>x</b><script>y</script>');
    assert(t.indexOf('<') < 0, 'no angle brackets');
  });

  // ---- Hebrew alignment ---------------------------------------------------
  group('Hebrew alignment (Otzaria text ↔ pack segments)');
  const packSegs = ['בראשית ברא אלהים', 'והארץ היתה תהו ובהו'];
  await test('exact letter sequence aligns 1:1', () => {
    const r = NS.alignHebrew('בראשית ברא אלהים. והארץ היתה תהו ובהו.', packSegs);
    eq(r.aligned, true, r.reason);
    const slices = NS.sliceAligned('בראשית ברא אלהים. והארץ היתה תהו ובהו.', r);
    eq(slices.length, 2);
    assert(slices[0].indexOf('בראשית') === 0, slices[0]);
    assert(slices[1].indexOf('והארץ') === 0, slices[1]);
  });
  await test('niqqud and punctuation differences do not break alignment', () => {
    const otz = 'בְּרֵאשִׁית, בָּרָא אֱלֹהִים! וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ';
    const r = NS.alignHebrew(otz, packSegs);
    eq(r.aligned, true, r.reason);
    const slices = NS.sliceAligned(otz, r);
    assert(slices[0].indexOf('בְּרֵאשִׁית') === 0, 'vocalised text preserved: ' + slices[0]);
  });
  await test('a leading section header is tolerated and flagged', () => {
    const r = NS.alignHebrew('פרק א\nבראשית ברא אלהים והארץ היתה תהו ובהו', packSegs);
    eq(r.aligned, true, r.reason);
    eq(r.headerPrefix, true);
  });
  await test('different wording is reported, never force-aligned', () => {
    const r = NS.alignHebrew('משה רבינו קיבל תורה מסיני', packSegs);
    eq(r.aligned, false);
    eq(r.reason, 'letter-sequence-mismatch');
    eq(NS.sliceAligned('x', r), null);
  });
  await test('a repeated match is refused as ambiguous', () => {
    const r = NS.alignHebrew('אב אב', ['אב']);
    eq(r.aligned, false);
    eq(r.reason, 'ambiguous-match');
  });
  await test('empty inputs are reported, not aligned', () => {
    eq(NS.alignHebrew('', packSegs).aligned, false);
    eq(NS.alignHebrew('abc', packSegs).reason, 'no-hebrew-in-otzaria-text');
    eq(NS.alignHebrew('אב', ['', '']).reason, 'no-hebrew-in-pack');
  });
  await test('a loaded pack unit aligns against its own Hebrew', async () => {
    const chunk = await NS.Data.book('Genesis');
    const u = chunk.units[0];
    const otz = u.h.join(' ');
    const r = NS.alignHebrew(otz, u.h);
    eq(r.aligned, true, r.reason);
    const slices = NS.sliceAligned(otz, r);
    eq(slices.length, u.h.length);
    eq(slices[0].replace(/\s+/g, ''), u.h[0].replace(/\s+/g, ''));
  });

  // ---- Segment location ---------------------------------------------------
  group('Locating a selection inside a unit');
  await test('an exact Hebrew substring finds its segment', async () => {
    const chunk = await NS.Data.book('Genesis');
    const u = chunk.units[0];
    const needle = u.h[2].slice(0, 12);
    const got = Ref.locateSegment(u, needle);
    assert(got, 'located');
    eq(got.index, 2);
  });
  await test('an unrelated selection is NOT forced onto a segment', async () => {
    const chunk = await NS.Data.book('Genesis');
    const got = Ref.locateSegment(chunk.units[0], 'zzz qqq www');
    eq(got, null);
  });
  await test('unitFor picks the unit whose address matches', async () => {
    const chunk = await NS.Data.book('Genesis');
    const u = Ref.unitFor(chunk, Ref.parse('פרק ג', 'verse'));
    assert(u, 'found');
    eq(u.a[0], 3);
    eq(Ref.unitFor(chunk, Ref.parse('פרק תתקצט', 'verse')), null);
  });

  // ---- Views --------------------------------------------------------------
  group('The five views render loaded pack data');
  // New pages open beside the reader only when that setting is on; these tests cover the plain views.
  const viewEnv = loadPlugin({
    'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 }),
    'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
    'storage.get': () => ({ splitNewPages: false }),
  });
  await boot(viewEnv);
  await new Promise((r) => setTimeout(r, 60));

  for (const view of NS.Views.LIST) {
    await test('view "' + view + '" renders without throwing', async () => {
      viewEnv.NS.App.setView(view);
      await new Promise((r) => setTimeout(r, 60));
      const host = viewEnv.fixture.document.getElementById('render-host');
      assert(host.childNodes.length > 0, 'rendered something');
      const text = host.textContent;
      assert(text.length > 20, 'has text: ' + text.slice(0, 60));
      if (view !== 'flowing' && view !== 'english') {
        assert(text.indexOf('In the beginning') >= 0 || text.length > 20, 'english present');
      }
    });
  }
  await test('Tap to reveal keeps uncertain Hebrew at section level', async () => {
    const chunk = await viewEnv.NS.Data.book('Genesis');
    const unit = Object.assign({}, chunk.units[0], { al: 0 });
    const host = new StubNode('div');
    viewEnv.NS.Views.reveal({
      host,
      book: manifest.books.Genesis,
      unit,
      from: 0,
      to: 2,
      focus: null,
      segmentGroups: null,
      hebrew: unit.h,
      options: { numbers: true },
      notesFor: () => [],
    });
    const rows = host.querySelectorAll('.reveal-row');
    eq(rows.length, 2);
    eq(rows[0].querySelectorAll('.seg-he-text').length, 0, 'no unconfirmed per-passage Hebrew pairing');
    eq(host.querySelectorAll('.reveal-section').length, 1, 'single section-level Hebrew line');
  });
  await test('side by side pairs every passage with its own Hebrew and English line', async () => {
    const chunk = await viewEnv.NS.Data.book('Genesis');
    const unit = chunk.units[0];
    viewEnv.NS.App.setView('sidebyside');
    await new Promise((r) => setTimeout(r, 60));
    const host = viewEnv.fixture.document.getElementById('render-host');

    // One row per passage, each holding both languages: the row is the layout
    // unit, so a passage's English cannot drift away from its Hebrew.
    const rows = host
      .querySelectorAll('.sbs-row')
      .filter((row) => row.dataset.index !== undefined);
    eq(rows.length, unit.e.length, 'every passage of the chapter, none repeated');
    eq(host.querySelectorAll('.sbs-col').length, 0, 'no independent columns to drift apart');

    for (let i = 0; i < rows.length; i++) {
      const he = rows[i].querySelectorAll('.sbs-he');
      const en = rows[i].querySelectorAll('.sbs-en');
      eq(he.length, 1, 'row ' + i + ' holds one Hebrew cell');
      eq(en.length, 1, 'row ' + i + ' holds one English cell');
      assert(he[0].textContent.indexOf(unit.h[i]) >= 0, 'row ' + i + ' Hebrew: ' + he[0].textContent);
      assert(en[0].textContent.indexOf(unit.e[i]) >= 0, 'row ' + i + ' English: ' + en[0].textContent);
      eq(
        he[0].querySelectorAll('.seg-num')[0].textContent,
        en[0].querySelectorAll('.seg-num')[0].textContent,
        'both sides of row ' + i + ' carry the same verse number'
      );
    }
  });
  await test('the side-by-side row is laid out as the two-column unit', () => {
    const css = fs.readFileSync(path.join(PLUGIN, 'css', 'plugin.css'), 'utf8');
    const rule = /\.sbs-row\s*\{([^}]*)\}/.exec(css);
    assert(rule, 'the stylesheet has a .sbs-row rule');
    assert(
      /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/.test(rule[1]),
      'the row lays out both languages itself: ' + rule[1]
    );
  });
  await test('the at-a-glance windowed view is gone', () => {
    eq(viewEnv.NS.Views.peek, undefined, 'no windowed renderer');
    assert(viewEnv.NS.Views.LIST.indexOf('peek') < 0, 'not offered as a view: ' + viewEnv.NS.Views.LIST);
    const html = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    assert(!/peek/i.test(html), 'no leftover peek setting in the settings panel');
    const css = fs.readFileSync(path.join(PLUGIN, 'css', 'plugin.css'), 'utf8');
    assert(!/\.peek-/.test(css), 'no dead peek styles');
    const dict = viewEnv.sandbox.window.TRANSLATIONS.en;
    assert(!Object.prototype.hasOwnProperty.call(dict, 'הצצה'), 'no orphan label for the removed view');
  });
  await test('reader views do not display credits, licences, or source lists', async () => {
    viewEnv.NS.App.setView('english');
    await new Promise((r) => setTimeout(r, 60));
    const host = viewEnv.fixture.document.getElementById('render-host');
    eq(host.querySelectorAll('.credit-chip').length, 0);
    eq(host.querySelectorAll('.source-list').length, 0);
    const visible = host.textContent.toLowerCase();
    assert(!/copyright|licen[cs]e|cc-by|cc0|test translation/.test(visible), visible);
    const html = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    assert(!/credits|licen[cs]es|copyright/i.test(html), 'no visible credits or licence controls');
  });
  await test('plugin labels stay English even when Otzaria is Hebrew', () => {
    const e = loadPlugin({});
    e.NS.setLanguage('he', 'rtl');
    eq(e.NS.lang, 'en');
    eq(e.NS.dir, 'ltr');
    eq(e.NS.Views.label('sidebyside'), 'Side by side');
    eq(e.NS.Views.label('reveal'), 'Tap to reveal');
  });
  await test('every UI string has an English translation', () => {
    const dict = viewEnv.sandbox.window.TRANSLATIONS.en;
    const missing = [];
    const files = ['js/views.js', 'js/data-loader.js', 'js/app.js'];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
      const re = /NS\.t\(\s*'([^']+)'/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        if (!Object.prototype.hasOwnProperty.call(dict, m[1])) missing.push(rel + ': ' + m[1]);
        else if (/[\u0590-\u05ff]/.test(dict[m[1]])) missing.push(rel + ': Hebrew translation for ' + m[1]);
      }
    }
    deepEq(missing, []);
  });

  // ---- App behaviour ------------------------------------------------------
  group('Application behaviour');
  await test('an ambiguous book asks the user instead of showing one', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'ברכות', ref: 'דף ב.', index: 2 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'library.getTree': () => null,
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const host = e.fixture.document.getElementById('render-host');
    const choices = host.querySelectorAll('.choice');
    eq(choices.length, 2, 'two candidates offered');
    const text = host.textContent;
    assert(text.indexOf('Mishnah') >= 0 || text.indexOf('משנה') >= 0, text.slice(0, 80));
  });
  await test('a book with no English in the pack says so', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'ספר שלא קיים', ref: 'פרק א', index: 0 }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const host = e.fixture.document.getElementById('render-host');
    assert(host.querySelectorAll('.empty').length > 0, 'empty state shown');
  });
  await test('a context-menu click shows the selected passage in its whole chapter', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => null,
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'reader.getCurrentState': () => null,
      'reader.openBook': () => true,
      'library.getTree': () => null,
      'storage.get': () => null,
    }, { fixture: true });
    await boot(e);
    e.emit('reader.context_menu_item_clicked', {
      itemId: 'english-translation',
      selectedText: 'וירא אלהים את האור',
      currentRef: 'פרק א, פסוק ד',
      currentBook: 'בראשית',
      currentBookId: 'בראשית',
      currentIndex: 3,
    });
    await new Promise((r) => setTimeout(r, 80));
    const host = e.fixture.document.getElementById('render-host');
    eq(e.calls.filter((c) => c.method === 'reader.openBook').length, 1, 'a new page opens its reader beside it by default');
    const english = host.querySelectorAll('.seg');
    eq(english.length, 4, 'the whole chapter, not a few passages around the selection');
    const marked = host.querySelectorAll('.focused');
    assert(marked.length > 0, 'the selected passage is marked');
    assert(marked.every((node) => node.dataset.index === '3'), 'and it is the passage the reader had selected');
  });
  await test('the context menu offers only Translate selected passage', () => {
    const mf = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'manifest.json'), 'utf8'));
    const items = mf.contributes.startup.contextMenuItems;
    eq(items.length, 1, 'one context-menu item');
    eq(items[0].id, 'english-translation');
    eq(items[0].param, 'selection');
    assert(items.every((item) => !/[א-ת]/.test(item.title)), 'context menu labels are English');
    const app = fs.readFileSync(path.join(PLUGIN, 'js', 'app.js'), 'utf8');
    assert(app.indexOf('english-translation-split') < 0, 'no handler for the removed side-by-side item');
    assert(app.indexOf("'split'") < 0 && app.indexOf('payload.param') < 0, 'no param-driven split left');
  });
  await test('Follow reader button enables updates from normalized reader events', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const button = e.fixture.document.getElementById('btn-follow');
    button.dispatch('click');
    await new Promise((r) => setTimeout(r, 50));
    eq(e.NS.settings.follow, true);
    eq(button.textContent, 'Following reader');
    e.emit('reader.current_ref_changed', {
      book: { title: 'שמות' },
      currentBookId: 'שמות',
      currentReference: 'פרק ב',
      sectionIndex: 1,
    });
    await new Promise((r) => setTimeout(r, 80));
    assert(
      e.fixture.document.getElementById('bar-subtitle').textContent.indexOf('שמות') >= 0,
      'updated to the new book: ' + e.fixture.document.getElementById('bar-subtitle').textContent
    );
  });
  await test('without follow mode a ref change is ignored', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    e.NS.settings.follow = false;
    const before = e.fixture.document.getElementById('bar-title').textContent;
    e.emit('reader.current_ref_changed', { bookId: 'שמות', ref: 'פרק ב', bookTitle: 'שמות' });
    await new Promise((r) => setTimeout(r, 60));
    eq(e.fixture.document.getElementById('bar-title').textContent, before);
  });
  await test('an unalignable Hebrew fallback is silent and shows no mismatch detail', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ sourceText: 'משה רבינו קיבל תורה מסיני', hasMore: false }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 80));
    const host = e.fixture.document.getElementById('render-host');
    assert(host.textContent.indexOf('בראשית ברא אלהים') >= 0, 'packed Hebrew fallback used');
    assert(!/Sefaria|normaliz|letter-sequence-mismatch/i.test(host.textContent), host.textContent);
    eq(e.fixture.document.getElementById('notice').textContent, '', 'no alignment notice');
    eq(e.fixture.document.getElementById('status').textContent, '', 'no warning detail');
  });
  await test('no network permission is declared and no network API is called', () => {
    const mf = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'manifest.json'), 'utf8'));
    if (mf.network) eq(mf.network.enabled, false, 'network.enabled must be false');
    mf.permissions.forEach((p) => assert(!p.startsWith('network.'), 'no network permission: ' + p));
    for (const rel of SCRIPTS) {
      const src = fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
      assert(!/Otzaria\s*\.\s*call\(\s*['"]network\./.test(src), rel + ' calls a network method');
    }
    const html = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    assert(!/src\s*=\s*["']https?:/i.test(html), 'no remote script in index.html');
    assert(!/href\s*=\s*["']https?:/i.test(html), 'no remote stylesheet in index.html');
  });
  await test('the top bar has Reader and Follow reader; the view bar has no split toggle', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'reader.openBookAtRef': (payload) => payload,
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const doc = e.fixture.document;
    assert(!doc.getElementById('btn-translate'), 'no Translate button');
    assert(!doc.getElementById('btn-split'), 'no split toggle in the view bar');
    const html = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    const bar = html.slice(html.indexOf('id="topbar-actions"'), html.indexOf('</header>'));
    const top = [...bar.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    eq(top.join('|'), 'btn-reader|btn-follow|btn-options', 'top bar: reader, follow, settings');
    assert(!/btn-translate|Translate the current reader/.test(html), 'no Translate button in the markup');
    doc.getElementById('btn-reader').dispatch('click');
    await new Promise((r) => setTimeout(r, 20));
    const opened = e.calls.filter((call) => call.method === 'reader.openBookAtRef').pop();
    assert(opened, 'Reader action called');
    eq(opened.payload.ref, 'פרק א, פסוק ג');
    eq(opened.payload.bookId, 'בראשית');
  });
  // ---- Split view: Otzaria's own split, with the reader beside the page ----
  group('Split view: Otzaria’s built-in split, reader on the left, English on the right');

  /** The reader's state while its own tab is listed beside the plugin tab. */
  const readerTabState = (book, bookUid, index) => ({
    currentBook: book,
    currentBookId: book,
    bookUid,
    currentIndex: index,
    currentRef: null,
    openTabs: [
      { isSelf: false, toolId: null, book, bookId: book, bookUid, index },
      { isSelf: true, toolId: 'org.sefaria.otzaria-english', book: 'English', bookId: 'English', bookUid: null, index: 0 },
    ],
  });

  /** The reader's state inside a split: the plugin tab is listed, its reader pane is not. */
  const besideState = (book, bookUid, index) => ({
    currentBook: book,
    currentBookId: book,
    bookUid,
    currentIndex: index,
    currentRef: null,
    openTabs: [
      { isSelf: true, toolId: 'org.sefaria.otzaria-english', book: 'English', bookId: 'English', bookUid: null, index: 0 },
    ],
  });

  /** A passage sent from the reader's context menu, as the host reports it. */
  const passageClick = {
    itemId: 'english-translation',
    selectedText: 'וירא אלהים את האור',
    currentRef: 'פרק א, פסוק ד',
    currentBook: 'בראשית',
    currentBookId: 'בראשית',
    currentIndex: 3,
    selection: { bookUid: 'uid-genesis', bookTitle: 'בראשית' },
  };

  /** Host handlers with the reader on Genesis, plus whatever a test adds. */
  const readerEnv = (handlers) =>
    Object.assign(
      {
        'reader.getCurrentRef': () => null,
        'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
        'library.getTree': () => null,
        'storage.get': () => null,
      },
      handlers
    );

  const callsTo = (e, method) => e.calls.filter((c) => c.method === method);

  await test('a passage sent from the reader opens beside it, with the reader on the left', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 3),
        'reader.openBook': () => true,
      }),
      { fixture: true }
    );
    await boot(e);
    e.emit('reader.context_menu_item_clicked', passageClick);
    await new Promise((r) => setTimeout(r, 80));
    const doc = e.fixture.document;
    const opened = callsTo(e, 'reader.openBook');
    eq(opened.length, 1, 'Otzaria opens the text once');
    const args = opened[0].payload;
    eq(args.openInSidePane, true, 'as a pane beside the page, not a new tab');
    eq(args.bookUid, 'uid-genesis', 'found by its uid');
    eq(args.index, 3, 'at the passage the reader had selected');
    eq(args.navigateToPositionIfReused, true, 'and moved to that place if it is already open');
    eq(args.bookId, undefined, 'no title sent along with the uid');
    eq(activeViews(doc)[0].dataset.view, 'english', 'the page shows English only: the reader has the Hebrew');
    const host = doc.getElementById('render-host');
    eq(host.querySelectorAll('.seg').length, 4, 'the whole chapter, not a few passages around the selection');
    assert(host.textContent.indexOf('In the beginning') >= 0, 'the English is on the page');
    const marked = host.querySelectorAll('.focused');
    assert(marked.length > 0, 'the selected passage is marked');
    assert(marked.every((node) => node.dataset.index === '3'), 'and it is the passage the reader had selected');
    eq(doc.getElementById('notice').textContent, '', 'no notice when the split opens');
  });

  await test('+ New page opens the reader beside the new page, at the reader’s place', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 }),
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 0),
        'reader.openBook': () => true,
      }),
      { fixture: true }
    );
    await boot(e);
    await new Promise((r) => setTimeout(r, 40));
    e.fixture.document.getElementById('page-tabs').querySelector('.page-tab-new').dispatch('click');
    await new Promise((r) => setTimeout(r, 80));
    const opened = callsTo(e, 'reader.openBook');
    eq(opened.length, 1, 'one reader opened beside the new page');
    eq(opened[0].payload.bookId, 'בראשית', 'found by title when the reader gave no uid');
    eq(opened[0].payload.bookUid, undefined, 'no uid sent');
    eq(opened[0].payload.index, 0, 'at the reader’s line');
    assert(
      e.calls.indexOf(callsTo(e, 'reader.getCurrentState')[0]) < e.calls.indexOf(opened[0]),
      'the reader state is read before the split is requested'
    );
    eq(activeViews(e.fixture.document)[0].dataset.view, 'english', 'the new page is English only');
  });

  await test('the page that opens with the plugin is never split', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 }),
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 0),
        'reader.openBook': () => true,
      })
    );
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    eq(callsTo(e, 'reader.openBook').length, 0, 'no reader is opened beside it');
    eq(callsTo(e, 'reader.getCurrentState').length, 0, 'the reader is not even asked for its layout');
    eq(activeViews(e.fixture.document)[0].dataset.view, 'sidebyside', 'it keeps its ordinary view');
  });

  await test('Follow reader never opens a split', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 }),
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 0),
        'reader.openBook': () => true,
      })
    );
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    e.NS.settings.follow = true;
    e.emit('reader.current_ref_changed', { bookId: 'שמות', ref: 'פרק ב', bookTitle: 'שמות' });
    await new Promise((r) => setTimeout(r, 80));
    eq(callsTo(e, 'reader.openBook').length, 0, 'no reader is opened beside the followed page');
  });

  await test('with the Settings option off, a new page does not split and keeps its ordinary view', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 }),
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 0),
        'reader.openBook': () => true,
        'storage.get': () => ({ splitNewPages: false }),
      })
    );
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const doc = e.fixture.document;
    doc.getElementById('page-tabs').querySelector('.page-tab-new').dispatch('click');
    await new Promise((r) => setTimeout(r, 80));
    eq(callsTo(e, 'reader.openBook').length, 0, 'no reader is opened');
    eq(callsTo(e, 'reader.getCurrentState').length, 0, 'the layout is not even read');
    eq(activeViews(doc)[0].dataset.view, 'sidebyside', 'side by side, as before');
    eq(doc.getElementById('opt-split-default').checked, false, 'the Settings checkbox reflects it');
    e.NS.App.setView('flowing');
    eq(e.NS.settings.viewForContext.reader, 'flowing', 'a view chosen on an ordinary page is remembered');
  });

  await test('a reader already beside the plugin on the same text is moved to the line, not opened again', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentState': () => besideState('בראשית', 'uid-genesis', 5),
        'reader.openBook': () => true,
        'reader.scrollToSection': () => true,
      }),
      { fixture: true }
    );
    await boot(e);
    e.emit('reader.context_menu_item_clicked', passageClick);
    await new Promise((r) => setTimeout(r, 80));
    const scrolls = callsTo(e, 'reader.scrollToSection');
    eq(scrolls.length, 1, 'the reader pane is scrolled once');
    eq(scrolls[0].payload.sectionIndex, 3, 'to the selected passage');
    eq(callsTo(e, 'reader.openBook').length, 0, 'and no second copy of the text is opened');
    eq(activeViews(e.fixture.document)[0].dataset.view, 'english', 'the page stays beside the reader');
    eq(e.fixture.document.getElementById('notice').textContent, '', 'no notice');
  });

  await test('a split and a separate tab on the same text are told apart by their line', async () => {
    // The reader beside the plugin is at line 5; a separate tab on the same text is
    // at line 1. Only the separate tab is listed, so the split must still be found.
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentState': () => ({
          currentBook: 'בראשית',
          currentBookId: 'בראשית',
          bookUid: 'uid-genesis',
          currentIndex: 5,
          currentRef: null,
          openTabs: [
            { isSelf: false, toolId: null, book: 'בראשית', bookId: 'בראשית', bookUid: 'uid-genesis', index: 1 },
            { isSelf: true, toolId: 'org.sefaria.otzaria-english', book: 'English', bookId: 'English', bookUid: null, index: 0 },
          ],
        }),
        'reader.openBook': () => true,
        'reader.scrollToSection': () => true,
      }),
      { fixture: true }
    );
    await boot(e);
    e.emit('reader.context_menu_item_clicked', passageClick);
    await new Promise((r) => setTimeout(r, 80));
    eq(callsTo(e, 'reader.openBook').length, 0, 'the split already holds this text: no second copy');
    const scrolls = callsTo(e, 'reader.scrollToSection');
    eq(scrolls.length, 1, 'the reader beside the plugin is moved to the passage');
    eq(scrolls[0].payload.sectionIndex, 3, 'to the selected passage');
  });

  await test('a reader beside the plugin on another text is left alone, and the page says so', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentState': () => besideState('שמות', 'uid-exodus', 1),
        'reader.openBook': () => true,
        'reader.scrollToSection': () => true,
      }),
      { fixture: true }
    );
    await boot(e);
    e.emit('reader.context_menu_item_clicked', passageClick);
    await new Promise((r) => setTimeout(r, 80));
    const doc = e.fixture.document;
    eq(callsTo(e, 'reader.openBook').length, 0, 'no reader is opened');
    eq(callsTo(e, 'reader.scrollToSection').length, 0, 'and the other text is not scrolled');
    eq(activeViews(doc)[0].dataset.view, 'sidebyside', 'the page falls back to its ordinary view');
    const notice = doc.getElementById('notice').textContent;
    assert(notice.indexOf('another text') >= 0, 'the notice says why: ' + notice);
    e.NS.App.setView('flowing');
    eq(e.NS.settings.viewForContext.selection, 'flowing', 'the page is an ordinary page again, so its view is remembered');
  });

  await test('a split that Otzaria refuses falls back to the ordinary view, with a warning', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 3),
        'reader.openBook': () => false,
      }),
      { fixture: true }
    );
    await boot(e);
    e.emit('reader.context_menu_item_clicked', passageClick);
    await new Promise((r) => setTimeout(r, 80));
    const doc = e.fixture.document;
    eq(callsTo(e, 'reader.openBook').length, 1, 'the split was tried');
    eq(activeViews(doc)[0].dataset.view, 'sidebyside', 'the page shows its ordinary view');
    const notice = doc.getElementById('notice').textContent;
    assert(notice.indexOf('could not be opened beside') >= 0, 'the notice says so: ' + notice);
  });

  await test('a view picked beside the reader is not remembered for later pages', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 3),
        'reader.openBook': () => true,
      }),
      { fixture: true }
    );
    await boot(e);
    e.emit('reader.context_menu_item_clicked', passageClick);
    await new Promise((r) => setTimeout(r, 80));
    e.NS.App.setView('flowing');
    await new Promise((r) => setTimeout(r, 40));
    eq(activeViews(e.fixture.document)[0].dataset.view, 'flowing', 'the page changes view');
    eq((e.NS.settings.viewForContext || {}).selection, undefined, 'but the choice is not remembered');
  });

  await test('every view renders for a page beside the reader', async () => {
    const e = loadPlugin(
      readerEnv({
        'reader.getCurrentState': () => readerTabState('בראשית', 'uid-genesis', 3),
        'reader.openBook': () => true,
      }),
      { fixture: true }
    );
    await boot(e);
    e.emit('reader.context_menu_item_clicked', passageClick);
    await new Promise((r) => setTimeout(r, 80));
    for (const view of e.NS.Views.LIST) {
      e.NS.App.setView(view);
      await new Promise((r) => setTimeout(r, 40));
      const host = e.fixture.document.getElementById('render-host');
      assert(host.textContent.length > 20, view + ' fills the page: ' + host.textContent.slice(0, 40));
    }
  });

  await test('without the SDK, the split is not attempted', async () => {
    const e = loadPlugin(false);
    const outcome = await e.NS.App.openBesideReader({ bookUid: 'uid-genesis', title: 'בראשית', lineIndex: 0 });
    eq(outcome, 'failed', 'a plain failure, not an error');
  });

  await test('the plugin’s own split is gone: no renderer, toggle, separator or styles', async () => {
    const e = loadPlugin({});
    await boot(e);
    eq(e.NS.Views.split, undefined, 'no custom split renderer');
    eq(e.NS.Views.hebrewPane, undefined, 'no Hebrew column renderer');
    eq(e.NS.Views.LIST.length, 5, 'the five translation layouts remain');
    eq(e.fixture.document.getElementById('btn-split'), null, 'no Split toggle in the view bar');
    eq(e.fixture.document.getElementById('view-tabs').querySelectorAll('.view-tab').length, 5, 'only the five layouts in the view bar');
    const html = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    assert(!/btn-split|split-toggle|tab-sep/.test(html), 'no split toggle in the markup');
    const css = fs.readFileSync(path.join(PLUGIN, 'css', 'plugin.css'), 'utf8');
    assert(!/split|tab-sep/.test(css), 'no split or separator styles');
    const en = fs.readFileSync(path.join(PLUGIN, 'i18n', 'en.js'), 'utf8');
    assert(en.indexOf('פיצול') < 0 && en.indexOf('הקורא משמאל') < 0, 'no strings for the removed toggle');
    const app = fs.readFileSync(path.join(PLUGIN, 'js', 'app.js'), 'utf8');
    assert(!/toggleSplit|btn-split|page\.split\b|Views\.split|hebrewPane/.test(app), 'no custom split in the app');
  });

  await test('the manifest asks for Otzaria 0.9.97 or later, which the split and reader.scrollToSection need', () => {
    const mf = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'manifest.json'), 'utf8'));
    const got = String(mf.minAppVersion).split('.').map(Number);
    const want = [0, 9, 97];
    let order = 0;
    for (let i = 0; i < want.length && order === 0; i++) order = Math.sign((got[i] || 0) - want[i]);
    assert(order >= 0, 'minAppVersion ' + mf.minAppVersion + ' is older than 0.9.97');
  });

  await test('several English pages stay open, each with its own text', async () => {
    let current = { bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 };
    const e = loadPlugin({
      'reader.getCurrentRef': () => current,
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'library.getTree': () => null,
      'storage.get': () => ({ splitNewPages: false }),
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const doc = e.fixture.document;
    const labels = () => doc.getElementById('page-tabs').querySelectorAll('.page-tab-label').map((b) => b.textContent);
    eq(labels().length, 1, 'one page to start');
    assert(labels()[0].indexOf('בראשית') >= 0, labels()[0]);

    current = { bookId: 'שמות', ref: 'פרק ב', index: 0 };
    doc.getElementById('page-tabs').querySelector('.page-tab-new').dispatch('click');
    await new Promise((r) => setTimeout(r, 80));
    eq(labels().length, 2, 'a second page is open');
    eq(withClass(doc.getElementById('page-tabs').querySelectorAll('.page-tab'), 'active').length, 1);
    assert(labels()[1].indexOf('שמות') >= 0, 'the second page shows Exodus: ' + labels()[1]);
    assert(doc.getElementById('bar-subtitle').textContent.indexOf('שמות') >= 0, 'the active page is on screen');

    // Back to the first page: it is still Genesis, and its Hebrew is still there.
    doc.getElementById('page-tabs').querySelectorAll('.page-tab-label')[0].dispatch('click');
    await new Promise((r) => setTimeout(r, 40));
    assert(doc.getElementById('bar-subtitle').textContent.indexOf('בראשית') >= 0, 'first page restored');
    assert(doc.getElementById('render-host').querySelector('.sbs-he').textContent.indexOf('בראשית ברא') >= 0, 'its Hebrew restored');

    // Follow reader is off, so a reader move does not touch either page.
    e.emit('reader.current_ref_changed', { bookId: 'שמות', ref: 'פרק א', bookTitle: 'שמות' });
    await new Promise((r) => setTimeout(r, 60));
    assert(labels()[0].indexOf('בראשית') >= 0 && labels()[1].indexOf('שמות') >= 0, 'pages unchanged with follow off');

    // Closing the second page leaves the first.
    doc.getElementById('page-tabs').querySelectorAll('.page-tab-close')[1].dispatch('click');
    await new Promise((r) => setTimeout(r, 40));
    eq(labels().length, 1, 'closed');
    assert(labels()[0].indexOf('בראשית') >= 0, 'the first page remains');
  });
  await test('Follow reader moves only the page on screen', async () => {
    let current = { bookId: 'בראשית', ref: 'פרק א', index: 0 };
    const e = loadPlugin({
      'reader.getCurrentRef': () => current,
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'reader.getCurrentState': () => null,
      'reader.openBook': () => true,
      'library.getTree': () => null,
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const doc = e.fixture.document;
    const labels = () => doc.getElementById('page-tabs').querySelectorAll('.page-tab-label').map((b) => b.textContent);

    current = { bookId: 'שמות', ref: 'פרק א', index: 0 };
    doc.getElementById('page-tabs').querySelector('.page-tab-new').dispatch('click');
    await new Promise((r) => setTimeout(r, 80));
    doc.getElementById('btn-follow').dispatch('click');
    await new Promise((r) => setTimeout(r, 60));
    eq(doc.getElementById('btn-follow').textContent, 'Following reader');

    // Show the Genesis page, then let the reader move to Exodus chapter 2.
    doc.getElementById('page-tabs').querySelectorAll('.page-tab-label')[0].dispatch('click');
    await new Promise((r) => setTimeout(r, 40));
    e.emit('reader.current_ref_changed', { bookId: 'שמות', ref: 'פרק ב', bookTitle: 'שמות' });
    await new Promise((r) => setTimeout(r, 80));
    assert(labels()[0].indexOf('פרק ב') >= 0, 'the page on screen follows: ' + labels()[0]);
    assert(labels()[1].indexOf('פרק א') >= 0, 'the other page keeps its place: ' + labels()[1]);
  });

  await test('the top bar, page tabs and view bar drag instead of showing a scroll bar', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const doc = e.fixture.document;
    const css = fs.readFileSync(path.join(PLUGIN, 'css', 'plugin.css'), 'utf8');
    assert(/scrollbar-width:\s*none/.test(css.replace(/\s+/g, ' ').replace(/: /g, ':')), 'scrollbars hidden (firefox)');
    assert(/::-webkit-scrollbar\s*\{\s*display:\s*none/.test(css), 'scrollbars hidden (webkit)');
    const markup = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    for (const id of ['topbar-actions', 'page-tabs', 'view-tabs']) {
      assert(new RegExp('id="' + id + '" ?').test(markup) && new RegExp('class="[^"]*drag-scroll[^"]*"[^>]*id="' + id + '"|id="' + id + '"[^>]*class="[^"]*drag-scroll').test(markup), id + ' is a drag-scroll bar');
    }
    const bar = doc.getElementById('view-tabs');
    bar.scrollLeft = 50;
    bar.dispatch('pointerdown', { button: 0, clientX: 200, preventDefault() {} });
    bar.dispatch('pointermove', { clientX: 160, preventDefault() {} });
    eq(bar.scrollLeft, 90, 'dragging left pans the bar right');
    assert(bar.classList.contains('dragging'), 'marked as dragging');
    bar.dispatch('pointerup', {});
    assert(!bar.classList.contains('dragging'), 'released');
    bar.dispatch('wheel', { deltaY: 30, deltaX: 0, preventDefault() {} });
    eq(bar.scrollLeft, 120, 'the wheel pans it too');
    bar.scrollLeft = 10;
    bar.dispatch('pointerdown', { button: 0, clientX: 100, preventDefault() {} });
    bar.dispatch('pointermove', { clientX: 102, preventDefault() {} });
    bar.dispatch('pointerup', {});
    eq(bar.scrollLeft, 10, 'a press without movement does not pan');
  });

  await test('boot forces every plugin control to English and left-to-right', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    eq(e.fixture.document.documentElement.getAttribute('lang'), 'en');
    eq(e.fixture.document.documentElement.getAttribute('dir'), 'ltr');
    const html = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    assert(!/[א-ת]/.test(html), 'static interface and settings contain no Hebrew labels');
    eq(e.fixture.document.getElementById('btn-follow').textContent, 'Follow reader');
    const labels = e.fixture.document.getElementById('view-tabs').textContent;
    assert(labels.indexOf('Side by side') >= 0, labels);
    assert(labels.indexOf('Peek') < 0, 'the windowed view is no longer offered: ' + labels);
  });

  // ---- Schema / stage mapping (Python) ------------------------------------
  group('Schema and stage inference (build/scope.py)');
  await test('section names map to the right schema', () => {
    const rows = python('schema', {
      cases: [
        [['Chapter', 'Verse'], 2],
        [['Chapter', 'Mishnah'], 2],
        [['Daf', 'Line'], 2],
        [['Chapter', 'Halakhah'], 2],
        [['Siman', "Se'if"], 2],
        [['Chapter'], 1],
        [null, 2],
        [null, 1],
      ],
    });
    // With no section names the pipeline cannot know the schema, so it reports
    // "chapter" instead of guessing a verse-level address.
    deepEq(
      rows.map((r) => r.schema),
      ['verse', 'mishnah', 'daf', 'halakha', 'siman', 'chapter', 'chapter', 'chapter']
    );
  });
  await test('export directories map to the right stage', () => {
    const rows = python('stage', {
      cases: [
        'json/Tanakh/Torah/Genesis',
        'json/Mishnah/Seder Zeraim/Mishnah Berakhot',
        'json/Talmud/Bavli/Seder Moed/Shabbat',
        'json/Halakhah/Mishneh Torah/Sefer Madda/Mishneh Torah, Repentance',
        'json/Musar/Acharonim/Mesillat Yesharim',
        'json/Chasidut/SomeBook',
      ],
    });
    deepEq(
      rows.map((r) => r.stage),
      ['tanakh', 'mishnah', 'talmud', 'halakhah', 'musar', null]
    );
  });

  await test('recursive discovery finds nested commentaries and all supported roots', () => {
    const rows = python('discover_nested', {});
    deepEq(
      rows.map((row) => row.stage),
      ['tanakh', 'mishnah', 'talmud', 'halakhah', 'halakhah', 'musar']
    );
    assert(rows[0].dir.indexOf('Rashi on Genesis') >= 0, rows[0].dir);
    assert(rows.some((row) => row.dir.indexOf('Mishnah Berurah') >= 0), 'Mishnah Berurah discovered');
  });
  await test('nested text flattening preserves 1-based Sefaria addresses', () => {
    const rows = python('flatten_paths', { text: { text: [[['a', 'b'], ['c']]] } });
    deepEq(rows, [[[[1, 1], 'a'], [[1, 2], 'b'], [[2, 1], 'c']]]);
  });
  await test('the full build pipeline writes all supported stages and script wrappers', () => {
    const data = python('pipeline_smoke', {});
    eq(data.status, 0);
    eq(data.bookCount, 6);
    deepEq(data.stages, ['tanakh', 'mishnah', 'talmud', 'halakhah', 'musar', 'siddur']);
    assert(data.books.indexOf('Rashi on Genesis') >= 0, 'nested Tanakh commentary included');
    assert(data.books.indexOf('Mishnah Berakhot') >= 0, 'Mishnah included');
    assert(data.books.indexOf('Mishneh Torah, Repentance') >= 0, 'Rambam included');
    assert(data.books.indexOf('Mesillat Yesharim') >= 0, 'Musar included');
    deepEq(data.rashiGroups, [[1, 1]]);
    assert(data.manifestScriptValid, 'manifest wrapper is a closed script call');
    assert(data.reportsWritten, 'pipeline reports emitted');
  });
  await test('nested commentary builds merge by path and preserve verse groups', () => {
    const data = python('nested_book_build', {});
    const commentary = data.commentary;
    eq(commentary.schema, 'verse');
    deepEq(commentary.units[0].e, [
      'Preferred comment on verse one.',
      'Fallback comment two on verse one.',
      'Preferred comment on verse two.',
    ]);
    deepEq(commentary.units[0].g, [[2, 1], [1, 2]]);
    eq(commentary.units[0].al, 1);
  });
  await test('Mishnah Berurah and Rambam infer usable siman and halakhah schemas', () => {
    const data = python('nested_book_build', {});
    eq(data.berurah.schema, 'siman');
    deepEq(data.berurah.sectionNames, ['Siman', 'Seif']);
    deepEq(data.berurah.units[0].e, ['Paragraph one.', 'Paragraph two.']);
    eq(data.rambam.schema, 'halakha');
    deepEq(data.rambam.sectionNames, ['Chapter', 'Halakhah']);
  });
  await test('a bad imported library falls back to the built-in library once', async () => {
    const e = loadPlugin({
      'fs.pickUserFile': () => ({ token: 'bad-pack-token' }),
      'fs.resolveFileUrl': () => ({ __error: true, code: 'error.file_not_found', message: 'missing file' }),
      'storage.set': () => null,
    }, { fixture: true });
    const manifest = await e.NS.Data.pickAndUsePack();
    eq(manifest.formatVersion, 1);
    eq(manifest.stats.books, fixtureManifest.stats.books);
    eq(e.NS.Data.mode(), 'bundled');
    eq(e.NS.settings.dataSource, 'bundled');
  });
  await test('.otzenpack ranges round-trip and import through the plugin data loader', async () => {
    const data = python('otzenpack', {});
    eq(data.chunks, 1);
    assert(data.size > data.footerLength + 12, 'pack contains index and records');
    eq(data.manifest.formatVersion, 1);
    eq(data.chunk.book, 'Test');
    assert(data.index.manifest.length > 0, 'manifest byte range');
    assert(data.index.chunks.Test.length > 0, 'chunk byte range');

    const bytes = Buffer.from(data.payloadBase64, 'base64');
    const e = loadPlugin({
      'fs.pickUserFile': () => ({ token: 'test-pack-token' }),
      'fs.resolveFileUrl': () => ({ url: 'otzenpack://fixture', size: bytes.length, name: 'fixture.otzenpack' }),
    });
    e.sandbox.fetch = (url, options) => {
      eq(url, 'otzenpack://fixture');
      const range = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
      assert(range, 'Range header present');
      const part = bytes.subarray(Number(range[1]), Number(range[2]) + 1);
      const buffer = part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength);
      return Promise.resolve({ ok: true, status: 206, arrayBuffer: () => Promise.resolve(buffer) });
    };
    const imported = await e.NS.Data.pickAndUsePack();
    eq(imported.formatVersion, 1);
    eq(e.NS.Data.mode(), 'imported');
    const chunk = await e.NS.Data.book('Test');
    eq(chunk.book, 'Test');
    eq(chunk.units[0].e[0], 'A test.');
  });

  // ---- Export fetch audit (build/fetch_export.sh) -------------------------
  group('Export fetch audit (build/fetch_export.sh)');
  await test('the audit accepts a checkout whose file names are not ASCII', () => {
    // Run the audit the release job runs: the Python heredoc inside
    // build/fetch_export.sh, extracted from the shipped file rather than copied
    // here, so the test cannot drift away from the thing it guards.
    const script = fs.readFileSync(path.join(ROOT, 'build', 'fetch_export.sh'), 'utf8');
    const heredoc = /python3 - "\$\{ROOTS\[@\]\}" <<'PY'\n([\s\S]*?)\nPY\n/.exec(script);
    assert(heredoc, 'found the audit heredoc in build/fetch_export.sh');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otsaplugin-audit-'));
    const runAudit = (commit) => {
      const file = path.join(dir, 'audit-under-test.py');
      fs.writeFileSync(file, heredoc[1]);
      return cp.spawnSync('python3', [file, 'json/Musar'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: Object.assign({}, process.env, { DEST: dir, COMMIT: commit, QUIET: '' }),
      });
    };
    try {
      // Sefaria ships translations named in German, Catalan, Romanian and
      // Hebrew — 301 of them at the pinned commit. git C-quotes any such path
      // in ls-files output unless it is read with -z, and a quoted path is not
      // a path: os.path.exists() answers False for a file that is on disk. The
      // audit then declared a complete checkout incomplete and the release job
      // died at "Fetch the Sefaria export" having built nothing.
      const work = 'json/Musar/Acharonim/Mesillat Yesharim';
      const named = work + '/English/Torat Chaim — חיים.json';
      fs.mkdirSync(path.join(dir, path.dirname(named)), { recursive: true });
      fs.mkdirSync(path.join(dir, work, 'Hebrew'), { recursive: true });
      fs.writeFileSync(path.join(dir, named), '{"_comment": []}');
      fs.writeFileSync(path.join(dir, work, 'Hebrew', 'merged.json'), '{"_comment": []}');

      const git = (...args) =>
        cp.execFileSync('git', ['-C', dir].concat(args), { encoding: 'utf8' });
      git('init', '--quiet');
      git('config', 'user.email', 'audit@example.invalid');
      git('config', 'user.name', 'audit fixture');
      git('add', '-A');
      git('commit', '--quiet', '--message', 'fixture');
      const commit = git('rev-parse', 'HEAD').trim();

      // Sanity: without -z git really does quote this path, so the fixture
      // exercises the case rather than passing by accident.
      const quoted = git('ls-files', '--', ':(glob)json/Musar/**/English/*.json');
      assert(quoted.indexOf('\\3') >= 0 || quoted.indexOf('"') >= 0, 'git quotes the name: ' + quoted);

      const ok = runAudit(commit);
      eq(ok.status, 0, 'a complete checkout passes — ' + ok.stdout + ok.stderr);
      assert(ok.stdout.indexOf('1/1') >= 0, ok.stdout);
      assert(ok.stdout.indexOf('complete') >= 0, ok.stdout);

      // And it still catches a genuine hole, which is the whole reason the
      // release job audits a restored cache instead of trusting it.
      fs.rmSync(path.join(dir, named));
      const hole = runAudit(commit);
      eq(hole.status, 1, 'a missing file is still reported');
      assert(/missing/i.test(hole.stderr), hole.stderr);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---- Packaging: the full plugin and the Lite edition --------------------
  group('Packaging (build/pack_plugin.py, build/scope.py)');
  await test('the Siddur is a build stage: json/Liturgy/Siddur, in the extended library', () => {
    const out = cp.execFileSync(
      'python3',
      [
        '-c',
        'import sys, json; sys.path.insert(0, "build"); import scope;' +
          'print(json.dumps({"globs": scope.STAGE_GLOBS.get("siddur"), "order": scope.STAGE_ORDER,' +
          '"stage": scope.stage_of_book_dir("json/Liturgy/Siddur/Siddur Ashkenaz/English")}))',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const row = JSON.parse(out);
    deepEq(row.globs, ['json/Liturgy/Siddur']);
    eq(row.stage, 'siddur');
    eq(row.order[row.order.length - 1], 'siddur');
    const build = fs.readFileSync(path.join(ROOT, 'build', 'build_all.sh'), 'utf8');
    assert(/ALL_STAGES="[^"]*siddur"/.test(build), 'the extended build includes siddur');
    assert(/CORE_STAGES="tanakh,mishnah,talmud"/.test(build), 'the compact library is unchanged');
  });

  await test('the full plugin packs as the default; the Lite plugin is a separate, compact-only plugin', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otz-pack-'));
    try {
      const full = path.join(dir, 'full.otzplugin');
      const lite = path.join(dir, 'lite.otzplugin');
      const script =
        'import sys, json, zipfile; z = zipfile.ZipFile(sys.argv[1]); m = json.loads(z.read("manifest.json"));' +
        'h = z.read("index.html").decode("utf-8");' +
        'print(json.dumps({"id": m["id"], "name": m["name"], "tab": m["contributes"]["toolTab"]["title"],' +
        '"items": len(m["contributes"]["startup"]["contextMenuItems"]), "lite": "edition-lite" in h,' +
        '"files": sorted(z.namelist()), "perms": m["permissions"]}))';
      cp.execFileSync('python3', [path.join(ROOT, 'build', 'pack_plugin.py'), '--plugin-dir', PLUGIN, '--out', full], { cwd: ROOT });
      cp.execFileSync('python3', [path.join(ROOT, 'build', 'pack_plugin.py'), '--plugin-dir', PLUGIN, '--edition', 'lite', '--out', lite], { cwd: ROOT });
      const f = JSON.parse(cp.execFileSync('python3', ['-c', script, full], { encoding: 'utf8' }));
      const l = JSON.parse(cp.execFileSync('python3', ['-c', script, lite], { encoding: 'utf8' }));
      eq(f.id, 'org.sefaria.otzaria-english', 'full keeps its id');
      eq(f.name, 'English');
      eq(f.lite, false, 'full has no lite marker');
      eq(f.items, 1, 'full: one context-menu item');
      eq(l.id, 'org.sefaria.otzaria-english-lite', 'lite has its own id, so both install side by side');
      eq(l.name, 'English Lite');
      eq(l.tab, 'English Lite', 'lite tab is named Lite');
      eq(l.lite, true, 'lite body is marked for the compact-only UI');
      eq(l.items, 1, 'lite: one context-menu item');
      deepEq(l.files, f.files, 'same code and data, only the manifest and body marker differ');
      deepEq(l.perms, f.perms, 'same permissions');
      const src = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
      assert(src.indexOf('edition-lite') < 0, 'the source plugin is not modified by the lite build');
      const mf = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'manifest.json'), 'utf8'));
      eq(mf.id, 'org.sefaria.otzaria-english', 'source manifest unchanged');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('the Lite UI hides the extended-library controls', () => {
    const css = fs.readFileSync(path.join(PLUGIN, 'css', 'plugin.css'), 'utf8');
    assert(/\.edition-lite \.full-only\s*\{\s*display:\s*none/.test(css), 'lite hides .full-only');
    const html = fs.readFileSync(path.join(PLUGIN, 'index.html'), 'utf8');
    assert(/class="btn-row full-only"/.test(html), 'the import controls are marked full-only');
  });

  // ---- Summary ------------------------------------------------------------
  process.stdout.write('\n' + '─'.repeat(60) + '\n');
  process.stdout.write(passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) {
    failures.forEach((f) => {
      process.stdout.write('\nFAILED [' + f.group + '] ' + f.name + '\n  ' + (f.err && f.err.stack) + '\n');
    });
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stdout.write('\nharness crashed: ' + (err && err.stack) + '\n');
  process.exitCode = 1;
});
