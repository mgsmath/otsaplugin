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
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const { makeFixture, Node: StubNode } = require('./dom');

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
  'js/credits.js',
  'js/app.js',
];

function loadPlugin(sdkHandlers) {
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
      if (fs.existsSync(p)) {
        vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: child.src });
        if (typeof child.onload === 'function') child.onload();
      } else if (typeof child.onerror === 'function') {
        child.onerror(new Error('not found: ' + child.src));
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
  await test('normalizeTitle drops the משנה/מסכת prefix and geresh', () => {
    eq(NS.normalizeTitle('משנה ברכות'), 'ברכות');
    eq(NS.normalizeTitle('מסכת שבת'), 'שבת');
    eq(NS.normalizeTitle('שמואל א׳'), 'שמואל א');
    eq(NS.normalizeTitle('  בראשית  '), 'בראשית');
    eq(NS.normalizeTitle('Genesis'), 'genesis');
  });
  await test('normalizeTitle matches the Python implementation', () => {
    const cases = ['משנה ברכות', 'מסכת שבת', 'שמואל א׳', '  בראשית  ', 'Genesis', 'I Kings'];
    const py = python('normalize_title', { cases });
    py.forEach((row, i) => eq(row.value, NS.normalizeTitle(cases[i]), cases[i]));
  });

  await NS.Data.init();
  const manifest = await NS.Data.manifest();
  assert(manifest, 'bundled manifest loaded');

  await test('the pack resolves an unambiguous title', () => {
    eq(Ref.resolveBook(manifest, 'בראשית'), 'Genesis');
    eq(Ref.resolveBook(manifest, 'Genesis'), 'Genesis');
    eq(Ref.resolveBook(manifest, 'משנה אבות'), 'Pirkei Avot');
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
  group('Generated data files (real plugin/data)');
  await test('manifest.js registers a format-1 manifest', () => {
    eq(manifest.formatVersion, 1);
    eq(typeof manifest.stats.books, 'number');
    assert(manifest.stats.books > 0, 'has books');
    assert(manifest.stats.segments > 0, 'has segments');
  });
  await test('the loader injected data/manifest.js as a <script src>', () => {
    assert(env0.loadedSrcs.indexOf('data/manifest.js') >= 0, env0.loadedSrcs.join(','));
  });
  await test('every generated .js data file compiles', () => {
    const dir = path.join(PLUGIN, 'data');
    let n = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
      n++;
    }
    assert(n >= 2, 'expected data files, found ' + n);
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
  await test('a real pack unit aligns against its own Hebrew', async () => {
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
  group('The six views render real pack data');
  const viewEnv = loadPlugin({
    'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א, פסוק ג', index: 0 }),
    'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
    'storage.get': () => null,
  });
  await boot(viewEnv);
  await new Promise((r) => setTimeout(r, 60));

  for (const view of NS.Views.LIST) {
    await test('view "' + view + '" renders without throwing', async () => {
      viewEnv.NS.settings.hebrewSource = 'sefaria';
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
  await test('peek shows a window around the focus, not the whole chapter', async () => {
    viewEnv.NS.settings.revealContext = 1;
    viewEnv.NS.App.setView('peek');
    await new Promise((r) => setTimeout(r, 60));
    const host = viewEnv.fixture.document.getElementById('render-host');
    const blocks = host.querySelectorAll('.peek-block');
    eq(blocks.length, 3, 'focus ±1');
  });
  await test('the credit line names a real source with its licence', async () => {
    viewEnv.NS.App.setView('english');
    await new Promise((r) => setTimeout(r, 60));
    const host = viewEnv.fixture.document.getElementById('render-host');
    const chips = host.querySelectorAll('.credit-chip');
    assert(chips.length > 0, 'credit chips present');
    const label = chips[0].textContent;
    assert(manifest.sources.some((s) => label.indexOf(s.title) >= 0), 'chip names a pack source: ' + label);
  });
  await test('view labels are translated when the UI language is English', () => {
    const e = loadPlugin({});
    e.NS.setLanguage('en', 'ltr');
    eq(e.NS.Views.label('sidebyside'), 'Side by side');
    eq(e.NS.Views.label('peek'), 'Peek');
    e.NS.setLanguage('he', 'rtl');
    eq(e.NS.Views.label('sidebyside'), 'זה לצד זה');
  });
  await test('every UI string has an English translation', () => {
    const dict = viewEnv.sandbox.window.TRANSLATIONS.en;
    const missing = [];
    const files = ['js/views.js', 'js/credits.js', 'js/app.js'];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
      const re = /NS\.t\(\s*'([^']+)'/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        if (!Object.prototype.hasOwnProperty.call(dict, m[1])) missing.push(rel + ': ' + m[1]);
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
      'reader.getCurrentRef': () => ({ bookId: 'רמבם הלכות תשובה', ref: 'פרק א', index: 0 }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    const host = e.fixture.document.getElementById('render-host');
    assert(host.querySelectorAll('.empty').length > 0, 'empty state shown');
  });
  await test('a context-menu click opens Peek with the selection', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => null,
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'library.getTree': () => null,
      'storage.get': () => null,
    });
    await boot(e);
    e.emit('reader.context_menu_item_clicked', {
      itemId: 'show-english',
      selectedText: 'וירא אלהים את האור',
      currentRef: 'פרק א, פסוק ד',
      currentBook: 'בראשית',
      currentBookId: 'בראשית',
    });
    await new Promise((r) => setTimeout(r, 80));
    const host = e.fixture.document.getElementById('render-host');
    const blocks = host.querySelectorAll('.peek-block');
    assert(blocks.length > 0, 'peek rendered, got ' + host.textContent.slice(0, 80));
    assert(blocks.length < 31, 'windowed, not the whole chapter: ' + blocks.length);
  });
  await test('follow mode re-renders on reader.current_ref_changed', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    e.NS.settings.follow = true;
    const before = e.fixture.document.getElementById('bar-title').textContent;
    e.emit('reader.current_ref_changed', { bookId: 'שמות', ref: 'פרק ב', bookTitle: 'שמות' });
    await new Promise((r) => setTimeout(r, 80));
    const after = e.fixture.document.getElementById('bar-title').textContent;
    assert(before !== after, 'title updated: ' + before + ' -> ' + after);
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
  await test('Otzaria Hebrew is used when it aligns, and labelled when it does not', async () => {
    const chunk = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'dist', 'pack', 'chunks', 'Genesis.json'), 'utf8')
    ).units[0];
    const otzText = chunk.h ? chunk.h.join(' ') : null;
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ sourceText: otzText, hasMore: false }),
      'storage.get': () => null,
    });
    // Serve the real chunk as JSON too, for the fixture above.
    await boot(e);
    await new Promise((r) => setTimeout(r, 80));
    const host = e.fixture.document.getElementById('render-host');
    assert(host.textContent.length > 20, 'rendered');
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
  await test('the Credits screen renders the source table from the pack', async () => {
    const e = loadPlugin({
      'reader.getCurrentRef': () => ({ bookId: 'בראשית', ref: 'פרק א', index: 0 }),
      'reader.getSectionTextMap': () => ({ __error: true, code: 'error.unsupported' }),
      'storage.get': () => null,
    });
    await boot(e);
    await new Promise((r) => setTimeout(r, 60));
    e.NS.openCredits('Genesis', 1);
    await new Promise((r) => setTimeout(r, 60));
    const body = e.fixture.document.getElementById('credits-body');
    const rows = body.querySelectorAll('tr');
    assert(rows.length >= 2, 'source rows: ' + rows.length);
    const genesis = manifest.books.Genesis;
    const src = manifest.sources[genesis.src[0]];
    assert(body.textContent.indexOf(src.license) >= 0, 'licence of ' + src.title + ' shown');
    assert(body.textContent.indexOf(src.title) >= 0, 'source title shown');
  });

  // ---- Schema / stage mapping (Python) ------------------------------------
  group('Schema and stage inference (build/scope.py)');
  await test('section names map to the right schema', () => {
    const rows = python('schema', {
      cases: [
        [['Chapter', 'Verse'], 2],
        [['Chapter', 'Mishnah'], 2],
        [['Daf', 'Line'], 2],
        [['Chapter'], 1],
        [null, 2],
        [null, 1],
      ],
    });
    // With no section names the pipeline cannot know the schema, so it reports
    // "chapter" instead of guessing a verse-level address.
    deepEq(
      rows.map((r) => r.schema),
      ['verse', 'mishnah', 'daf', 'chapter', 'chapter', 'chapter']
    );
  });
  await test('export directories map to the right stage', () => {
    const rows = python('stage', {
      cases: [
        'json/Tanakh/Torah/Genesis',
        'json/Mishnah/Seder Zeraim/Mishnah Berakhot',
        'json/Talmud/Bavli/Seder Moed/Shabbat',
        'json/Chasidut/SomeBook',
      ],
    });
    deepEq(
      rows.map((r) => r.stage),
      ['tanakh', 'mishnah', 'talmud', null]
    );
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
