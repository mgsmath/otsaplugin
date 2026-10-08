/* otsaplugin — fixed English UI labels.
 * Hebrew strings are internal keys only; the reader content keeps its original
 * language/direction independently of the plugin controls.
 */
(function () {
  'use strict';

  window.TRANSLATIONS = window.TRANSLATIONS || {};
  window.TRANSLATIONS.en = {
    'אין חיבור לאוצריא — התצוגה מוצגת ללא נתונים חיים.':
      'Otzaria is not connected. Open the plugin inside Otzaria to load translations.',
    'אין ספר פתוח בקורא. פתח ספר בקורא, או בחר „תרגום לאנגלית” בתפריט הקטע.':
      'No text is open in the reader. Open a text, or choose “Translate selected passage” from the reader menu.',
    'אין עמוד פתוח. לחץ על „עמוד חדש” או פתח ספר בקורא.':
      'No page is open. Choose “+ New page”, or open a text in the reader.',
    'אין תרגום אנגלי לספר זה בחבילה': 'No translation is available in the loaded library for this text.',
    'אין תרגום לקטע זה': 'No translation is available for this passage.',
    'אנגלית': 'English',
    'אנגלית בלבד': 'English only',
    'בחר קובץ נתונים של התוסף': 'Choose a translation data file',
    'בספר זה חסרים': 'This text is missing',
    'דף': 'Daf',
    'ההפניה': 'Reference',
    'הנתונים עדיין נטענים…': 'Loading translations…',
    'הספר המוצג': 'Current text',
    'הסתר תרגום': 'Hide translation',
    'העברית': 'Hebrew',
    'הערות': 'Notes',
    'הצג תרגום': 'Show translation',
    'הקטע שנבחר לא זוהה בוודאות — מוצג הקטע כולו':
      'The selection could not be matched exactly, so the whole section is shown.',
    'השם אינו חד-משמעי': 'Multiple matches',
    'זה לצד זה': 'Side by side',
    'חבילה מובנית': 'Built-in library',
    'חבילה מיובאת': 'Imported library',
    'טעינת הנתונים נכשלה': 'Could not load translation data',
    'טעינת קובץ הנתונים נכשלה': 'Could not load the selected data file',
    'חלק מהשורות ללא תרגום': 'Some passages have no available English translation.',
    'נסה לטעון ספריית תרגום מורחבת בהגדרות.': 'Try loading the extended translation library in Settings.',
    'קטעים ללא תרגום': 'passages without translation',
    'יש כמה ספרים בשם זה. בחר לאיזה מהם להציג תרגום — התוסף לא מנחש.':
      'Several texts share this title. Choose the correct one; the plugin will not guess.',
    'לא הצלחתי לזהות את המיקום': 'Could not identify this location',
    'לא התקבל שם ספר מהקורא.': 'The reader did not provide a text title.',
    'לא פוענחה. כדי לא להציג פסוק שגוי, התוסף אינו מנחש מיקום.':
      'could not be read. The plugin will not guess and risk showing the wrong passage.',
    'לחיצה לחשיפה': 'Tap to reveal',
    'לקטע זה אין תרגום ברשיון מתאים בחבילה.': 'No translation is available for this passage.',
    'לקטע זה אין תרגום ברשיון מתאים עבור חלק מהשורות':
      'No English translation is available for some lines in this section.',
    'מה כן יש בחבילה?': 'Browse available texts',
    'משולב': 'Interleaved',
    'סימן': 'Siman',
    'ספרים': 'texts',
    'עברית': 'Hebrew',
    'עוקב אחרי הקורא: פעיל': 'Following reader',
    'עקוב אחרי הקורא': 'Follow reader',
    'פרק': 'Chapter',
    'קטעים': 'passages',
    'רצף': 'Flowing',
    'שגיאה בטעינה': 'Loading error',
    'תכולת החבילה': 'Available texts',
    'תצוגה לא מוכרת': 'Unknown view',
    'הקורא משמאל והאנגלית מימין': 'Reader on the left, English on the right',
    'פיצול': 'Split',
    'סגור עמוד': 'Close page',
    'עמוד חדש': 'New page',
    'פתח עמוד חדש במיקום הנוכחי של הקורא': 'Open a new page at the reader’s current location',
  };
})();
