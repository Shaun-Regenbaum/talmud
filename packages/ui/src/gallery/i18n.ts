const catalog = {
  title: { en: 'Reader components', he: 'רכיבי הקורא' },
  intro: {
    en: 'One library for Talmud and Tanach. Try the controls, switch languages, and see the styles both readers share.',
    he: 'ספרייה אחת לתלמוד ולתנ״ך. נסו את הפקדים, החליפו שפה וראו את העיצוב המשותף לשני הקוראים.',
  },
  desktop: { en: 'Desktop', he: 'מחשב' },
  mobile: { en: 'Phone', he: 'טלפון' },
  phoneTitle: { en: 'Try it on a phone', he: 'נסו בתצוגת טלפון' },
  phoneHint: {
    en: 'Scroll inside the phone. Open menus and drawers, tap the controls, and switch to Hebrew.',
    he: 'גללו בתוך הטלפון. פתחו תפריטים וחלוניות, נסו את הפקדים והחליפו לעברית.',
  },
  phoneWidth: { en: 'Phone width', he: 'רוחב הטלפון' },
  smallPhone: { en: 'Small · 320 px', he: 'קטן · 320 פיקסלים' },
  standardPhone: { en: 'Standard · 390 px', he: 'רגיל · 390 פיקסלים' },
  largePhone: { en: 'Large · 430 px', he: 'גדול · 430 פיקסלים' },
  phoneFrame: { en: 'Interactive phone preview', he: 'תצוגת טלפון פעילה' },
  fullPage: { en: 'Open full page', he: 'פתיחת עמוד מלא' },
  phoneDetail: {
    en: 'This is the actual gallery at a phone width. Menus and drawers stay inside the phone, just as they do on a small screen.',
    he: 'זו הספרייה עצמה ברוחב של טלפון. התפריטים והחלוניות נשארים בתוך הטלפון, כמו במסך קטן.',
  },
  paletteNote: {
    en: 'Talmud maroon on warm paper. Both readers use the same colors.',
    he: 'בורדו תלמוד על רקע נייר חמים. שני הקוראים משתמשים באותם צבעים.',
  },
  contents: { en: 'In this library', he: 'בספרייה' },
  headers: { en: 'Reader header', he: 'סרגל הקורא' },
  headersHint: {
    en: 'The same layout in both readers. Here, the picker and arrows move between sections of this library.',
    he: 'אותו מבנה בשני הקוראים. כאן, הרשימה והחצים עוברים בין חלקי הספרייה.',
  },
  buttons: { en: 'Buttons & choices', he: 'כפתורים ובחירה' },
  buttonsHint: {
    en: 'One shape and size. Maroon marks the main action or the current choice.',
    he: 'צורה וגודל משותפים. בורדו מסמן את הפעולה הראשית או את הבחירה הנוכחית.',
  },
  navigation: { en: 'Navigation', he: 'ניווט' },
  navigationHint: {
    en: 'Native controls, visible focus, and the same spacing in both languages.',
    he: 'פקדים רגילים, סימון מיקוד גלוי וריווח זהה בשתי השפות.',
  },
  panels: { en: 'Menus & panels', he: 'תפריטים וחלוניות' },
  panelsHint: {
    en: 'Secondary actions live in a menu. Longer explanations open in a drawer.',
    he: 'פעולות נוספות נמצאות בתפריט. הסברים ארוכים נפתחים בחלונית צד.',
  },
  text: { en: 'Reading text', he: 'טקסט לקריאה' },
  textHint: {
    en: 'The controls share a font. Each reader keeps its own Hebrew reading font.',
    he: 'הפקדים משתמשים בגופן משותף. כל קורא שומר על הגופן העברי שלו לקריאה.',
  },
  theme: { en: 'Shared colors', he: 'צבעים משותפים' },
  themeHint: {
    en: 'These swatches read the actual theme values. A change here in the library reaches both apps.',
    he: 'דוגמאות הצבע מציגות את ערכי העיצוב בפועל. שינוי בספרייה המשותפת משפיע על שני היישומים.',
  },
  source: { en: 'Source', he: 'קוד מקור' },
  primary: { en: 'Primary action', he: 'פעולה ראשית' },
  secondary: { en: 'Secondary action', he: 'פעולה נוספת' },
  toggle: { en: 'Toggle', he: 'בחירה' },
  disabled: { en: 'Disabled', he: 'לא זמין' },
  openDrawer: { en: 'Open drawer', he: 'פתיחת חלונית' },
  top: { en: 'Back to top', he: 'חזרה למעלה' },
  selected: { en: 'Selected', he: 'נבחר' },
  unselected: { en: 'Not selected', he: 'לא נבחר' },
  section: { en: 'Section', he: 'חלק' },
  previous: { en: 'Previous section', he: 'החלק הקודם' },
  next: { en: 'Next section', he: 'החלק הבא' },
  more: { en: 'More', he: 'עוד' },
  openReader: { en: 'Open reader', he: 'פתיחת הקורא' },
  drawerTitle: { en: 'The shared drawer', he: 'חלונית הצד המשותפת' },
  drawerBody: {
    en: 'This is the same Drawer component used for chapter notes and commentary. It keeps a title and close button above a scrollable reading area.',
    he: 'זהו אותו רכיב חלונית צד המשמש להערות לפרק ולפירושים. הכותרת וכפתור הסגירה נשארים מעל אזור קריאה נגלל.',
  },
  drawerDetail: {
    en: 'The app supplies the text. The library supplies the panel, border, spacing and reading styles.',
    he: 'היישום מספק את הטקסט. הספרייה מספקת את החלונית, המסגרת, הריווח וסגנון הקריאה.',
  },
  proseEn: {
    en: 'English reading text uses Spectral. Controls use a plain sans-serif font, so actions stay separate from the words you are studying.',
    he: 'טקסט לקריאה באנגלית משתמש בגופן Spectral. הפקדים משתמשים בגופן פשוט, כך שקל להבחין בין הפעולות לבין הטקסט הנלמד.',
  },
  proseHe: {
    en: 'Hebrew reading text keeps the typeface of each reader.',
    he: 'הטקסט העברי שומר על הגופן של כל קורא. הכפתורים, המרווחים והצבעים משותפים לתלמוד ולתנ״ך.',
  },
  english: { en: 'English prose', he: 'טקסט באנגלית' },
  talmud: { en: 'Talmud', he: 'תלמוד' },
  tanach: { en: 'Tanach', he: 'תנ״ך' },
  paper: { en: 'Page', he: 'עמוד' },
  surface: { en: 'Control surface', he: 'רקע פקדים' },
  sunk: { en: 'Quiet background', he: 'רקע משני' },
  ink: { en: 'Text', he: 'טקסט' },
  muted: { en: 'Secondary text', he: 'טקסט משני' },
  line: { en: 'Border', he: 'מסגרת' },
  accent: { en: 'Accent', he: 'צבע ראשי' },
  strong: { en: 'Accent hover', he: 'צבע בריחוף' },
  libraryNote: {
    en: 'Live components from packages/ui. No backend or generation service is needed.',
    he: 'רכיבים פעילים מתוך packages/ui. אין צורך בשרת או בשירות יצירת תוכן.',
  },
} as const;
export type GalleryKey = keyof typeof catalog;
export type GalleryLang = 'en' | 'he';
export function t(key: GalleryKey, lang: GalleryLang): string {
  return catalog[key][lang];
}
