/* otsaplugin — offline data delivery.
 *
 * Two delivery paths, same in-memory shape:
 *
 *  1. BUNDLED (default). The pack ships inside the .otzplugin as
 *     `data/manifest.js` + `data/chunk-<key>.js`, each a classic script that
 *     calls `window.__OTZ_EN.manifest(...)` / `.chunk(key, ...)`. They are
 *     injected with dynamically created <script> tags, NOT fetched: the plugin
 *     page runs from a `file://` origin on Windows/Linux/Android with
 *     `allowFileAccessFromFileURLs = false`, so `fetch()` of a sibling file is
 *     blocked by Chromium. <script src> is a plain subresource load and works on
 *     every platform. (On macOS the page is served from `otzaria-plugin://`,
 *     where fetch would also work — but the <script> path is the one that works
 *     everywhere, so it is the only one used.)
 *
 *  2. IMPORTED (optional, needs `fs.user_files.read`). A single `.otzenpack`
 *     file the user picks with `fs.pickUserFile`. Otzaria serves it from its
 *     internal loopback file server with full `Range` support and CORS headers
 *     that reflect `Origin: null`, so we read exactly the bytes we need. Used
 *     for the large (full-Talmud) builds where a 10+ MB script per work would
 *     be wasteful. No network permission is involved.
 *
 * `.otzenpack` layout (all UTF-8 JSON, no compression so no decoder is needed):
 *
 *     [ manifest JSON ][ \n ][ chunk JSON ]...[ \n ][ index JSON ][ 12 ASCII digits ]
 *
 * The trailing 12 digits are the zero-padded byte length of the index. Read the
 * last 12 bytes, then the index, then Range-read manifest/chunks on demand.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});
  var Data = (NS.Data = {});

  var sink = { manifest: null, chunks: {} };
  window.__OTZ_EN = {
    manifest: function (m) {
      sink.manifest = m;
    },
    chunk: function (key, payload) {
      sink.chunks[key] = payload;
    },
  };

  var manifestPromise = null;
  var chunkPromises = {};
  var remote = null; // { url, size } when an imported pack is active

  Data.mode = function () {
    return remote ? 'imported' : 'bundled';
  };
  Data.manifest = function () {
    return manifestPromise ? manifestPromise.then(function () { return sink.manifest; }) : Promise.resolve(sink.manifest);
  };
  Data.remoteInfo = function () {
    return remote;
  };

  // ---- bundled path -------------------------------------------------------

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.onload = function () {
        resolve();
      };
      el.onerror = function () {
        reject(new Error('failed to load ' + src));
      };
      document.head.appendChild(el);
    });
  }

  function loadBundled() {
    return injectScript('data/manifest.js').then(function () {
      if (!sink.manifest) throw new Error('data/manifest.js loaded but registered no manifest');
      return sink.manifest;
    });
  }

  function loadBundledChunk(key) {
    if (sink.chunks[key]) return Promise.resolve(sink.chunks[key]);
    return injectScript('data/chunk-' + encodeURIComponent(key) + '.js').then(function () {
      var chunk = sink.chunks[key];
      if (!chunk) throw new Error('chunk registered nothing: ' + key);
      return chunk;
    });
  }

  // ---- imported pack path -------------------------------------------------

  var FOOTER_LEN = 12;

  function rangeFetch(url, start, end) {
    return fetch(url, { headers: { Range: 'bytes=' + start + '-' + end } }).then(function (res) {
      if (!res.ok && res.status !== 206) throw new Error('range fetch failed: ' + res.status);
      return res.arrayBuffer().then(function (buf) {
        return new TextDecoder('utf-8').decode(new Uint8Array(buf));
      });
    });
  }

  function openImported(token) {
    return window.Otzaria.call('fs.resolveFileUrl', { token: token }).then(function (res) {
      var info = NS.unwrap(res, 'fs.resolveFileUrl');
      if (!info || !info.url) throw new Error('no url for token');
      remote = { url: info.url, size: Number(info.size) || 0, name: info.name || '' };
      return rangeFetch(remote.url, remote.size - FOOTER_LEN, remote.size - 1).then(function (tail) {
        var len = parseInt(tail.trim(), 10);
        if (!len || len <= 0 || len > remote.size - FOOTER_LEN) throw new Error('bad .otzenpack footer');
        return rangeFetch(remote.url, remote.size - FOOTER_LEN - len, remote.size - FOOTER_LEN - 1);
      }).then(function (indexJson) {
        remote.index = JSON.parse(indexJson);
        return remote.index;
      });
    });
  }

  function loadRemoteRange(entry) {
    return rangeFetch(remote.url, entry.offset, entry.offset + entry.length - 1).then(function (text) {
      return JSON.parse(text);
    });
  }

  function loadImported() {
    return openImported(NS.settings.importToken).then(function (index) {
      if (!index.manifest) throw new Error('.otzenpack has no manifest entry');
      return loadRemoteRange(index.manifest).then(function (m) {
        sink.manifest = m;
        return m;
      });
    });
  }

  function loadImportedChunk(key) {
    var entry = remote.index.chunks && remote.index.chunks[key];
    if (!entry) return Promise.reject(new Error('unknown chunk ' + key));
    return loadRemoteRange(entry).then(function (payload) {
      sink.chunks[key] = payload;
      return payload;
    });
  }

  // ---- public API ---------------------------------------------------------

  Data.init = function () {
    if (manifestPromise) return manifestPromise;
    var useImported = NS.settings.dataSource === 'imported' && NS.settings.importToken;
    manifestPromise = (useImported ? loadImported() : loadBundled()).then(
      function (m) {
        if (!m || m.formatVersion !== NS.PACK_FORMAT_VERSION) {
          throw new Error('unsupported pack format ' + (m && m.formatVersion));
        }
        return m;
      },
      function (err) {
        // A broken imported pack must not leave the plugin unusable: fall back
        // to the bundled pack and tell the caller which one it got.
        if (useImported) {
          NS.log('imported pack failed, falling back to bundled', err && err.message);
          remote = null;
          manifestPromise = null;
          return Data.init();
        }
        throw err;
      }
    );
    return manifestPromise;
  };

  Data.book = function (key) {
    if (chunkPromises[key]) return chunkPromises[key];
    chunkPromises[key] = (remote ? loadImportedChunk(key) : loadBundledChunk(key))['catch'](
      function (err) {
        delete chunkPromises[key];
        throw err;
      }
    );
    return chunkPromises[key];
  };

  Data.pickAndUsePack = function () {
    return window.Otzaria.call('fs.pickUserFile', {
      title: NS.t('בחר קובץ נתונים של התוסף'),
      extensions: ['otzenpack'],
      access: 'read',
    }).then(function (res) {
      var info = NS.unwrap(res, 'fs.pickUserFile');
      if (!info || info.cancelled) return null;
      NS.settings.importToken = info.token;
      NS.settings.dataSource = 'imported';
      NS.saveSettings();
      manifestPromise = null;
      chunkPromises = {};
      sink.manifest = null;
      sink.chunks = {};
      remote = null;
      return Data.init();
    });
  };

  Data.useBundled = function () {
    NS.settings.dataSource = 'bundled';
    NS.saveSettings();
    manifestPromise = null;
    chunkPromises = {};
    sink.manifest = null;
    sink.chunks = {};
    remote = null;
    return Data.init();
  };
})();
