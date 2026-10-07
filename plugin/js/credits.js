/* otsaplugin — Credits and Licenses screen.
 *
 * Always reachable, independent of the "show credit line" option. Shows where
 * every English segment in the pack came from, the licence of each source
 * version, and what each licence obliges you to do.
 */
(function () {
  'use strict';

  var NS = (window.OtzEn = window.OtzEn || {});

  var LICENCE_OBLIGATIONS = {
    pd: {
      label: 'Public Domain',
      text: 'אין מגבלות ידועות. הטקסט אינו מוגן בזכויות יוצרים.',
      en: 'No known restrictions. The text is not under copyright.',
    },
    by: {
      label: 'CC BY',
      text: 'חובה לציין את שם היוצר, קישור לרשיון, וכל שינוי שנעשה. מותר שימוש מסחרי.',
      en: 'Attribution required: credit the author, link the licence, note changes. Commercial use allowed.',
    },
    'by-sa': {
      label: 'CC BY-SA',
      text: 'כמו CC BY, ובנוסף כל יצירה נגזרת חייבת להתפרסם באותו רשיון (ShareAlike).',
      en: 'As CC BY, plus derivatives must be released under the same licence (ShareAlike).',
    },
    'by-nc': {
      label: 'CC BY-NC',
      text: 'כמו CC BY, אך אסור שימוש מסחרי. חבילות שכוללות מקורות כאלה מיועדות לשימוש אישי בלבד.',
      en: 'As CC BY, but non-commercial only. Packs containing these sources are for personal use only.',
    },
    unknown: {
      label: 'Unknown',
      text: 'רשיון לא ידוע — מקורות כאלה אינם נכללים בחבילה כלל.',
      en: 'Licence unknown — such sources are never included in the pack.',
    },
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.appendChild(document.createTextNode(text));
    return node;
  }

  function obligation(family) {
    var o = LICENCE_OBLIGATIONS[family] || LICENCE_OBLIGATIONS.unknown;
    return NS.lang === 'en' ? o.en : o.text;
  }

  NS.openCredits = function (bookKey, unitAddress) {
    NS.Data.manifest().then(function (manifest) {
      if (!manifest) return;
      render(manifest, bookKey || null, unitAddress);
      NS.showPanel('credits');
    });
  };

  function render(manifest, bookKey, unitAddress) {
    var host = document.getElementById('credits-body');
    if (!host) return;
    host.textContent = '';

    var head = el('div', 'credits-head');
    head.appendChild(el('h2', null, NS.t('קרדיטים ורשיונות')));
    var meta = el('div', 'credits-meta');
    meta.appendChild(
      el(
        'div',
        'meta-row',
        NS.t('מקור הנתונים') + ': Sefaria-Export · ' + NS.t('קומיט') + ' ' + (manifest.sefaria.commit || '—')
      )
    );
    meta.appendChild(el('div', 'meta-row', NS.t('תאריך בנייה') + ': ' + (manifest.sefaria.builtAt || '—')));
    meta.appendChild(
      el(
        'div',
        'meta-row',
        NS.t('מדיניות רשיונות') + ': ' + (manifest.policy === 'include-nc' ? 'include-nc' : 'open')
      )
    );
    meta.appendChild(
      el('div', 'meta-row', NS.t('ספרים') + ': ' + manifest.stats.books + ' · ' + NS.t('קטעים') + ': ' + manifest.stats.segments)
    );
    head.appendChild(meta);
    host.appendChild(head);

    if (manifest.policy === 'include-nc') {
      var warn = el('div', 'notice warn');
      warn.appendChild(
        document.createTextNode(
          NS.t('חבילה זו כוללת תרגומים ברשיון CC BY-NC — שימוש אישי בלבד, אין לעשות בה שימוש מסחרי.')
        )
      );
      host.appendChild(warn);
    }

    // Which sources are relevant right now.
    var relevant = null;
    if (bookKey && manifest.books[bookKey]) {
      relevant = {};
      var ids = manifest.books[bookKey].src || [];
      for (var i = 0; i < ids.length; i++) relevant[ids[i]] = 1;
      host.appendChild(
        el('h3', null, NS.t('הספר המוצג') + ': ' + (manifest.books[bookKey].he || bookKey))
      );
      if (unitAddress) {
        host.appendChild(el('div', 'meta-row', NS.Views.unitLabel(manifest.books[bookKey], { a: [unitAddress] })));
      }
    }

    var byFamily = {};
    var table = el('table', 'src-table');
    var thead = el('thead');
    var hrow = el('tr');
    [NS.t('גרסה'), NS.t('רשיון'), NS.t('קטעים'), NS.t('ספרים'), NS.t('מקור')].forEach(function (h) {
      hrow.appendChild(el('th', null, h));
    });
    thead.appendChild(hrow);
    table.appendChild(thead);
    var tbody = el('tbody');

    var sources = manifest.sources.slice().sort(function (a, b) {
      return b.segments - a.segments;
    });
    for (var s = 0; s < sources.length; s++) {
      var src = sources[s];
      if (relevant && !relevant[src.id]) continue;
      byFamily[src.licenseFamily] = (byFamily[src.licenseFamily] || 0) + src.segments;
      var row = el('tr');
      row.appendChild(el('td', null, src.title));
      var lic = el('td');
      lic.appendChild(el('span', 'credit-lic', src.license));
      row.appendChild(lic);
      row.appendChild(el('td', 'num', String(src.segments)));
      row.appendChild(el('td', 'num', String(src.books)));
      var linkTd = el('td');
      if (src.url) {
        var a = el('a', null, src.url);
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        // window.open is disabled in the plugin WebView; route external links
        // through the host so the click actually does something.
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          var href = this.getAttribute('href');
          window.Otzaria.call('app.openUrl', { url: href })['catch'](function () {});
        });
        linkTd.appendChild(a);
      } else {
        linkTd.appendChild(document.createTextNode('—'));
      }
      row.appendChild(linkTd);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    host.appendChild(table);

    host.appendChild(el('h3', null, NS.t('חובות לפי סוג רשיון')));
    var fam = el('dl', 'licence-list');
    Object.keys(byFamily).forEach(function (key) {
      fam.appendChild(el('dt', null, (LICENCE_OBLIGATIONS[key] || {}).label + ' — ' + byFamily[key] + ' ' + NS.t('קטעים')));
      fam.appendChild(el('dd', null, obligation(key)));
    });
    host.appendChild(fam);

    host.appendChild(el('h3', null, NS.t('העברית')));
    var heNote = el('p', 'note');
    heNote.appendChild(
      document.createTextNode(
        NS.t(
          'העברית המוצגת מגיעה מאוצריא. כשהיישור אינו ודאי מוצגת העברית המנורמלת של ספריא, והדבר מצוין במפורש.'
        )
      )
    );
    host.appendChild(heNote);
  }
})();
