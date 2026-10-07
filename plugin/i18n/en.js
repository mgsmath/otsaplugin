/* otsaplugin — English UI strings.
 *
 * The source language of the UI is Hebrew (Otzaria is a Hebrew-first app), so
 * `OtzEn.t()` takes the Hebrew string as the key and falls back to it when no
 * translation exists. This file is the only translation table.
 */
(function () {
  'use strict';

  window.TRANSLATIONS = window.TRANSLATIONS || {};

  window.TRANSLATIONS.en = {
    'אין חיבור לאוצריא — התצוגה מוצגת ללא נתונים חיים.':
      'Not connected to Otzaria — showing the UI without live data.',
    'אין ספר פתוח בקורא. בחר קטע בטקסט ובחר „תרגום לאנגלית” בתפריט, או פתח ספר בקורא.':
      'No book is open in the reader. Select a passage and choose “English translation” from the menu, or open a book in the reader.',
    'אין תרגום אנגלי לספר זה בחבילה': 'This pack has no English translation for this book',
    'אין תרגום זמין לקטע זה': 'No translation available for this passage',
    'אין תרגום לקטע זה': 'No translation for this passage',
    'אנגלית': 'English',
    'אנגלית בלבד': 'English only',
    'בחר קובץ נתונים של התוסף': 'Choose a plugin data file',
    'בספר זה חסרים': 'This book is missing',
    'גרסה': 'Version',
    'דף': 'Daf',
    'ההפניה': 'The reference',
    'היישור בין השורות אינו ודאי — העברית מוצגת ברמת הקטע':
      'Line alignment is not certain — Hebrew is shown at section level',
    'היישור בין השורות אינו ודאי — העברית מספריא, מנורמלת':
      'Line alignment is not certain — Hebrew is Sefaria’s, normalised',
    'היישור בין השורות אינו ודאי — מוצג ברמת הקטע כולו':
      'Line alignment is not certain — shown for the whole section',
    'הנתונים עדיין נטענים…': 'Still loading the data…',
    'הספר המוצג': 'Current book',
    'הסתר תרגום': 'Hide translation',
    'העברית': 'Hebrew',
    'העברית המוצגת היא של ספריא (מנורמלת), לא הטקסט של אוצריא':
      'The Hebrew shown is Sefaria’s normalised text, not Otzaria’s own',
    'הערות': 'Notes',
    'הצג תרגום': 'Show translation',
    'הצצה': 'Peek',
    'הקטע שנבחר לא זוהה בוודאות — מוצג הקטע כולו':
      'The selection could not be identified with certainty — showing the whole section',
    'השם אינו חד-משמעי': 'This name is ambiguous',
    'זה לצד זה': 'Side by side',
    'חבילה זו כוללת תרגומים ברשיון CC BY-NC — שימוש אישי בלבד, אין לעשות בה שימוש מסחרי.':
      'This pack contains CC BY-NC translations — personal use only, no commercial use.',
    'חבילה מובנית': 'Bundled pack',
    'חבילה מיובאת': 'Imported pack',
    'חובות לפי סוג רשיון': 'Obligations by licence type',
    'טעינת הנתונים נכשלה': 'Loading the data failed',
    'טעינת קובץ הנתונים נכשלה': 'Loading the data file failed',
    'יש כמה ספרים בשם זה. בחר לאיזה מהם להציג תרגום — התוסף לא מנחש.':
      'Several books share this name. Choose which one to translate — the plugin does not guess.',
    'לא הצלחתי לזהות את המיקום': 'Could not identify the location',
    'לא התקבל שם ספר מהקורא.': 'The reader did not provide a book name.',
    'לא פוענחה. כדי לא להציג פסוק שגוי, התוסף אינו מנחש מיקום.':
      'could not be parsed. Rather than show the wrong verse, the plugin does not guess a location.',
    'לחיצה לחשיפה': 'Tap to reveal',
    'לקטע זה אין תרגום ברשיון מתאים בחבילה.':
      'This passage has no translation under a redistributable licence in the pack.',
    'לקטע זה אין תרגום ברשיון מתאים עבור חלק מהשורות':
      'Some lines of this passage have no translation under a redistributable licence',
    'מדיניות רשיונות': 'Licence policy',
    'מה כן יש בחבילה?': 'What is in the pack?',
    'מקור': 'Source',
    'מקור הנתונים': 'Data source',
    'משולב': 'Interleaved',
    'ספריא': 'Sefaria',
    'ספרים': 'books',
    'עברית': 'Hebrew',
    'עוקב אחרי הקורא: פעיל': 'Following the reader: on',
    'עקוב אחרי הקורא': 'Follow the reader',
    'פרטים ורשיונות': 'Details and licences',
    'פרק': 'Chapter',
    'קומיט': 'commit',
    'קטעים': 'segments',
    'קטעים ללא תרגום ברשיון מתאים': 'segments with no translation under a redistributable licence',
    'קרדיטים ורשיונות': 'Credits and licences',
    'רצף': 'Flowing',
    'רשיון': 'Licence',
    'שגיאה בטעינה': 'Loading error',
    'תאריך בנייה': 'Built',
    'תכולת החבילה': 'Pack contents',
    'תצוגה לא מוכרת': 'Unknown view',
    'העברית המוצגת מגיעה מאוצריא. כשהיישור אינו ודאי מוצגת העברית המנורמלת של ספריא, והדבר מצוין במפורש.':
      'The Hebrew shown comes from Otzaria. Where the alignment is not certain, Sefaria’s normalised Hebrew is shown instead, and that is stated explicitly.',
    'החבילה כוללת רק תרגומים ברשיון המאפשר הפצה. ייתכן שלספר זה אין תרגום כזה בספריא.':
      'The pack only contains translations whose licence allows redistribution. This book may simply have no such translation on Sefaria.',
  };
})();
