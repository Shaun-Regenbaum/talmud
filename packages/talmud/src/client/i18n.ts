/**
 * App language state — a single module-level signal so any of the hash-routed
 * pages can read/set it without a shared context provider. Two things hang off
 * it:
 *
 *   1. Enrichment generation language. Every /api/run (and /api/qa/ask)
 *      caller threads lang() into the request body; the worker selects the
 *      Hebrew prompt variant and a `:he`-namespaced cache key (see
 *      src/worker/cache-keys.ts + code-marks.ts *_HE prompts).
 *   2. UI chrome direction + the t() string catalog (below). On 'he' the
 *      document goes dir=rtl; the Vilna daf is already internally RTL so only
 *      the surrounding chrome flips.
 *
 * Switching language clears the client-side enrichment result cache (via the
 * existing `marks-runs-invalidate` event) so cards re-fetch under the new
 * lang's cache key instead of showing the previous language's text.
 */
import { createSignal } from 'solid-js';

export type Lang = 'en' | 'he';

const STORAGE_KEY = 'talmud:lang';

// Language resolution order: an explicit `?lang=` in the URL wins (so a shared
// link presets the language regardless of the recipient's history), then the
// per-browser localStorage preference, then English.
function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const urlLang = new URLSearchParams(window.location.search).get('lang');
  if (urlLang === 'he' || urlLang === 'en') {
    // Make the shared link's choice sticky for this browser too.
    try {
      window.localStorage.setItem(STORAGE_KEY, urlLang);
    } catch {
      /* ignore */
    }
    return urlLang;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'he' ? 'he' : 'en';
}

const [lang, setLangSignal] = createSignal<Lang>(initialLang());

export { lang };

/** Reflect the active language onto <html lang dir>. he → rtl. */
function applyToDocument(l: Lang): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = l;
  root.dir = l === 'he' ? 'rtl' : 'ltr';
}

/** Keep `?lang=` in the address bar in sync with the active language (without a
 *  history entry), so the URL the user copies always carries the language. */
function applyLangToUrl(l: Lang): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('lang') === l) return;
    url.searchParams.set('lang', l);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* non-browser / malformed URL — localStorage still carries it */
  }
}

// Apply once at module load so the very first paint has the right dir, and the
// URL reflects the active language even before the user touches the switch.
applyToDocument(lang());
applyLangToUrl(lang());

export function setLang(next: Lang): void {
  if (next === lang()) return;
  setLangSignal(next);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  applyToDocument(next);
  applyLangToUrl(next);
  // Drop cached enrichment runs so cards re-fetch under the new lang's cache
  // key. clearRunResultCache() + MarksRegistryPanel listen for this event; the
  // per-lang stamps (MarkEnrichmentCards / MarksRegistryPanel) then re-fire.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('marks-runs-invalidate'));
  }
}

export function toggleLang(): void {
  setLang(lang() === 'en' ? 'he' : 'en');
}

// ===========================================================================
// UI string catalog — t(key, params?)
// ---------------------------------------------------------------------------
// One flat dictionary of EN/HE strings keyed by dot-namespaced ids. t() reads
// the lang() signal, so any t() call inside a JSX/createMemo tracking scope
// updates live when the language flips. Interpolate with {name} placeholders
// and a params object: t('argument.loading', { title }).
//
// NOTE (Hebrew under review): domain terms (esp. the argument taxonomy —
// voices/moves/roles/relations) are first-draft translations. Tweak the `he`
// values here in one place; nothing else needs to change.
// ===========================================================================

type Entry = { en: string; he: string };

const CATALOG = {
  'usage.daily.scale': {
    en: 'Requests \u00b7 one scale across all days and channels',
    he: 'בקשות · קנה מידה אחיד לכל הימים והערוצים',
  },
  'usage.daily.app': { en: 'App', he: 'יישום' },
  'usage.daily.mcp': { en: 'MCP', he: 'MCP' },
  'usage.daily.api': { en: 'API', he: 'API' },
  'usage.ledger.title': { en: 'Recorded charges', he: 'חיובים מתועדים' },
  'usage.ledger.known': { en: 'in known charges', he: 'בחיובים ידועים' },
  'usage.ledger.attempts': { en: 'Attempts', he: 'ניסיונות' },
  'usage.ledger.cached': { en: 'Cached replies', he: 'תשובות ממטמון' },
  'usage.ledger.unknown': { en: 'Unknown costs', he: 'עלויות לא ידועות' },
  'usage.ledger.cachedDetail': { en: 'Served from the gateway cache', he: 'נשלפו ממטמון השער' },
  'usage.ledger.unknownDetail': { en: 'Not counted as zero', he: 'אינן נספרות כאפס' },
  'usage.ledger.scope': {
    en: 'Earlier charges and list-price estimates are not included.',
    he: 'חיובים קודמים והערכות לפי מחירון אינם נכללים.',
  },
  'usage.ledger.first': {
    en: 'First record in this period: {date}.',
    he: 'הרישום הראשון בתקופה זו: {date}.',
  },
  'usage.ledger.producers': { en: 'Charges by producer', he: 'חיובים לפי פעולה' },
  'usage.ledger.producersHint': {
    en: 'Known charges and attempts for each operation',
    he: 'חיובים ידועים וניסיונות לכל פעולה',
  },
  'usage.ledger.producer': { en: 'Producer', he: 'פעולה' },
  'usage.ledger.unavailable': {
    en: 'Recorded charges are unavailable right now.',
    he: 'החיובים המתועדים אינם זמינים כרגע.',
  },
  'usage.ledger.loading': { en: 'Loading charges\u2026', he: 'טוען חיובים…' },
  // — App / daf header —
  'app.title': { en: 'Talmud', he: 'תלמוד' },
  'header.more': { en: 'More', he: 'עוד' },
  'header.about': { en: 'About', he: 'אודות' },
  'header.usage': { en: 'Usage', he: 'שימוש' },
  'header.connect': { en: 'Connect', he: 'חיבור' },
  'header.align': { en: 'Alignment', he: 'התאמה' },
  'header.tractate': { en: 'Tractate', he: 'מסכת' },
  'header.pages': { en: 'Page navigation', he: 'ניווט בדפים' },
  'header.previous': { en: 'Previous page', he: 'הדף הקודם' },
  'header.next': { en: 'Next page', he: 'הדף הבא' },
  'header.page': { en: 'Page', he: 'דף' },
  'header.nav.hint': {
    en: '← / → to navigate · click any word to translate',
    he: 'חיצי המקלדת לניווט · לחצו על מילה לתרגום',
  },
  'header.todaysDaf': { en: "Today's Daf", he: 'הדף היומי' },
  'header.todaysDaf.finding': { en: 'Finding today’s daf…', he: 'מאתר את דף היום…' },
  'header.todaysDaf.title': { en: "Jump to today's Daf Yomi", he: 'מעבר לדף היומי של היום' },
  'header.perek': { en: 'Perek', he: 'פרק' },
  'header.perek.title': { en: 'Jump to a chapter (perek)', he: 'מעבר לפרק' },
  'header.amud.title': { en: 'Toggle amud (side)', he: 'החלפת עמוד (צד)' },
  'header.dev': { en: 'Inspect', he: 'בדיקה' },
  'header.dev.title': {
    en: 'Toggle the Inspect panel (build provenance · marks · checks)',
    he: 'פתיחת לוח הבדיקה (מקור הבנייה · סימונים · בדיקות)',
  },
  'dev.usageReports': { en: 'Usage & reports', he: 'שימוש ודוחות' },
  'dev.alignmentDebug': { en: 'Alignment debug', he: 'ניפוי יישור' },
  'dev.mcpGuide': { en: 'Connect via MCP', he: 'חיבור דרך MCP' },
  'dev.people': { en: 'People', he: 'חכמים' },
  'dev.github': { en: 'GitHub', he: 'GitHub' },
  'dev.tanach': { en: 'Tanach', he: 'תנ״ך' },
  'dev.about': { en: 'About', he: 'אודות' },
  'dev.howItWorks': { en: 'How it works', he: 'איך זה עובד' },

  // — Argument sidebar —
  'argument.title': { en: 'Argument', he: 'סוגיה' },
  'argument.moves': { en: 'Moves', he: 'מהלכים' },
  'argument.questions': { en: 'Questions', he: 'שאלות' },
  'argument.loading': { en: 'Listening to {title}…', he: 'טוען את {title}…' },

  // — Argument voice map —
  'voices.title': { en: 'Voices', he: 'קולות' },
  'voices.position.a': { en: 'Position A', he: 'עמדה א׳' },
  'voices.position.b': { en: 'Position B', he: 'עמדה ב׳' },
  'voices.position.c': { en: 'Position C', he: 'עמדה ג׳' },
  'voices.supportsA': { en: 'Supports A', he: 'תומך בעמדה א׳' },
  'voices.supportsB': { en: 'Supports B', he: 'תומך בעמדה ב׳' },
  'voices.stam': { en: 'Stam', he: 'סתמא' },
  'voices.other': { en: 'Other', he: 'אחר' },
  'voices.unaligned': { en: 'Unaligned', he: 'ללא שיוך' },
  'voices.legend.supports': { en: 'supports / responds', he: 'תומך / מגיב' },
  'voices.legend.opposes': { en: 'opposes', he: 'חולק' },
  'voices.legend.cites': { en: 'cites', he: 'מצטט' },

  // — #argument page (the daf argument graph; replaced the #voices page) —
  'graph.source.voices': { en: 'From the speaker analysis', he: 'מניתוח הדוברים' },
  'graph.source.roles': { en: 'Inferred from the sequence of statements', he: 'הוסק מרצף הטענות' },
  'graph.supportsSide': { en: 'For {side}', he: 'תומך ב־{side}' },
  'graph.expand': { en: 'Full-screen map', he: 'מפה במסך מלא' },
  'graph.close': { en: 'Close map', he: 'סגירת המפה' },
  'graph.clearConnection': { en: 'Clear connection selection', he: 'ביטול בחירת הקשר' },
  'graph.vertical': { en: 'Stacked', he: 'לאורך' },
  'graph.horizontal': { en: 'Passage map', he: 'מפת הסוגיה' },
  'graph.zoomIn': { en: 'Zoom in', he: 'הגדלה' },
  'graph.zoomOut': { en: 'Zoom out', he: 'הקטנה' },
  'graph.fit': { en: 'Fit', he: 'התאמה למסך' },
  'graph.readingOrder': { en: 'Reading order', he: 'סדר הלימוד' },
  'graph.sectionsOnly': { en: 'Sections only', he: 'רק חלקי הסוגיה' },
  'graph.statements': { en: 'Show statements', he: 'הצגת המהלכים' },
  'graph.inspect': {
    en: 'Select a statement or a line to read more',
    he: 'בחרו מהלך או קו כדי לקרוא עוד',
  },
  'graph.addPrevious': { en: 'Add {page} before', he: 'הוספת {page} לפני' },
  'graph.addNext': { en: 'Continue to {page}', he: 'המשך אל {page}' },
  'graph.loadingPage': { en: 'Loading {page}…', he: 'טוען את {page}…' },
  'graph.pageFailed': {
    en: 'Could not load {page}. Try again.',
    he: 'לא ניתן לטעון את {page}. נסו שוב.',
  },
  'graph.pageCold': {
    en: 'No saved argument map for {page} yet.',
    he: 'עדיין אין מפת טיעונים שמורה עבור {page}.',
  },
  'graph.statementsMissing': {
    en: '{pages}: statement details are not saved yet.',
    he: '{pages}: פרטי המהלכים עדיין אינם שמורים.',
  },
  'graph.loadingLinks': { en: 'Loading links between dapim…', he: 'טוען את הקשרים בין העמודים…' },
  'graph.linksUnavailable': {
    en: 'Links between dapim are not available yet. Columns follow the text order.',
    he: 'הקשרים בין העמודים עדיין אינם זמינים. הטורים מסודרים לפי סדר הטקסט.',
  },

  'graph.connections': {
    en: '{count} connections elsewhere',
    he: '{count} קישורים למקורות נוספים',
  },
  'arggraph.link': { en: 'Argument graph', he: 'גרף הסוגיה' },
  'arggraph.title': { en: 'Argument graph', he: 'גרף הסוגיה' },
  'arggraph.loading': { en: 'Loading the daf’s argument…', he: 'טוען את מהלך הסוגיה…' },
  'arggraph.empty': {
    en: 'No argument sections have been analyzed for this daf yet. Open the daf and browse its sections to generate them.',
    he: 'עדיין לא נותחו מקטעי סוגיה עבור דף זה. פִּתחו את הדף ועיינו במקטעים כדי לחשב אותם.',
  },
  'arggraph.openDaf': { en: 'Open the daf', he: 'פתיחת הדף' },
  'arggraph.section.none': {
    en: 'No statement breakdown for this section yet.',
    he: 'אין עדיין פירוט אמירות למקטע זה.',
  },
  'dafvoices.collective': { en: 'collective voice', he: 'קול קיבוצי' },
  'dafvoices.sections': { en: 'sections', he: 'מקטעים' },
  'dafvoices.rel.opposes': { en: 'opposes', he: 'חולק על' },
  'dafvoices.rel.supports': { en: 'supports', he: 'תומך ב' },
  'dafvoices.rel.responds-to': { en: 'responds to', he: 'משיב ל' },
  'coverage.title': { en: 'Where in Shas', he: 'היכן בש״ס' },
  'coverage.summary': {
    en: 'Observed on {dapim} dapim across {masechtot} masechtot — bar height = share of that masechet\u2019s dapim.',
    he: 'נצפה ב־{dapim} דפים ב־{masechtot} מסכתות — גובה העמודה = חלקו מדפי אותה מסכת.',
  },
  'coverage.analyzedNote': {
    en: 'The darker band marks dapim with full voice analysis ({analyzed} Shas-wide) — sage sightings come from the wider mark pipeline, so fills can exceed the band.',
    he: 'הרצועה הכהה מסמנת דפים עם ניתוח קולות מלא ({analyzed} בכל הש״ס) — תצפיות החכם מגיעות מצנרת רחבה יותר, ולכן המילוי עשוי לחרוג מהרצועה.',
  },
  'coverage.noDenominator': {
    en: 'Per-masechet analyzed counts appear after the next graph rebuild.',
    he: 'ספירת הניתוח למסכת תופיע לאחר הבנייה הבאה של הגרף.',
  },
  'coverage.cellTitle': {
    en: '{masechet} — observed on {sage} dapim · {analyzed} voice-analyzed · {total} total',
    he: '{masechet} — נצפה ב־{sage} דפים · {analyzed} נותחו · {total} סה״כ',
  },
  'coverage.cellTitleNoDenom': {
    en: '{masechet} — on {sage} dapim ({total} total)',
    he: '{masechet} — ב־{sage} דפים ({total} סה״כ)',
  },
  'sages.search.label': { en: 'Find a sage', he: 'חיפוש חכם' },
  'sages.search.short': { en: 'Name in English or Hebrew', he: 'שם בעברית או באנגלית' },
  'sages.search.start': {
    en: 'Type a name above. Follow the linked names to move between profiles.',
    he: 'הקלידו שם למעלה. לחצו על שמות מקושרים כדי לעבור בין החכמים.',
  },
  'sages.intro': {
    en: 'Explore the people, their connections, and the passages that link them.',
    he: 'הכירו את החכמים, את קשריהם ואת המקורות המקשרים ביניהם.',
  },
  'sages.directory': { en: 'Find a sage', he: 'חיפוש חכם' },
  'sages.directory.error': {
    en: 'The sage list could not be loaded.',
    he: 'לא ניתן לטעון את רשימת החכמים.',
  },
  'sages.welcome.eyebrow': { en: 'People of the Talmud', he: 'חכמי התלמוד' },
  'sages.welcome.title': { en: 'Start with a sage', he: 'התחילו בחכם' },
  'sages.welcome.description': {
    en: 'Search in English or Hebrew, or choose a name below. Follow a connection to another sage or open its source passage.',
    he: 'חפשו בעברית או באנגלית, או בחרו שם למטה. עברו דרך קשר לחכם אחר או פתחו את המקור.',
  },
  'sages.maintenance': { en: 'Manage records', he: 'ניהול הרשומות' },
  'sages.background': { en: 'Names, places and background', he: 'שמות, מקומות ורקע' },
  'sages.passagesMap': { en: 'Explore the passage map', he: 'עיון במפת המקורות' },
  'sages.connections.profileError': {
    en: 'The biography could not be loaded.',
    he: 'לא ניתן לטעון את הביוגרפיה.',
  },
  'sages.connections.noBio': {
    en: 'No biography is available yet.',
    he: 'עדיין אין ביוגרפיה זמינה.',
  },
  'sages.partners.title': { en: 'Who he appears with', he: 'עם מי הוא נזכר' },
  'sages.partners.note': {
    en: 'Names that stand near his in the text, most passages first. Each count is passages, and each name is as the text writes it. Showing {shown} of {all}.',
    he: 'שמות שנזכרים סמוך לשמו בטקסט, לפי מספר המקומות. כל מספר הוא מספר מקומות, וכל שם הוא כפי שהטקסט כותב אותו. מוצגים {shown} מתוך {all}.',
  },
  'sages.partners.inProgress': {
    en: 'We are still checking who this is in the text, so there is no list of who he appears with yet. The biography links below come from Sefaria.',
    he: 'עדיין בודקים מי זה בטקסט, ולכן אין עדיין רשימה של מי שנזכרים איתו. הקישורים הביוגרפיים למטה מגיעים מספריא.',
  },
  'sages.partners.passages': { en: '{count} passages', he: '{count} מקומות' },
  'sages.partners.mostly': { en: 'mostly: {kind} ({share}%)', he: 'בעיקר: {kind} ({share}%)' },
  'coverage.error': {
    en: 'Could not load the passage counts.',
    he: 'לא ניתן לטעון את ספירת הקטעים.',
  },
  'sages.review.abaye': { en: 'Abaye', he: 'אביי' },
  'sages.review.rava': { en: 'Rava', he: 'רבא' },
  'checked.title': { en: 'Checked connections', he: 'קשרים שנבדקו' },
  'checked.scope': {
    en: 'From passages reviewed so far.',
    he: 'מתוך הקטעים שנבדקו עד כה.',
  },
  'checked.role.child_of.incoming': { en: 'Parent', he: 'הורה' },
  'checked.role.child_of.outgoing': { en: 'Child', he: 'ילד או ילדה' },
  'checked.role.spouse_of.incoming': { en: 'Spouse', he: 'בן או בת זוג' },
  'checked.role.spouse_of.outgoing': { en: 'Spouse', he: 'בן או בת זוג' },
  'checked.role.father_in_law_of.incoming': { en: 'Child-in-law', he: 'חתן או כלה' },
  'checked.role.father_in_law_of.outgoing': { en: 'Father-in-law', he: 'חותן' },
  'checked.role.parent_in_law_of.incoming': { en: 'Child-in-law', he: 'חתן או כלה' },
  'checked.role.parent_in_law_of.outgoing': { en: 'Parent-in-law', he: 'הורה של בן או בת הזוג' },
  'checked.namesError': {
    en: 'Could not load the checked name links.',
    he: 'לא ניתן לטעון את קישורי השמות שנבדקו.',
  },
  'checked.error': {
    en: 'Could not load the checked connections.',
    he: 'לא ניתן לטעון את הקשרים שנבדקו.',
  },
  'checked.unresolved': {
    en: 'The connection is clear. One person has not yet been matched to a stable person record.',
    he: 'הקשר ברור. אחד המשתתפים עדיין לא שויך לזהות קבועה.',
  },
  'checked.intellectual': {
    en: 'This connects their teachings. It does not establish that they met.',
    he: 'זהו קשר בין דבריהם. אין בכך הוכחה שנפגשו.',
  },
  'checked.familySteps': { en: 'How the family connection follows', he: 'כיצד נובע הקשר המשפחתי' },
  'checked.openPassage': { en: 'Open this page', he: 'פתיחת הדף' },
  'checked.next': { en: 'More checked connections', he: 'קשרים נוספים שנבדקו' },
  'checked.first': { en: 'Back to the first connections', he: 'חזרה לקשרים הראשונים' },
  'checked.failedAttempt': { en: 'Attempted, without success', he: 'ניסה, ללא הצלחה' },
  'checked.relation.encounter': { en: 'Direct interaction', he: 'מפגש או שיחה ישירה' },
  'checked.relation.intellectual': { en: 'Response to a teaching', he: 'תגובה לדברים' },
  'checked.relation.action': { en: 'Action', he: 'מעשה' },
  'checked.relation.family': { en: 'Family connection', he: 'קשר משפחתי' },
  'checked.relation.child_of': { en: 'Child of', he: 'ילד או ילדה של' },
  'checked.relation.spouse_of': { en: 'Married to', he: 'נישואים' },
  'checked.relation.father_in_law_of': { en: 'Father-in-law of', he: 'חותנו של' },
  'checked.relation.parent_in_law_of': { en: 'Parent-in-law of', he: 'הורה של בן או בת הזוג' },
  'sages.review.title': {
    en: 'Abaye and Rava: first source check',
    he: 'אביי ורבא: בדיקה ראשונה במקורות',
  },
  'sages.review.total': {
    en: '{included} passages support a connection, out of {checked} checked.',
    he: '{included} קטעים תומכים בקשר, מתוך {checked} שנבדקו.',
  },
  'sages.review.limit': {
    en: 'This first check covers different passages from the older partner list. A debate does not prove a meeting.',
    he: 'בדיקה ראשונה זו עוסקת בקטעים שונים מאלה שברשימת השותפים הקודמת. דיון אינו מוכיח מפגש.',
  },
  'sages.review.groups': { en: 'Kinds of connection', he: 'סוגי קשר' },
  'sages.review.group.relationships': { en: 'Relationships', he: 'קשרים אישיים' },
  'sages.review.group.words': { en: 'Words and teachings', he: 'דברים ומסורות' },
  'sages.review.group.views': { en: 'Views and debate', he: 'דעות ודיון' },
  'sages.review.group.events': { en: 'Events and actions', he: 'מעשים ואירועים' },
  'sages.review.overlap': {
    en: 'Counts are passages. One passage can belong to more than one group.',
    he: 'המספרים מציינים קטעים. קטע אחד יכול להשתייך ליותר מקבוצה אחת.',
  },
  'sages.review.all': { en: 'All included passages', he: 'כל הקטעים שנכללו' },
  'sages.review.unresolved': { en: 'Needs another check', he: 'דורשים בדיקה נוספת' },
  'sages.review.excluded': { en: 'Not a connection', he: 'אינם קשר בין השניים' },
  'sages.review.showing': { en: 'Showing {count} passages', he: 'מוצגים {count} קטעים' },
  'sages.review.empty': {
    en: 'No connection of this kind was established in these passages.',
    he: 'בקטעים אלה לא נמצא קשר מבוסס מסוג זה.',
  },
  'sages.review.mode.discussion': { en: 'Discussion in the text', he: 'דיון בטקסט' },
  'sages.review.mode.narrated': { en: 'Narrated event', he: 'אירוע המסופר בטקסט' },
  'sages.review.mode.reported': { en: 'Reported words or views', he: 'דברים או דעות שנמסרו' },
  'sages.review.mode.proposed': { en: 'An interpretation under consideration', he: 'פירוש שנשקל' },
  'sages.review.mode.message': { en: 'Sent through a messenger', he: 'נשלח בידי שליח' },
  'sages.review.mode.versions': {
    en: 'Alternative versions of one scene',
    he: 'גרסאות חלופיות של סיפור אחד',
  },
  'sages.review.full': { en: 'Full passage and reading notes', he: 'הקטע המלא והערות הקריאה' },
  'sages.review.scope': { en: 'What we checked', he: 'מה בדקנו' },
  'sages.review.open': {
    en: 'Explore the checked Abaye–Rava passages',
    he: 'עיון בקטעי אביי ורבא שנבדקו',
  },
  'sages.pair.open': { en: 'Read their shared passages', he: 'קריאת הקטעים המשותפים' },
  'sages.pair.note': {
    en: 'Counts can overlap: one passage may include both a conversation and a disagreement.',
    he: 'הספירות עשויות לחפוף: קטע אחד יכול לכלול גם שיחה וגם מחלוקת.',
  },
  'sages.pair.examples': { en: 'Example passages', he: 'קטעים לדוגמה' },
  'sages.pair.sample': {
    en: 'These are saved examples, not the full list of shared passages.',
    he: 'אלה דוגמאות שנשמרו, ולא הרשימה המלאה של הקטעים המשותפים.',
  },
  'sages.pair.source': { en: 'Read on Sefaria', he: 'קריאה בספריא' },
  'sages.pair.unavailable': {
    en: 'The passage text is not available here. Follow the source link to read it.',
    he: 'טקסט הקטע אינו זמין כאן. אפשר לקרוא אותו בקישור למקור.',
  },
  'sages.pair.missing': {
    en: 'This pair has no saved passage record.',
    he: 'לא נשמרו קטעים לזוג הזה.',
  },
  'sages.pair.back': { en: 'Back to profile', he: 'חזרה לדף החכם' },
  'sages.partners.open': { en: 'Open {name}', he: 'פתיחת {name}' },
  'sages.partners.more': { en: 'Show {count} more', he: 'עוד {count}' },
  'sages.partners.fewer': { en: 'Show fewer', he: 'פחות' },
  'sages.connections.title': { en: 'From biographies', he: 'מתוך הביוגרפיות' },
  'sages.group.relationships': { en: 'Relationships', he: 'יחסים' },
  'sages.group.transmission': { en: 'Words and teachings', he: 'מסירת דברים ותורה' },
  'sages.group.debate': { en: 'Views and debate', he: 'דעות ודיונים' },
  'sages.group.events': { en: 'Events and actions', he: 'אירועים ומעשים' },
  'sages.group.relationships.description': {
    en: 'Who they were to one another: teachers, students, relatives and companions.',
    he: 'מי היו זה לזה: מורים, תלמידים, קרובי משפחה וחברים.',
  },
  'sages.group.transmission.description': {
    en: 'Who quoted, heard or passed on whose words. A quotation alone does not show that they met.',
    he: 'מי ציטט, שמע או מסר את דברי מי. ציטוט לבדו אינו מעיד על מפגש.',
  },
  'sages.group.debate.description': {
    en: 'Whose views agree, differ or answer one another. The text may bring together people who never met.',
    he: 'דעות שמסכימות, חולקות או משיבות זו לזו. הטקסט עשוי להפגיש דעות של אנשים שלא נפגשו.',
  },
  'sages.group.events.description': {
    en: 'What people did: visits, help, journeys and other actions.',
    he: 'מה עשו: ביקורים, עזרה, מסעות ומעשים אחרים.',
  },
  'sages.connections.noRoles': {
    en: 'No relationships are listed in this profile yet.',
    he: 'עדיין לא רשומים יחסים בפרופיל זה.',
  },
  'sages.connections.profileNote': {
    en: 'From the existing biographical records. Passage-by-passage evidence is not attached to these entries yet.',
    he: 'מתוך הרשומות הביוגרפיות הקיימות. עדיין לא צורפו מקורות לכל קשר.',
  },
  'sages.connections.profileSource': { en: 'Profile summary', he: 'סיכום ביוגרפי' },
  'sages.connections.otherProfile': {
    en: 'Other links in the biography',
    he: 'קשרים נוספים בביוגרפיה',
  },
  'sages.connections.retry': { en: 'Try again', he: 'נסו שוב' },
  'sages.connections.error': {
    en: 'The passage connections could not be loaded.',
    he: 'לא ניתן לטעון את הקשרים שבמקורות.',
  },
  'sages.connections.noPassages': {
    en: 'No passage connections are available in this view yet.',
    he: 'עדיין אין קשרים ממקורות בתצוגה זו.',
  },
  'sages.connections.passageNote': {
    en: 'These older text links have not been checked against their source pages. Open a row to inspect them.',
    he: 'קשרים אלו מן הניתוח הקודם טרם נבדקו מול המקורות. פתחו שורה כדי לבדוק אותם.',
  },
  'sages.connections.references': {
    en: '{count} example source pages',
    he: '{count} דפי מקור לדוגמה',
  },
  'sages.connections.openProfile': { en: 'Explore {name}', he: 'לפרופיל של {name}' },
  'sages.connections.noEvents': {
    en: 'No events are listed in this profile yet.',
    he: 'עדיין לא רשומים אירועים בפרופיל זה.',
  },
  'sages.connections.eventNote': {
    en: 'These are biography summaries. Their source passages and whether each action happened or was only proposed have not been checked here.',
    he: 'אלו סיכומים ביוגרפיים. המקורות והשאלה אם המעשים התרחשו או רק הוצעו טרם נבדקו כאן.',
  },
  'sages.argument.cites': { en: 'quotes', he: 'מצטט את' },
  'sages.argument.opposes': { en: 'disagrees with', he: 'חולק על' },
  'sages.argument.responds-to': { en: 'responds to', he: 'משיב ל' },
  'sages.argument.supports': { en: 'supports the view of', he: 'תומך בדעת' },
  'sages.argument.resolves': {
    en: 'resolves a difficulty in the words of',
    he: 'מיישב קושי בדברי',
  },
  'sages.family.aunt': { en: 'Aunt', he: 'דודה' },
  'sages.family.niece': { en: 'Niece', he: 'אחיינית' },
  'sages.family.grandmother': { en: 'Grandmother', he: 'סבתא' },
  'sages.family.granddaughter': { en: 'Granddaughter', he: 'נכדה' },
  'sages.family.mother-in-law': { en: 'Mother-in-law', he: 'חמות' },
  'sages.family.daughter-in-law': { en: 'Daughter-in-law', he: 'כלה' },
  'sages.family.brother-in-law': { en: 'Brother-in-law', he: 'גיס' },
  'sages.family.sister-in-law': { en: 'Sister-in-law', he: 'גיסה' },
  'sages.family.cousin': { en: 'Cousin', he: 'בן או בת דוד' },
  'sages.family.ancestor': { en: 'Ancestor', he: 'אב קדמון' },
  'sages.family.descendant': { en: 'Descendant', he: 'צאצא' },
  'sages.family.other': { en: 'Other', he: 'קרבה אחרת' },
  'sages.family.father': { en: 'Father', he: 'אב' },
  'sages.family.mother': { en: 'Mother', he: 'אם' },
  'sages.family.son': { en: 'Son', he: 'בן' },
  'sages.family.daughter': { en: 'Daughter', he: 'בת' },
  'sages.family.brother': { en: 'Brother', he: 'אח' },
  'sages.family.sister': { en: 'Sister', he: 'אחות' },
  'sages.family.uncle': { en: 'Uncle', he: 'דוד' },
  'sages.family.nephew': { en: 'Nephew', he: 'אחיין' },
  'sages.family.wife': { en: 'Wife', he: 'אישה' },
  'sages.family.husband': { en: 'Husband', he: 'בעל' },
  'sages.family.spouse': { en: 'Spouse', he: 'בן או בת זוג' },
  'sages.family.grandfather': { en: 'Grandfather', he: 'סב' },
  'sages.family.grandson': { en: 'Grandson', he: 'נכד' },
  'sages.family.father-in-law': { en: 'Father-in-law', he: 'חותן' },
  'sages.family.son-in-law': { en: 'Son-in-law', he: 'חתן' },
  'sages.ops.title': { en: 'Enrichment tools & sources', he: 'כלי העשרה ומקורות' },
  'sages.missing.title': { en: 'Missing from the registry', he: 'חסרים במאגר' },
  'sages.missing.unavailable': {
    en: 'Backlog unavailable right now.',
    he: 'הרשימה אינה זמינה כרגע.',
  },
  'sages.missing.note': {
    en: '{total} distinct names were sighted on analyzed dapim but match no registry entry — the "needs a bio" worklist. Counts sampled from the first {scanned} records.',
    he: '{total} שמות נצפו בדפים שנותחו אך אינם במאגר — רשימת העבודה של \u201cחסרה ביוגרפיה\u201d. הספירה מדגימה את {scanned} הרשומות הראשונות.',
  },
  'network.page.title': { en: 'Sage network', he: 'רשת החכמים' },
  'network.page.coverageShort': {
    en: 'from {dapim} analyzed dapim',
    he: 'מתוך {dapim} דפים שנותחו',
  },
  'network.arc.hint': {
    en: 'Arcs are bundled by generation — click a generation to open it.',
    he: 'הקשתות מקובצות לפי דורות — לחצו על דור כדי לפתוח אותו.',
  },
  'network.arc.expand': { en: 'Show the {n} sages of {gen}', he: 'הצגת {n} חכמי {gen}' },
  'network.arc.collapse': { en: 'Collapse {gen}', he: 'צמצום {gen}' },
  'network.arc.val.debate': { en: 'debate (opposes, responds)', he: 'עימות (חולק, משיב)' },
  'network.arc.val.support': {
    en: 'support (cites, supports, resolves)',
    he: 'הסתמכות (מצטט, תומך, מיישב)',
  },
  'network.arc.kindLegend': { en: 'details:', he: 'פירוט:' },
  'network.arc.fanOverflow': {
    en: '+{n} weaker ties not drawn in the expanded generation (all listed below)',
    he: '+{n} קשרים חלשים שאינם מצוירים בדור הפתוח (כולם ברשימה למטה)',
  },
  'network.rows.filtered': { en: 'Showing {gen} only.', he: 'מוצג {gen} בלבד.' },
  'network.rows.showAll': { en: 'Show all', he: 'הצגת הכול' },
  'network.arc.aria': {
    en: 'Arc diagram of {name}\u2019s interactions by generation',
    he: 'תרשים קשתות של קשרי {name} לפי דורות',
  },
  'network.page.building': {
    en: 'The Shas-wide network is still being built — check back soon.',
    he: 'רשת הש״ס עדיין נבנית — נסו שוב בקרוב.',
  },
  'network.page.notInGraph': {
    en: 'No voice-graph sightings for this sage yet (coverage grows as more dapim are analyzed).',
    he: 'אין עדיין תצפיות לחכם זה (הכיסוי גדל ככל שמנותחים עוד דפים).',
  },
  'network.page.meta': {
    en: 'speaks in {sections} sections · {partners} partners',
    he: 'מדבר ב־{sections} קטעים · {partners} בני שיח',
  },
  'network.page.newlyConnected': {
    en: 'first relationships for this sage',
    he: 'קשרים ראשונים לחכם זה',
  },
  'network.page.noEdges': {
    en: 'Appears on analyzed dapim, but no confident partner edges yet.',
    he: 'מופיע בדפים שנותחו, אך עדיין ללא קשרים ודאיים.',
  },
  'network.page.chipTitle': {
    en: '{weight} sightings ({strict} strict)',
    he: '{weight} תצפיות ({strict} ודאיות)',
  },
  'network.page.showDafs': { en: 'dapim ({n})', he: 'דפים ({n})' },
  'network.page.hideDafs': { en: 'hide', he: 'הסתרה' },
  'dafvoices.rel.cites': { en: 'cites', he: 'מצטט את' },
  'dafvoices.rel.resolves': { en: 'resolves', he: 'מיישב את' },
  // Voice roles (argument taxonomy)
  'voice.role.originator': { en: 'originator', he: 'פותח' },
  'voice.role.questioner': { en: 'questioner', he: 'מקשה' },
  'voice.role.respondent': { en: 'respondent', he: 'משיב' },
  'voice.role.objector': { en: 'objector', he: 'חולק' },
  'voice.role.supporter': { en: 'supporter', he: 'תומך' },
  'voice.role.cited-authority': { en: 'cited authority', he: 'מקור מצוטט' },
  'voice.role.transmitter': { en: 'transmitter', he: 'מוסר' },
  // Move kinds (argument taxonomy)
  'move.kind.opening': { en: 'opening', he: 'פתיחה' },
  'move.kind.question': { en: 'question', he: 'קושיה' },
  'move.kind.answer': { en: 'answer', he: 'תשובה' },
  'move.kind.objection': { en: 'objection', he: 'השגה' },
  'move.kind.rejection': { en: 'rejection', he: 'דחייה' },
  'move.kind.resolution': { en: 'resolution', he: 'יישוב' },
  'move.kind.supporting-evidence': { en: 'supporting evidence', he: 'ראיה' },
  'move.kind.digression': { en: 'digression', he: 'הרחבה' },
  'move.kind.shift': { en: 'shift', he: 'מעבר' },
  'move.kind.other': { en: 'other', he: 'אחר' },
  'move.segment': { en: 'seg', he: 'קטע' },
  'move.highlighted': { en: 'highlighted', he: 'מודגש' },
  'move.highlight.set': {
    en: 'Click to highlight this move on the daf',
    he: 'לחצו להדגשת המהלך בדף',
  },
  'move.highlight.clear': { en: 'Click to clear highlight', he: 'לחצו לניקוי ההדגשה' },

  // — Sidebar kind titles —
  'sidebar.kind.argument': { en: 'Argument', he: 'סוגיה' },
  'sidebar.kind.halacha': { en: 'Practical Halacha', he: 'הלכה למעשה' },
  'sidebar.kind.chart': { en: 'Chart', he: 'טבלה' },
  'sidebar.kind.aggadata': { en: 'Aggada', he: 'אגדה' },
  'sidebar.kind.yerushalmi': { en: 'Yerushalmi', he: 'ירושלמי' },
  'sidebar.kind.pesuk': { en: 'Pasuk', he: 'פסוק' },
  'sidebar.kind.place': { en: 'Place', he: 'מקום' },
  'sidebar.kind.rishonim': { en: 'Rishonim', he: 'ראשונים' },
  'sidebar.kind.voice-group': { en: 'Voice', he: 'קול' },
  'sidebar.kind.rabbi': { en: 'Rabbi', he: 'חכם' },
  'sidebar.kind.argument-overview': { en: 'Overview', he: 'סקירה' },
  'sidebar.kind.daf-background': { en: 'Background', he: 'רקע' },
  'sidebar.kind.tidbit': { en: 'Tidbit', he: 'תובנה' },
  'sidebar.kind.biyun': { en: "Bi'yun", he: 'עיון' },
  'sidebar.kind.geography': { en: 'Geography', he: 'גאוגרפיה' },

  // — Whole-daf argument overview —
  'overview.chip': { en: 'Overview', he: 'סקירה' },
  'overview.title': { en: 'Daf overview', he: 'סקירת הדף' },
  'overview.empty': {
    en: 'No argument sections on this daf yet — open it with Arguments enabled so they load.',
    he: 'אין עדיין מקטעי טיעון בדף זה.',
  },
  // Cross-daf continuation captions on the overview maps. {page} is the
  // adjacent amud, already localized (Hebrew daf form in he mode).
  'overview.continuesFrom': { en: '↑ continues from {page}', he: '↑ המשך מדף {page}' },
  'overview.continuesOnto': { en: 'continues onto {page} ↓', he: 'ממשיך לדף {page} ↓' },
  'overview.crossRefs': { en: 'Cross-references', he: 'הפניות' },
  'overview.mapping': { en: 'Mapping the discussion…', he: 'ממפה את הסוגיה…' },
  'overview.goToDaf': { en: 'Go to {daf}', he: 'מעבר ל{daf}' },
  'overview.statementHint': {
    en: 'Select a statement above to see it here.',
    he: 'בחרו אמירה למעלה כדי לראותה כאן.',
  },
  // Why a focused section's statement band is empty (never silently blank).
  'overview.stmt.loading': { en: 'Loading statements…', he: 'טוען אמירות…' },
  'overview.stmt.failed': {
    en: "Couldn't load statements — try reloading.",
    he: 'טעינת האמירות נכשלה — נסו לרענן.',
  },
  'overview.stmt.cold': {
    en: 'Statements for this daf aren’t computed yet.',
    he: 'האמירות לדף זה טרם חושבו.',
  },
  'overview.stmt.none': {
    en: 'This section has no sub-statements.',
    he: 'אין למקטע זה תת-אמירות.',
  },
  // Link-relation labels (the unified link layer, src/lib/context/link.ts).
  'link.rel.cites': { en: 'cites', he: 'מצטט' },
  'link.rel.continues': { en: 'continues', he: 'ממשיך' },
  'link.rel.resolves': { en: 'resolves', he: 'מיישב' },
  'link.rel.depends-on': { en: 'depends on', he: 'תלוי ב' },
  'link.rel.parallels': { en: 'parallels', he: 'מקביל' },
  'link.rel.contrasts': { en: 'contrasts', he: 'מנוגד' },
  'link.rel.generalizes': { en: 'generalizes', he: 'מכליל' },
  'link.rel.glosses': { en: 'glosses', he: 'מפרש' },
  'link.rel.codifies': { en: 'codified in', he: 'נפסק ב' },
  // Statement edges reuse the section link.rel.* labels (mapped via STMT_REL_AS_LINK
  // in ArgumentFlowGraph) — except `supports`, which has no section kin and keeps
  // its own evidential label.
  'stmt.rel.supports': { en: 'supports', he: 'תומך' },

  // — Spine flow graph (whole-tractate overview, SpineFlowGraph) —
  'spine.corpus.bavli': { en: 'Bavli', he: 'בבלי' },
  'spine.corpus.yeru': { en: 'ירושלמי', he: 'ירושלמי' },
  'spine.corpus.here': { en: 'this tractate', he: 'מסכת זו' },
  'spine.crossCold': { en: 'cross-daf link not computed yet', he: 'קישור בין־דפי טרם חושב' },
  'spine.tip.parallelsCold': {
    en: 'parallels not computed yet for this daf (warm it to see its cross-text links)',
    he: 'מקבילות טרם חושבו לדף זה (חממו כדי לראות קישורים בין־טקסטואליים)',
  },
  'spine.tip.traceRabbi': {
    en: 'trace {name} across the tractate',
    he: 'עקבו אחר {name} לאורך המסכת',
  },
  'spine.tip.parallels.one': {
    en: '{count} parallel elsewhere — click to {action}',
    he: 'מקבילה אחת במקום אחר — לחצו ל{action}',
  },
  'spine.tip.parallels.other': {
    en: '{count} parallels elsewhere — click to {action}',
    he: '{count} מקבילות במקומות אחרים — לחצו ל{action}',
  },
  'spine.action.show': { en: 'show', he: 'הצגה' },
  'spine.action.hide': { en: 'hide', he: 'הסתרה' },
  'spine.tip.openInReader': { en: 'open in reader', he: 'פתחו בקורא' },
  'spine.tip.yeruCard': {
    en: 'Yerushalmi — see the daf’s Yerushalmi card',
    he: 'ירושלמי — ראו בכרטיס הירושלמי של הדף',
  },
  'spine.tip.node.one': { en: '{count} section', he: 'מקטע אחד' },
  'spine.tip.node.other': { en: '{count} sections', he: '{count} מקטעים' },
  'spine.tip.node.crossSuffix': { en: ' · cross-daf links', he: ' · קישורים בין־דפי' },

  // — Whole-daf background (terms/concepts a reader needs) —
  'background.chip': { en: 'Background', he: 'רקע' },
  'background.title': { en: 'Background', he: 'רקע' },
  'background.empty': {
    en: 'No background terms surfaced for this daf yet.',
    he: 'לא נמצאו עדיין מושגי רקע לדף זה.',
  },
  'background.cat.legal-concepts': { en: 'Legal concepts', he: 'מושגים הלכתיים' },
  'background.cat.realia': { en: 'Everyday life', he: 'מציאות' },
  'background.cat.assumed-prior': { en: 'Assumed background', he: 'רקע מוקדם' },

  // — Whole-daf Tidbit (one curated "did you notice…" reading) —
  'tidbit.chip': { en: 'Tidbit', he: 'תובנה' },
  'tidbit.title': { en: 'Tidbit', he: 'תובנה' },
  // — Whole-daf Bi'yun (deep dive into a rishonim problem) —
  'biyun.chip': { en: "Bi'yun", he: 'עיון' },
  'biyun.title': { en: "Bi'yun", he: 'עיון' },
  'tidbit.empty': { en: 'No tidbit for this daf yet.', he: 'אין עדיין תובנה לדף זה.' },
  'tidbit.sources': { en: 'Sources', he: 'מקורות' },
  'tidbit.flavor.aggadah': { en: 'Aggadah', he: 'אגדה' },
  'tidbit.flavor.legal-concept': { en: 'Legal concept', he: 'מושג הלכתי' },
  'tidbit.flavor.machloket': { en: 'Machloket', he: 'מחלוקת' },
  'tidbit.flavor.textual': { en: 'Textual', he: 'נוסח' },
  'tidbit.flavor.hidden-point': { en: 'Hidden point', he: 'נקודה נסתרת' },
  'tidbit.conf.text': { en: 'text', he: 'טקסט' },
  'tidbit.conf.reading': { en: 'reading', he: 'קריאה' },
  'tidbit.conf.high': { en: 'high', he: 'גבוה' },
  'tidbit.conf.medium': { en: 'medium', he: 'בינוני' },
  'tidbit.conf.low': { en: 'low', he: 'נמוך' },
  // — Common —
  'common.open': { en: 'Open {name}', he: 'פתיחת {name}' },
  'common.close': { en: 'Close', he: 'סגירה' },

  // — Enrichment loading copy (evocative; streamed while a card generates) —
  'loading.rabbi.named': { en: 'Interviewing {name}…', he: 'מראיין את {name}…' },
  'loading.rabbi': { en: 'Interviewing the Rabbi…', he: 'מראיין את החכם…' },
  'loading.argument.named': {
    en: 'Tracing the argument: {title}…',
    he: 'עוקב אחר הסוגיה: {title}…',
  },
  'loading.argument': { en: 'Tracing the argument…', he: 'עוקב אחר הסוגיה…' },
  'loading.move.named': { en: 'Listening to {voice}…', he: 'מקשיב ל{voice}…' },
  'loading.move': { en: 'Tracing the flow…', he: 'עוקב אחר המהלך…' },
  'loading.tidbit': { en: 'Looking for a chiddush…', he: 'מחפש חידוש…' },
  'loading.biyun': { en: 'Learning it through…', he: 'מעיין בסוגיה…' },
  'loading.halacha.named': { en: 'Asking a Rav about {title}…', he: 'שואל רב על {title}…' },
  'loading.halacha': { en: 'Asking the Rav…', he: 'שואל את הרב…' },
  'loading.aggadata.named': { en: 'Pondering {title}…', he: 'מהרהר ב{title}…' },
  'loading.aggadata': { en: 'Wondering…', he: 'תוהה…' },
  'loading.pesukim.named': { en: 'Reading {ref} in context…', he: 'קורא את {ref} בהקשרו…' },
  'loading.pesukim': { en: 'Reading the verse in context…', he: 'קורא את הפסוק בהקשרו…' },
  'loading.places.named': { en: 'Visiting {name}…', he: 'מבקר ב{name}…' },
  'loading.places': { en: 'Travelling…', he: 'נוסע…' },
  'loading.rishonim': { en: 'Listening to Rashi and Tosafot…', he: 'מקשיב לרש״י ולתוספות…' },
  'loading.default': { en: 'Learning…', he: 'לומד…' },
  'enrichment.updating': { en: 'Updating…', he: 'מתעדכן…' },

  // — Questions (Q&A) panel —
  'qa.questions': { en: 'Questions', he: 'שאלות' },
  'qa.empty': {
    en: 'No questions yet. Ask your own below.',
    he: 'אין עדיין שאלות. שאלו את שלכם למטה.',
  },
  'qa.placeholder': {
    en: 'Ask your own question about this move…',
    he: 'שאלו שאלה משלכם על המהלך…',
  },
  'qa.submit': { en: 'Submit', he: 'שליחה' },
  'qa.cancel': { en: 'Cancel', he: 'ביטול' },
  'qa.askYourOwn': { en: 'Ask your own question', he: 'שאלו שאלה משלכם' },
  'qa.privacy': {
    en: 'Your question will be answered with the move + commentaries as context. New questions are visible to future learners on this move — no personal info is recorded.',
    he: 'השאלה תיענה בהקשר המהלך והמפרשים. שאלות חדשות גלויות ללומדים אחרים במהלך זה — לא נשמר מידע אישי.',
  },

  // — Common (additions) —
  'common.collapse': { en: 'collapse', he: 'כיווץ' },
  'common.expand': { en: 'expand', he: 'הרחבה' },
  'common.showAll': { en: 'show all', he: 'הצג הכל' },

  // — Region fallbacks —
  'region.other': { en: 'Other', he: 'אחר' },
  'region.unknown': { en: 'Unknown', he: 'לא ידוע' },

  // — Sages page —
  'notFound.title': { en: 'Page not found', he: 'הדף לא נמצא' },
  'notFound.body': {
    en: 'There is no page at this address.',
    he: 'אין דף בכתובת הזו.',
  },
  'notFound.back': { en: 'Open the reader', he: 'פתיחת הקורא' },
  'stories.named.name': { en: 'Named person', he: 'אדם הנקוב בשם' },
  'stories.named.group': { en: 'Group', he: 'קבוצה' },
  'stories.named.described': { en: 'Described person', he: 'אדם המתואר ללא שם' },
  'stories.named.father_of_named': { en: 'Father included in a name', he: 'אב המוזכר כחלק משם' },
  'stories.named.pronoun_only': {
    en: 'Person referred to by a pronoun',
    he: 'אדם המוזכר בכינוי גוף',
  },
  'stories.title': { en: 'Story passages', he: 'קטעים ואנשים' },
  'stories.intro': {
    en: 'Read the source, the people named in it, and the saved reading notes.',
    he: 'קראו את המקור, את האנשים המוזכרים בו ואת הערות הקריאה שנשמרו.',
  },
  'stories.coverage': {
    en: '{count} selected passages from {packs} completed packs. This is not every passage in these books.',
    he: '{count} קטעים נבחרים מתוך {packs} קבוצות שהושלמו. אין כאן את כל הקטעים שבספרים האלה.',
  },
  'stories.search': { en: 'Search a name or source reference', he: 'חיפוש שם או מראה מקום' },
  'stories.collection': { en: 'Collection', he: 'קובץ' },
  'stories.all': { en: 'All collections', he: 'כל הקבצים' },
  'stories.namesNote': {
    en: 'Names are searched as written. Matching names may refer to different people.',
    he: 'החיפוש הוא לפי השם כפי שנכתב. שמות זהים עשויים לציין אנשים שונים.',
  },
  'stories.matches': { en: '{count} matching passages', he: '{count} קטעים מתאימים' },
  'stories.more': { en: 'Show more passages', he: 'הצגת קטעים נוספים' },
  'stories.error': { en: 'Could not load the readings.', he: 'לא ניתן לטעון את הקטעים.' },
  'stories.missing': { en: 'This passage was not found.', he: 'הקטע לא נמצא.' },
  'stories.back': { en: 'All story passages', he: 'כל הקטעים' },
  'stories.source': { en: 'Source passage', he: 'הקטע המקורי' },
  'stories.context': { en: 'Surrounding text', he: 'הטקסט הסמוך' },
  'stories.before': { en: 'Before this passage', he: 'לפני הקטע' },
  'stories.after': { en: 'After this passage', he: 'אחרי הקטע' },
  'stories.notes': { en: 'Reading notes', he: 'הערות קריאה' },
  'stories.readingNote': {
    en: 'These readings still need review. They do not establish that names in different passages belong to the same person. Notes were written in English.',
    he: 'הקריאות האלה עדיין דורשות בדיקה. הן אינן קובעות ששמות בקטעים שונים הם אותו אדם. ההערות נכתבו באנגלית.',
  },
  'stories.claimNote': {
    en: 'These are proposed readings, not established events or relationships. Read each note and quotation for conditions, doubts, and reported speech.',
    he: 'אלה הצעות קריאה, לא אירועים או קשרים שהוכחו. קראו את ההערה והציטוט כדי לראות תנאים, ספקות ודיבור מצוטט.',
  },
  'stories.unclear': { en: 'Questions left open', he: 'שאלות שנותרו פתוחות' },
  'stories.people': { en: 'People recorded in this passage', he: 'אנשים שנרשמו בקטע' },
  'stories.relations': { en: 'Relationship and action notes', he: 'הערות על קשרים ומעשים' },
  'stories.speech': { en: 'Speech notes', he: 'הערות על דיבור' },
  'stories.contextQuote': { en: 'Quote from the surrounding text', he: 'ציטוט מהטקסט הסמוך' },
  'stories.withheld': {
    en: 'The source is available. Its reading notes are withheld because some quotations failed the source check.',
    he: 'המקור זמין. הערות הקריאה אינן מוצגות משום שחלק מהציטוטים לא התאימו למקור.',
  },
  'stories.record': { en: 'Saved reading: {id}', he: 'קריאה שמורה: {id}' },
  'stories.noAddressee': { en: 'no named addressee', he: 'ללא נמען נקוב' },
  'stories.unknownPerson': { en: 'person unclear', he: 'זהות לא ברורה' },
  'stories.speechBasis': {
    en: 'Speaker: {speaker}. Addressee: {addressee}.',
    he: 'דובר: {speaker}. נמען: {addressee}.',
  },
  'stories.profileLink': {
    en: 'Search passages containing this name',
    he: 'חיפוש קטעים המכילים את השם הזה',
  },
  'stories.proposed': { en: 'Recorded reading', he: 'קריאה שנרשמה' },
  'stories.basis.text': { en: 'named in the text', he: 'נקוב בטקסט' },
  'stories.basis.unambiguous_pronoun': { en: 'read from a pronoun', he: 'זוהה לפי כינוי גוף' },
  'stories.basis.context': { en: 'inferred from context', he: 'הוסק מההקשר' },
  'stories.basis.outside': {
    en: 'based on information outside this passage',
    he: 'מבוסס על מידע מחוץ לקטע',
  },
  'stories.corpus.bavli': { en: 'Babylonian Talmud', he: 'תלמוד בבלי' },
  'stories.corpus.yerushalmi': { en: 'Jerusalem Talmud', he: 'תלמוד ירושלמי' },
  'stories.corpus.midrash-aggadah': { en: 'Aggadic Midrash', he: 'מדרשי אגדה' },
  'stories.corpus.midrash-halakhah': { en: 'Halakhic Midrash', he: 'מדרשי הלכה' },
  'stories.corpus.tosefta': { en: 'Tosefta', he: 'תוספתא' },
  'stories.corpus.minor-tractates': { en: 'Minor tractates', he: 'מסכתות קטנות' },
  'stories.corpus.mishnah': { en: 'Mishnah', he: 'משנה' },
  'stories.kind.child_of': { en: 'child of', he: 'ילד של' },
  'stories.kind.parent_of': { en: 'parent of', he: 'הורה של' },
  'stories.kind.spouse_of': { en: 'spouse of', he: 'בן או בת זוג של' },
  'stories.kind.sibling_of': { en: 'sibling of', he: 'אח או אחות של' },
  'stories.kind.teacher_of': { en: 'teacher of', he: 'מורה של' },
  'stories.kind.student_of': { en: 'student of', he: 'תלמיד של' },
  'stories.kind.in_the_presence_of': { en: 'in the presence of', he: 'בנוכחות' },
  'stories.kind.said': { en: 'speaks to', he: 'מדבר אל' },
  'stories.kind.asked': { en: 'asks', he: 'שואל את' },
  'stories.kind.answered': { en: 'answers', he: 'עונה ל־' },
  'stories.kind.objected': { en: 'objects to', he: 'מקשה על' },
  'stories.kind.taught': { en: 'teaches', he: 'מלמד את' },
  'stories.kind.quoted_teaching': { en: 'quotes a teaching to', he: 'מצטט דברי תורה בפני' },
  'stories.kind.narration': { en: 'narration concerning', he: 'סיפור על' },
  'sages.title': { en: 'Sages', he: 'חכמים' },
  'sages.count.all': { en: '{count} sages', he: '{count} חכמים' },
  'sages.count.filtered': { en: '{shown} of {total}', he: '{shown} מתוך {total}' },
  'sages.stats.loading': { en: 'loading coverage…', he: 'טוען כיסוי…' },
  'sages.stats.unified': { en: 'unified', he: 'מאוחד' },
  'sages.stats.wikidata': { en: 'wikidata', he: 'ויקינתונים' },
  'sages.stats.wikiBio': { en: 'wiki-bio', he: 'ביוגרפיה-ויקי' },
  'sages.compile.graph': { en: 'graph', he: 'גרף' },
  'sages.compile.cohort': { en: 'cohort', he: 'דור' },
  'sages.compile.places': { en: 'places', he: 'מקומות' },
  'sages.compile.academies': { en: 'academies', he: 'ישיבות' },
  'sages.compile.graph.desc': {
    en: 'Bidirectional teacher↔student + family inversion across all enriched sages.',
    he: 'היפוך דו-כיווני רב↔תלמיד + משפחה על פני כל החכמים המועשרים.',
  },
  'sages.compile.cohort.desc': {
    en: 'Group sages by generation; emit slug→contemporaries.',
    he: 'קיבוץ חכמים לפי דור; הפקת מזהה→בני דור.',
  },
  'sages.compile.places.desc': {
    en: 'Invert sage.places[] into place→sages.',
    he: 'היפוך places[] של חכם ל-מקום→חכמים.',
  },
  'sages.compile.academies.desc': {
    en: 'Invert sage.academy into academy→sages.',
    he: 'היפוך academy של חכם ל-ישיבה→חכמים.',
  },
  'sages.compile.title': { en: '{desc}\nlast: {last}', he: '{desc}\nאחרון: {last}' },
  'sages.compile.never': { en: 'never', he: 'מעולם' },
  'sages.compile.running': { en: '{name}…', he: '{name}…' },
  'sages.compile.action': { en: 'compile {name}', he: 'הידור {name}' },
  'sages.compile.err': { en: 'err', he: 'שגיאה' },
  'sages.search.placeholder': {
    en: 'Search by name in English or Hebrew…',
    he: 'חיפוש לפי שם, מזהה, כינוי או עברית…',
  },
  'sages.filter.region': { en: 'region', he: 'אזור' },
  'sages.filter.gen': { en: 'gen', he: 'דור' },
  'sages.filter.all': { en: 'all', he: 'הכול' },
  'sages.region.israel': { en: 'Israel', he: 'ארץ ישראל' },
  'sages.region.bavel': { en: 'Bavel', he: 'בבל' },
  'sages.list.loading': { en: 'loading…', he: 'טוען…' },
  'sages.list.noMatches': { en: 'no matches', he: 'אין תוצאות' },
  'sages.list.cap': { en: '+{count} more — refine search', he: 'עוד {count} — צמצמו את החיפוש' },
  'sages.meta.gen': { en: 'gen {gen}', he: 'דור {gen}' },
  'sages.detail.pickPrompt': {
    en: 'Pick a sage on the left to see everything we have on file.',
    he: 'בחרו חכם מימין כדי לראות את כל המידע שברשותנו.',
  },
  'sages.detail.clearSelection': { en: 'Clear selection', he: 'ניקוי הבחירה' },
  'sages.detail.loadingSage': { en: 'loading sage…', he: 'טוען חכם…' },
  'sages.detail.noUnified': {
    en: 'No unified record cached for this sage yet.',
    he: 'אין עדיין רשומה מאוחדת שמורה לחכם זה.',
  },
  'sages.detail.runUnified': { en: 'Run unified enrichment', he: 'הרצת העשרה מאוחדת' },
  'sages.meta.genLabel': { en: 'gen', he: 'דור' },
  'sages.meta.region': { en: 'region', he: 'אזור' },
  'sages.meta.academy': { en: 'academy', he: 'ישיבה' },
  'sages.meta.prominence': { en: 'prominence', he: 'בולטות' },
  'sages.section.aliases': { en: 'Other names', he: 'כינויים' },
  'sages.section.bio': { en: 'About this sage', he: 'על החכם' },
  'sages.bio.empty': { en: 'No biography is available yet.', he: 'עדיין אין ביוגרפיה זמינה.' },
  'sages.section.characteristics': { en: 'Characteristics', he: 'מאפיינים' },
  'sages.section.places': { en: 'Places', he: 'מקומות' },
  'sages.section.relationships': { en: 'Relationships', he: 'קשרים' },
  'sages.rel.primaryTeacher': { en: 'primary teacher', he: 'רב מובהק' },
  'sages.rel.primaryStudent': { en: 'primary student', he: 'תלמיד מובהק' },
  'sages.rel.teachers': { en: 'Teachers', he: 'רבותיו' },
  'sages.rel.students': { en: 'Students', he: 'תלמידיו' },
  'sages.rel.opposed': { en: 'Opposed', he: 'חולקים' },
  'sages.rel.influences': { en: 'Influences', he: 'השפעות' },
  'sages.rel.family': { en: 'Family', he: 'משפחה' },
  'sages.section.contemporaries': {
    en: 'Other sages recorded in {gen}',
    he: 'חכמים נוספים הרשומים בדור {gen}',
  },
  'sages.section.academyOf': { en: 'Academy of {name}', he: 'ישיבת {name}' },
  'sages.section.placeMates': {
    en: 'Other sages associated with these places',
    he: 'חכמים נוספים הקשורים למקומות אלה',
  },
  'sages.section.events': { en: 'Events', he: 'אירועים' },
  'sages.section.contemporariesRecord': {
    en: 'Contemporaries (per record)',
    he: 'בני דורו (לפי הרשומה)',
  },
  'sages.section.wikipedia': { en: 'Wikipedia', he: 'ויקיפדיה' },
  'sages.wiki.noExtract': {
    en: 'No Wikipedia extract cached. Run to fetch.',
    he: 'אין תקציר ויקיפדיה שמור. הריצו כדי להביא.',
  },
  'sages.wiki.noPage': {
    en: 'No Wikipedia page found for this sage.',
    he: 'לא נמצא ערך ויקיפדיה לחכם זה.',
  },
  'sages.wiki.enPrefix': { en: 'en:', he: 'אנגלית:' },
  'sages.wiki.hePrefix': { en: 'he:', he: 'עברית:' },
  'sages.section.wikidata': { en: 'Wikidata', he: 'ויקינתונים' },
  'sages.wikidata.noRecord': {
    en: 'No Wikidata record cached. Run to fetch family/teacher/student QIDs.',
    he: 'אין רשומת ויקינתונים שמורה. הריצו כדי להביא מזהי QID של משפחה/רב/תלמיד.',
  },
  'sages.wd.father': { en: 'father', he: 'אב' },
  'sages.wd.mother': { en: 'mother', he: 'אם' },
  'sages.wd.spouses': { en: 'spouses', he: 'בני זוג' },
  'sages.wd.children': { en: 'children', he: 'ילדים' },
  'sages.wd.teachers': { en: 'teachers', he: 'רבותיו' },
  'sages.wd.students': { en: 'students', he: 'תלמידיו' },
  'sages.section.externalRefs': { en: 'External refs', he: 'מקורות חיצוניים' },
  'sages.refs.sefaria': { en: 'Sefaria', he: 'ספריא' },
  'sages.refs.wikipediaEn': { en: 'Wikipedia (en)', he: 'ויקיפדיה (אנגלית)' },
  'sages.refs.wikipediaHe': { en: 'Wikipedia (he)', he: 'ויקיפדיה (עברית)' },
  'sages.refs.jewishEncyclopedia': { en: 'Jewish Encyclopedia', he: 'האנציקלופדיה היהודית' },
  'sages.refs.wikidata': { en: 'Wikidata', he: 'ויקינתונים' },
  'sages.foot.enriched': { en: 'enriched {date}', he: 'הועשר {date}' },
  'sages.foot.sources': { en: 'sources: {sources}', he: 'מקורות: {sources}' },
  'sages.stage.run': { en: 'Run', he: 'הרצה' },
  'sages.stage.running': { en: 'Running…', he: 'רץ…' },
  'sages.stage.refresh': { en: 'Refresh', he: 'רענון' },
  'sages.stage.refreshing': { en: 'Refreshing…', he: 'מרענן…' },
  'sages.stage.refreshTitle': {
    en: 'Force refresh, bypass cache',
    he: 'רענון מאולץ, עקיפת המטמון',
  },
  'sages.stage.unified.desc': {
    en: 'Sefaria + LLM combined biographical record.',
    he: 'רשומה ביוגרפית משולבת של ספריא + מודל שפה.',
  },
  'sages.stage.wikidata.desc': {
    en: 'Family/teacher/student QIDs + birth/death years from Wikidata (no AI).',
    he: 'מזהי QID של משפחה/רב/תלמיד + שנות לידה/פטירה מוויקינתונים (ללא בינה מלאכותית).',
  },
  'sages.stage.wikiBio.desc': {
    en: 'Full Wikipedia (en/he) page extracts via MediaWiki (no AI).',
    he: 'תקצירי ערכי ויקיפדיה מלאים (אנגלית/עברית) דרך MediaWiki (ללא בינה מלאכותית).',
  },
  'sages.edge.source': { en: 'source: {source}', he: 'מקור: {source}' },
  'sages.edge.sourceWeight': {
    en: 'source: {source} · weight {weight}',
    he: 'מקור: {source} · משקל {weight}',
  },

  // — Settings page —
  'settings.title': { en: 'LLM Settings', he: 'הגדרות מודל שפה' },
  'settings.intro.before': {
    en: 'Effective default model + fallback chain. Code-configured (settings.ts, optionally the DEFAULT_LLM_MODEL env var) — this view is read-only. Most calls pin their own model per task. Per-call ',
    he: 'מודל ברירת המחדל ושרשרת הגיבוי בפועל. מוגדרים בקוד (settings.ts, ואופציונלית משתנה הסביבה DEFAULT_LLM_MODEL) — תצוגה זו לקריאה בלבד. רוב הקריאות נועלות מודל משלהן לכל משימה. דריסות ',
  },
  'settings.intro.after': {
    en: ' overrides on enrichment endpoints still win over these defaults.',
    he: ' פר-קריאה בנקודות הקצה של ההעשרה עדיין גוברות על ברירות המחדל האלה.',
  },
  'settings.source': { en: 'source: {source}', he: 'מקור: {source}' },
  'settings.section.catalog': { en: 'Model catalog', he: 'קטלוג מודלים' },
  'settings.section.defaultModel': { en: 'Default model', he: 'מודל ברירת מחדל' },
  'settings.section.fallbackChain': { en: 'Fallback chain', he: 'שרשרת גיבוי' },
  'settings.probing': { en: 'probing…', he: 'בודק…' },
  'settings.probePing': { en: 'probe (ping)', he: 'בדיקה (פינג)' },
  'settings.probe': { en: 'probe', he: 'בדיקה' },
  'settings.remove': { en: 'remove', he: 'הסרה' },
  'settings.moveUp': { en: 'Move up', he: 'הזזה למעלה' },
  'settings.moveDown': { en: 'Move down', he: 'הזזה למטה' },
  'settings.fallbackChain.hint': {
    en: 'Tried in order if the default model returns a retryable failure (HTTP 5xx, 429, 1031, 3046, network).',
    he: 'מנוסים לפי הסדר אם מודל ברירת המחדל מחזיר כשל הניתן לניסיון חוזר (HTTP 5xx, 429, 1031, 3046, רשת).',
  },
  'settings.fallbackChain.empty': { en: '(empty — no fallback)', he: '(ריק — ללא גיבוי)' },
  'settings.addToChain': { en: '+ add to fallback chain…', he: '+ הוספה לשרשרת הגיבוי…' },
  'settings.saving': { en: 'saving…', he: 'שומר…' },
  'settings.save': { en: 'save', he: 'שמירה' },
  'settings.savedAt': { en: 'saved {time}', he: 'נשמר {time}' },
  'settings.errorPrefix': { en: 'error: {msg}', he: 'שגיאה: {msg}' },
  'settings.lastSavedAtServer': {
    en: 'Last saved at server: {time}',
    he: 'נשמר לאחרונה בשרת: {time}',
  },
  'settings.loadFailed': {
    en: 'Failed to load settings: {error}',
    he: 'טעינת ההגדרות נכשלה: {error}',
  },

  // — Usage page —
  'usage.title': { en: 'Usage', he: 'שימוש' },
  'usage.backToDaf': { en: '← back to daf', he: '← חזרה לדף' },
  'usage.refresh': { en: 'Refresh', he: 'רענון' },
  'usage.refreshing': { en: 'Refreshing…', he: 'מרענן…' },
  'usage.loading': { en: 'Loading usage data…', he: 'טוען נתוני שימוש…' },
  'usage.loadFailed': { en: 'Failed to load: {error}', he: 'הטעינה נכשלה: {error}' },
  'usage.none': { en: 'None.', he: 'אין.' },
  'usage.noDataYet': { en: 'No data yet.', he: 'אין עדיין נתונים.' },
  'usage.col.stage': { en: 'Stage', he: 'שלב' },
  'usage.col.cached': { en: 'Cached', he: 'במטמון' },
  'usage.col.anchor': { en: 'Anchor', he: 'עוגן' },
  'usage.col.dafim': { en: 'Dafim', he: 'דפים' },
  'usage.col.enrichment': { en: 'Enrichment', he: 'העשרה' },
  'usage.col.mark': { en: 'Mark', he: 'סימון' },
  'usage.col.stale': { en: 'Stale', he: 'מיושן' },
  'usage.col.name': { en: 'Name', he: 'שם' },
  'usage.col.seen': { en: 'Seen', he: 'נצפה' },
  'usage.col.place': { en: 'Place', he: 'מקום' },
  'usage.col.kind': { en: 'Kind', he: 'סוג' },
  'usage.col.term': { en: 'Term', he: 'מונח' },
  'usage.col.category': { en: 'Category', he: 'קטגוריה' },
  'usage.col.model': { en: 'Model', he: 'מודל' },
  'usage.col.requests': { en: 'Requests', he: 'בקשות' },
  'usage.col.tokens': { en: 'Tokens', he: 'טוקנים' },
  'usage.col.cost': { en: 'Cost', he: 'עלות' },
  'usage.col.calls': { en: 'Calls', he: 'קריאות' },
  'usage.col.cacheHit': { en: 'Cache hit%', he: 'אחוז פגיעות מטמון' },
  'usage.col.errors': { en: 'Errors', he: 'שגיאות' },
  'usage.col.kinds': { en: 'Kinds', he: 'סוגים' },
  'usage.col.daf': { en: 'Daf', he: 'דף' },
  'usage.col.inOut': { en: 'In / Out $', he: 'קלט / פלט $' },
  // Tabs
  'usage.tab.cost': { en: 'Cost', he: 'עלות' },
  'usage.tab.activity': { en: 'Activity', he: 'פעילות' },
  'usage.tab.coverage': { en: 'Coverage', he: 'כיסוי' },
  'usage.tab.health': { en: 'Health', he: 'תקינות' },
  'usage.tab.backlog': { en: 'Backlog', he: 'מצבור' },
  'usage.tab.traffic': { en: 'Traffic', he: 'תנועה' },
  'usage.tab.contentIn': { en: 'Content-In', he: 'מקורות' },
  'usage.tab.contentOut': { en: 'Content-Out', he: 'תוצרים' },
  'usage.tab.mcp': { en: 'MCP', he: 'MCP' },
  'usage.surfaces.intro': {
    en: 'Requests that reached the worker, by surface: app (a browser on the site), mcp (through the MCP bridge), api (curl, servers, other sites). Warm pages are served from the edge cache and never reach the worker, so app is an undercount; Traffic has the true total.',
    he: 'בקשות שהגיעו ל-worker, לפי ערוץ: app (דפדפן באתר), mcp (דרך גשר ה-MCP), api (curl, שרתים, אתרים אחרים). דפים חמים מוגשים ממטמון הקצה ואינם מגיעים ל-worker, ולכן app הוא ספירת חסר; בלשונית תנועה הסכום האמיתי.',
  },
  'usage.surfaces.notConfigured': {
    en: 'Not configured: set CF_ANALYTICS_TOKEN (Account Analytics: Read) and CLOUDFLARE_ACCOUNT_ID.',
    he: 'לא מוגדר: יש להגדיר CF_ANALYTICS_TOKEN (Account Analytics: Read) ו-CLOUDFLARE_ACCOUNT_ID.',
  },
  'usage.surfaces.noData': { en: 'No rows yet ({error})', he: 'אין נתונים עדיין ({error})' },
  'usage.surfaces.mcpCalls': { en: 'MCP tool calls', he: 'קריאות כלי MCP' },
  'usage.surfaces.clients': { en: 'Distinct MCP callers', he: 'קוראי MCP שונים' },
  'usage.surfaces.connects': { en: 'MCP connects', he: 'חיבורי MCP' },
  'usage.surfaces.timeoutRate': { en: 'Timeouts (30 days)', he: 'פסקי זמן (30 יום)' },
  'usage.surfaces.ofCalls': { en: '{n} of {calls} calls', he: '{n} מתוך {calls} קריאות' },
  'usage.surfaces.trend': { en: 'Requests per day by surface', he: 'בקשות ליום לפי ערוץ' },
  'usage.surfaces.tools': { en: 'MCP tools (30 days)', he: 'כלי MCP (30 יום)' },
  'usage.surfaces.routes': {
    en: 'Routes called from MCP code (30 days)',
    he: 'נתיבים שנקראו מקוד MCP (30 יום)',
  },
  'usage.surfaces.errors': { en: 'Latest MCP failures (7 days)', he: 'כשלי MCP אחרונים (7 ימים)' },
  'usage.surfaces.none': { en: 'nothing yet', he: 'אין עדיין' },
  'usage.surfaces.col.tool': { en: 'Tool', he: 'כלי' },
  'usage.surfaces.col.ok': { en: 'OK', he: 'תקין' },
  'usage.surfaces.col.errors': { en: 'Errors', he: 'שגיאות' },
  'usage.surfaces.col.timeouts': { en: 'Timeouts', he: 'פסקי זמן' },
  'usage.surfaces.col.p50': { en: 'p50', he: 'p50' },
  'usage.surfaces.col.p95': { en: 'p95', he: 'p95' },
  'usage.surfaces.col.route': { en: 'Route', he: 'נתיב' },
  'usage.surfaces.col.hits': { en: 'Hits', he: 'קריאות' },
  // Traffic
  'usage.activity.reqPerVisitor': {
    en: '{requests} requests · {avg}/visitor',
    he: '{requests} בקשות · {avg}/מבקר',
  },
  // Content-In: sources (friendly names, dropping the cache key)
  'usage.sources.title': { en: 'Source material per daf', he: 'חומר מקור לכל דף' },
  'usage.sources.hint': {
    en: 'what we fetched + how well it aligned, of {count} dafim',
    he: 'מה נאסף + כמה יושר, מתוך {count} דפים',
  },
  'usage.sources.alignedTitle': {
    en: '{aligned} of {sampled} sampled cached dapim aligned',
    he: '{aligned} מתוך {sampled} דפים שנדגמו יושרו',
  },
  'usage.col.source': { en: 'Source', he: 'מקור' },
  'usage.col.aligned': { en: 'Aligned', he: 'מיושר' },
  'usage.col.hasContent': { en: 'Has content', he: 'יש תוכן' },
  // Content-Out mark-first tree
  'usage.tree.hint': {
    en: 'a mark, then the notes built on it — click to expand',
    he: 'סימון, ואז ההערות שנבנו עליו — לחצו להרחבה',
  },
  'usage.tree.enrichCount': { en: '{count} enrichments', he: '{count} העשרות' },
  'usage.tree.dependsOn': { en: 'Depends on', he: 'תלוי ב' },
  'usage.tree.dependsOnSources': { en: 'Sources', he: 'מקורות' },
  'usage.srcdep.context': { en: 'Context (all study aids)', he: 'הקשר (כל עזרי הלימוד)' },
  'usage.srcdep.contextLight': { en: 'Context (light)', he: 'הקשר (מצומצם)' },
  'usage.col.coverage': { en: 'Coverage', he: 'כיסוי' },
  'usage.tree.noEnrich': { en: 'No enrichments on this mark.', he: 'אין העשרות על סימון זה.' },
  'usage.global.title': {
    en: 'Global — enriched once, reused across every daf',
    he: 'גלובלי — מועשר פעם אחת, בשימוש חוזר בכל דף',
  },
  // Content-In per-piece labels (origin shown as a badge, not in the name)
  'usage.src.hb': { en: 'Daf page text', he: 'טקסט הדף' },
  'usage.src.gemara': { en: 'Daf text (aligned)', he: 'טקסט הדף (מיושר)' },
  'usage.src.commentaries': { en: 'Rashi + Tosafot', he: 'רש״י + תוספות' },
  'usage.src.rishonim': { en: 'Rishonim', he: 'ראשונים' },
  'usage.src.mishna': { en: 'Mishnah', he: 'משנה' },
  'usage.src.yerushalmi': { en: 'Yerushalmi', he: 'ירושלמי' },
  'usage.src.halacha-refs': { en: 'Halacha', he: 'הלכה' },
  'usage.src.daf-topics': { en: 'Topics', he: 'נושאים' },
  'usage.src.talmud-parallels': {
    en: 'Parallel sugyot (Mesorat HaShas)',
    he: 'סוגיות מקבילות (מסורת הש״ס)',
  },
  'usage.src.commentary-works': { en: 'Commentaries (all works)', he: 'מפרשים (כל החיבורים)' },
  'usage.src.pasuk': { en: 'Tanach verses', he: 'פסוקי תנ״ך' },
  'usage.src.rabbi-enriched': { en: 'Rabbi topics', he: 'נושאי חכמים' },
  'usage.src.rabbi-bio-sefaria': { en: 'Rabbi bios (Sefaria)', he: 'ביוגרפיות חכמים (ספריא)' },
  'usage.src.rabbi-bio-wiki': { en: 'Rabbi bios (Wikipedia)', he: 'ביוגרפיות חכמים (ויקיפדיה)' },
  'usage.src.rabbi-places': { en: 'Rabbi places', he: 'מקומות החכמים' },
  'usage.src.geo-coords': {
    en: 'Place coordinates (hand-curated)',
    he: 'נקודות ציון של מקומות (ידני)',
  },
  'usage.src.basemap': { en: 'Map basemap (Natural Earth)', he: 'מפת בסיס (Natural Earth)' },
  'usage.src.rabbi-family': { en: 'Rabbi family relations', he: 'קשרי משפחה של חכמים' },
  'usage.src.rabbi-hierarchy': { en: 'Rabbi teacher–student edges', he: 'קשרי רב–תלמיד' },
  'usage.src.rabbi-orientation': { en: 'Rabbi orientation', he: 'נטיית החכמים' },
  'usage.src.yerushalmi-curated': {
    en: 'Yerushalmi parallels (curated)',
    he: 'מקבילות ירושלמי (ידני)',
  },
  'usage.src.dy': { en: 'DafYomi notes (all)', he: 'הערות דף יומי (הכול)' },
  'usage.src.dy.insights': { en: 'Insights', he: 'תובנות' },
  'usage.src.dy.background': { en: 'Background', he: 'רקע' },
  'usage.src.dy.halacha': { en: 'Halacha (brief)', he: 'הלכה (תמצית)' },
  'usage.src.dy.tosfos': { en: 'Tosfos', he: 'תוספות' },
  'usage.src.dy.review': { en: 'Review', he: 'חזרה' },
  'usage.src.dy.points': { en: 'Points', he: 'נקודות' },
  'usage.src.dy.hebcharts': { en: 'Charts', he: 'טבלאות' },
  'usage.src.dy.yerushalmi': { en: 'Yerushalmi', he: 'ירושלמי' },
  'usage.src.dy.revach': { en: "Revach l'Daf", he: 'רווח לדף' },
  'usage.source.hebrewbooks.hint': { en: 'page text', he: 'טקסט הדף' },
  'usage.source.gemara.hint': { en: 'aligned reference text', he: 'טקסט מיושר' },
  'usage.source.commentaries.hint': { en: 'aligned commentaries', he: 'מפרשים מיושרים' },
  'usage.source.dafyomi': { en: 'DafYomi notes', he: 'הערות דף יומי' },
  'usage.source.dafyomi.hint': { en: 'study notes', he: 'חומר לימוד' },
  // Content-Out: English / Hebrew section labels
  'usage.lang.english': { en: 'English', he: 'אנגלית' },
  'usage.lang.hebrew': { en: 'Hebrew', he: 'עברית' },
  // Health sections + plain run names (retire "studio")
  'usage.health.speed': { en: 'Speed', he: 'מהירות' },
  'usage.health.cache': { en: 'Cache efficiency', he: 'יעילות מטמון' },
  'usage.health.errors': { en: 'Errors', he: 'שגיאות' },
  'usage.run.mark': { en: 'Marks', he: 'סימונים' },
  'usage.run.enrichment': { en: 'Enrichments', he: 'העשרות' },
  'usage.run.adhoc': { en: 'Ad-hoc', he: 'אד-הוק' },
  'usage.run.translate': { en: 'Translations', he: 'תרגומים' },
  'usage.cacheStat.hitRate': { en: 'Cache hit rate', he: 'שיעור פגיעות מטמון' },
  'usage.cacheStat.hitRate.sub': {
    en: '{hits} of {calls} served from cache',
    he: '{hits} מתוך {calls} הוגשו מהמטמון',
  },
  'usage.cacheStat.stale': { en: 'Stale entries', he: 'רשומות מיושנות' },
  'usage.cacheStat.stale.sub': { en: 'on a superseded version', he: 'בגרסה שהוחלפה' },
  // Cost: input/output split + cache savings
  'usage.stat.inOut': { en: 'Input / Output $', he: 'קלט / פלט $' },
  'usage.stat.inOut.sub': { en: 'est. list-price split', he: 'פיצול לפי מחירון (אומדן)' },
  'usage.stat.costAvoided': { en: 'Saved by cache', he: 'נחסך ע״י מטמון' },
  'usage.stat.costAvoided.sub': {
    en: '{count} recent cache hits',
    he: '{count} פגיעות מטמון אחרונות',
  },
  // By-daf cost table + per-daf drill-down
  'usage.byDaf.title': { en: 'Cost by daf', he: 'עלות לפי דף' },
  'usage.byDaf.sub': {
    en: 'recent spend (last 7 days) — click a daf to trace it',
    he: 'הוצאה אחרונה (7 ימים) — לחצו על דף למעקב',
  },
  'usage.byDaf.empty': {
    en: 'No per-daf spend recorded in the recent window yet.',
    he: 'לא נרשמה הוצאה לפי דף בחלון האחרון.',
  },
  // Redesigned cost headline + charts.
  'usage.cost.total': { en: 'Total spent', he: 'סך הכול' },
  'usage.cost.total.lifetime': { en: 'lifetime, billed', he: 'לכל הזמן, מחויב' },
  'usage.cost.total.tracked': { en: 'tracked to date', he: 'נרשם עד כה' },
  'usage.cost.remaining': { en: 'Left to finish Shas', he: 'להשלמת הש״ס' },
  'usage.cost.remaining.sub': {
    en: 'of ~{full} full depth (est.)',
    he: 'מתוך ~{full} עומק מלא (הערכה)',
  },
  'usage.cost.remaining.pending': { en: 'awaiting coverage data', he: 'ממתין לנתוני כיסוי' },
  'usage.cost.perDaf30': { en: 'Cost per daf', he: 'עלות לדף' },
  'usage.cost.perDaf30.sub': { en: '30-day rolling avg', he: 'ממוצע נע 30 יום' },
  'usage.cost.warmed': { en: 'Full-depth done', he: 'הושלם בעומק מלא' },
  'usage.cost.warmed.sub': {
    en: 'anchors ~100%; deep enrichments lag',
    he: 'עוגנים ~100%; העשרות עומק מפגרות',
  },
  'usage.cost.warmed.pending': { en: 'awaiting coverage data', he: 'ממתין לנתוני כיסוי' },
  'usage.chart.spend.title': { en: 'Spend over time', he: 'הוצאה לאורך זמן' },
  'usage.chart.spend.sub': { en: 'cost per day', he: 'עלות ליום' },
  'usage.chart.perDaf.title': { en: 'Cost per daf over time', he: 'עלות לדף לאורך זמן' },
  'usage.chart.perDaf.sub': { en: 'daily average', he: 'ממוצע יומי' },
  'usage.chart.needData': { en: 'Not enough data yet.', he: 'אין עדיין מספיק נתונים.' },
  'usage.chart.range.30': { en: '30d', he: '30 יום' },
  'usage.chart.range.90': { en: '90d', he: '90 יום' },
  'usage.chart.range.all': { en: 'All', he: 'הכל' },
  'usage.chart.estimated': { en: 'estimated', he: 'משוער' },
  'usage.chart.timeSeries': { en: 'Time series', he: 'נתונים לאורך זמן' },
  'usage.chart.measured': { en: 'measured', he: 'נמדד' },
  'usage.chart.est': { en: 'est.', he: 'משוער' },
  'usage.byProducer.title': { en: 'Spend by producer', he: 'הוצאה לפי מפיק' },
  'usage.byProducer.sub': { en: '{count} producers, marks + enrichments', he: '{count} מפיקים' },
  'usage.byProducer.other': { en: 'other', he: 'אחר' },
  'usage.cost.detail.title': { en: 'Billing & projection details', he: 'פירוט חיוב ותחזית' },
  'usage.cost.detail.sub': {
    en: 'provider totals, windows, per-producer shas projection',
    he: 'סכומי ספק, חלונות, תחזית לפי מפיק',
  },
  'usage.activity.countryCount': { en: '{count} countries', he: '{count} מדינות' },
  'usage.daf.permanentTitle': {
    en: 'Generation cost by mark (from the permanent cache)',
    he: 'עלות יצירה לפי סימון (מהמטמון הקבוע)',
  },
  'usage.daf.empty': {
    en: 'No stamped mark costs cached for this daf.',
    he: 'אין עלויות סימון מוטבעות במטמון לדף זה.',
  },
  'usage.daf.col.mark': { en: 'Mark', he: 'סימון' },
  'usage.daf.col.current': { en: 'Current ver.', he: 'גרסה נוכחית' },
  'usage.daf.col.superseded': { en: 'Old vers.', he: 'גרסאות ישנות' },
  'usage.daf.total': { en: 'Total', he: 'סך הכול' },
  'usage.pipeline.title': { en: 'Per-daf pipeline coverage', he: 'כיסוי צנרת לכל דף' },
  'usage.pipeline.hint': { en: 'of {count} dafim in the shas', he: 'מתוך {count} דפים בש״ס' },
  'usage.source.hebrewbooks': { en: 'Daf Source 1', he: 'מקור דף 1' },
  'usage.source.gemara': { en: 'Daf Source 2', he: 'מקור דף 2' },
  'usage.source.commentaries': { en: 'Rashi + Tosafot', he: 'רש״י + תוספות' },
  'usage.anchors.title': { en: 'Anchors per daf', he: 'עוגנים לכל דף' },
  'usage.anchors.hint': {
    en: 'click a row to see cache versions',
    he: 'לחצו על שורה לצפייה בגרסאות המטמון',
  },
  'usage.anchors.empty': { en: 'No marks registered.', he: 'אין סימונים רשומים.' },
  'usage.localEnrich.title': { en: 'Local enrichments', he: 'העשרות מקומיות' },
  'usage.localEnrich.hint': {
    en: 'per mark-instance, per daf — depth on top of anchors',
    he: 'לכל מופע סימון, לכל דף — עומק מעל העוגנים',
  },
  'usage.localEnrich.empty': {
    en: 'No local enrichments registered.',
    he: 'אין העשרות מקומיות רשומות.',
  },
  'usage.staleBadge': { en: '{count} stale', he: '{count} מיושנים' },
  'usage.heBadge': { en: '{count} he', he: '{count} עברית' },
  'usage.heRow': { en: 'Hebrew', he: 'עברית' },
  'usage.version.current': { en: '(current) — {count} dafim', he: '(נוכחי) — {count} דפים' },
  'usage.version.noSuperseded': {
    en: 'No superseded versions in cache.',
    he: 'אין גרסאות מוחלפות במטמון.',
  },
  'usage.version.supersededHeading': {
    en: 'Superseded versions still in KV (orphaned — safe to purge):',
    he: 'גרסאות מוחלפות שעדיין ב-KV (יתומות — ניתן למחוק בבטחה):',
  },
  'usage.version.entries': { en: '{count} entries', he: '{count} רשומות' },
  'usage.globalRepo.title': { en: 'Global repository', he: 'מאגר גלובלי' },
  'usage.globalRepo.hint': {
    en: 'enriched once, reused across every daf',
    he: 'מועשר פעם אחת, נעשה בו שימוש חוזר בכל דף',
  },
  'usage.rabbiCoverage.title': { en: 'Rabbi dataset coverage', he: 'כיסוי מאגר החכמים' },
  'usage.rabbiCoverage.sub': {
    en: '· bundled JSON, {count} rabbis',
    he: '· JSON מצורף, {count} חכמים',
  },
  'usage.rabbi.bio': { en: 'Bio (any source)', he: 'ביוגרפיה (כל מקור)' },
  'usage.rabbi.sefariaBio': { en: 'Sefaria bio', he: 'ביוגרפיה מספריא' },
  'usage.rabbi.sefariaBio.hint': {
    en: 'from Sefaria PersonTopic API',
    he: 'מ-API של ספריא (PersonTopic)',
  },
  'usage.rabbi.wiki': { en: 'Hebrew Wikipedia', he: 'ויקיפדיה העברית' },
  'usage.rabbi.wiki.hint': { en: 'Hebrew Wikipedia page linked', he: 'קושר לדף בויקיפדיה העברית' },
  'usage.rabbi.generation': { en: 'Generation identified', he: 'דור מזוהה' },
  'usage.rabbi.region': { en: 'Region (E.Y. / Bavel)', he: 'אזור (ארץ ישראל / בבל)' },
  'usage.rabbi.places': { en: 'Places (cities)', he: 'מקומות (ערים)' },
  'usage.rabbi.chain': { en: 'Chain of tradition', he: 'שלשלת המסורה' },
  'usage.rabbi.chain.hint': { en: 'teacher / student / contemporary', he: 'רב / תלמיד / בן דור' },
  'usage.rabbi.family': { en: 'Familial relations', he: 'קשרי משפחה' },
  'usage.rabbi.family.hint': {
    en: 'father / mother / spouse / child / sibling',
    he: 'אב / אם / בן זוג / ילד / אח',
  },
  'usage.rabbi.orientation': { en: 'Orientation', he: 'נטייה' },
  'usage.rabbi.orientation.hint': {
    en: 'mystical / practical / mixed',
    he: 'מיסטית / מעשית / מעורבת',
  },
  'usage.globalEnrich.title': { en: 'Global enrichments cached', he: 'העשרות גלובליות במטמון' },
  'usage.globalEnrich.sub': {
    en: '· the pool of pre-generated context to pull from',
    he: '· מאגר ההקשר שנוצר מראש לשליפה',
  },
  'usage.globalEnrich.empty': {
    en: 'No global enrichments registered.',
    he: 'אין העשרות גלובליות רשומות.',
  },
  'usage.globalEnrich.noGazetteer': {
    en: 'Note: there is no global places gazetteer yet — place enrichments are LLM-inferred per sighting. The backlog below is the seed for one.',
    he: 'הערה: אין עדיין מאגר מקומות גלובלי — העשרות המקומות מוסקות על ידי המודל לכל אזכור. המצבור שלהלן הוא הזרע למאגר כזה.',
  },
  'usage.globalEnrich.concepts': {
    en: 'Concepts: {count} distinct background terms observed · no canonical glossary yet (the backlog below is the seed for one).',
    he: 'מונחים: {count} מונחי רקע ייחודיים שנצפו · אין עדיין מילון מונחים קנוני (המצבור שלהלן הוא הזרע למאגר כזה).',
  },
  'usage.backlog.title': { en: 'Needs global enrichment', he: 'דרושה העשרה גלובלית' },
  'usage.backlog.hint': {
    en: 'entities seen in the app that have no global record yet — grows as users explore',
    he: 'ישויות שנצפו באפליקציה ואין להן עדיין רשומה גלובלית — גדל ככל שמשתמשים מתעמקים',
  },
  'usage.backlog.combined': {
    en: '{count} distinct entities awaiting global context (rabbis + places + concepts).',
    he: '{count} ישויות ייחודיות הממתינות להקשר גלובלי (חכמים + מקומות + מונחים).',
  },
  'usage.backlog.rabbis.title': { en: 'Rabbis not in dataset', he: 'חכמים שאינם במאגר' },
  'usage.backlog.distinct': { en: '· {count} distinct', he: '· {count} ייחודיים' },
  'usage.backlog.rabbis.empty': {
    en: 'None yet — every rabbi seen so far resolved to the dataset.',
    he: 'אין עדיין — כל חכם שנצפה עד כה זוהה במאגר.',
  },
  'usage.backlog.places.title': { en: 'Places observed', he: 'מקומות שנצפו' },
  'usage.backlog.places.distinct': {
    en: '· {count} distinct (no gazetteer)',
    he: '· {count} ייחודיים (ללא מאגר מקומות)',
  },
  'usage.backlog.places.empty': { en: 'No places observed yet.', he: 'לא נצפו עדיין מקומות.' },
  'usage.backlog.concepts.title': { en: 'Concepts observed', he: 'מונחים שנצפו' },
  'usage.backlog.concepts.distinct': {
    en: '· {count} distinct (no glossary)',
    he: '· {count} ייחודיים (ללא מילון מונחים)',
  },
  'usage.backlog.concepts.empty': { en: 'No concepts observed yet.', he: 'לא נצפו עדיין מונחים.' },
  'usage.cost.title': { en: 'Cost', he: 'עלות' },
  'usage.cost.hint': {
    en: 'two sources — AI Gateway is authoritative; self-tracked attributes spend per mark/enrichment',
    he: 'שני מקורות — AI Gateway הוא המקור הסמכותי; המעקב העצמי מייחס הוצאה לכל סימון/העשרה',
  },
  'usage.aigw.title': { en: 'AI Gateway', he: 'AI Gateway' },
  'usage.aigw.sub': {
    en: '· provider-reported, last 30d',
    he: '· מדווח על ידי הספק, 30 הימים האחרונים',
  },
  // Reframed cost view: a billed total + our own windowed tracking.
  'usage.cost.billed.title': { en: 'Total spent', he: 'סך ההוצאה' },
  'usage.cost.billed.sub': {
    en: 'current Talmud key · completed UTC days',
    he: 'מפתח התלמוד הנוכחי · ימי UTC שהסתיימו',
  },
  'usage.stat.lifetime': { en: 'Lifetime', he: 'מאז ומתמיד' },
  'usage.cost.lifetimeSub': {
    en: 'current Talmud key, including today',
    he: 'מפתח התלמוד הנוכחי, כולל היום',
  },
  'usage.cost.gatewayApprox': {
    en: 'approx · gateway-estimated',
    he: 'משוער · לפי ה-Gateway',
  },
  'usage.cost.gatewayCompare.title': {
    en: 'AI Gateway estimate: {cost}',
    he: 'אומדן AI Gateway: {cost}',
  },
  'usage.cost.gatewayCompare.sub': {
    en: 'gateway estimate · its own date range',
    he: 'אומדן ה-Gateway · טווח תאריכים משלו',
  },
  'usage.or.queryFailed': {
    en: 'OpenRouter query failed: {error}',
    he: 'שאילתת OpenRouter נכשלה: {error}',
  },
  'usage.or.notConfigured.before': {
    en: 'Showing the AI Gateway estimate — it under-prices price-routed models. For the real billed total, set an OpenRouter management key via ',
    he: 'מוצג אומדן ה-AI Gateway — הוא מתמחר בחסר מודלים מנותבים. לקבלת הסכום המחויב האמיתי, הגדירו מפתח ניהול של OpenRouter באמצעות ',
  },
  'usage.or.notConfigured.after': { en: '.', he: '.' },
  'usage.cost.tracked.title': { en: 'Our tracking', he: 'המעקב שלנו' },
  'usage.cost.tracked.sub': {
    en: 'priced models · per producer',
    he: 'מודלים מתומחרים · לכל מפיק',
  },
  'usage.cost.tracked.subSince': {
    en: 'priced models · since {date}',
    he: 'מודלים מתומחרים · מאז {date}',
  },
  'usage.cost.win7': { en: 'Last 7 days', he: '7 ימים אחרונים' },
  'usage.cost.win30': { en: 'Last 30 days', he: '30 ימים אחרונים' },
  'usage.cost.winAll': { en: 'All time', he: 'מאז ומתמיד' },
  'usage.cost.winCalls': { en: '{count} calls', he: '{count} קריאות' },
  'usage.cost.applicationKey': { en: 'Talmud · current key', he: 'תלמוד · המפתח הנוכחי' },
  'usage.cost.billingUnavailable': {
    en: 'Application billing unavailable',
    he: 'נתוני החיוב של היישום אינם זמינים',
  },
  'usage.cost.historicalTracking': {
    en: 'Historical app records are estimates and may include retired keys. They cannot yet be reconciled with the current-key bill.',
    he: 'רישומי העבר של היישום הם אומדנים ועשויים לכלול מפתחות קודמים. עדיין אי אפשר להתאים אותם לחשבון של המפתח הנוכחי.',
  },
  'usage.aigw.queryFailed': {
    en: 'AI Gateway query failed: {error}',
    he: 'שאילתת AI Gateway נכשלה: {error}',
  },
  'usage.aigw.notConfigured.before': {
    en: 'Not configured. Set a Cloudflare API token (Account Analytics: Read) via ',
    he: 'לא הוגדר. הגדירו טוקן API של Cloudflare (Account Analytics: Read) באמצעות ',
  },
  'usage.aigw.notConfigured.after': {
    en: ' to pull authoritative spend. ({error})',
    he: ' כדי למשוך נתוני הוצאה סמכותיים. ({error})',
  },
  'usage.stat.totalCost': { en: 'Total cost', he: 'עלות כוללת' },
  'usage.stat.requests': { en: 'Requests', he: 'בקשות' },
  'usage.stat.tokensIn': { en: 'Tokens in', he: 'טוקנים נכנסים' },
  'usage.stat.tokensOut': { en: 'Tokens out', he: 'טוקנים יוצאים' },
  'usage.selfTracked.title': { en: 'Self-tracked', he: 'מעקב עצמי' },
  'usage.selfTracked.sub': {
    en: '· daily rollups, priced models only',
    he: '· סיכומים יומיים, מודלים מתומחרים בלבד',
  },
  'usage.selfTracked.subSince': {
    en: '· daily rollups, priced models only · since {date}',
    he: '· סיכומים יומיים, מודלים מתומחרים בלבד · מאז {date}',
  },
  'usage.selfTracked.empty': { en: 'No usage recorded yet.', he: 'לא נרשם עדיין שימוש.' },
  'usage.stat.costPriced': { en: 'Cost (priced)', he: 'עלות (מתומחר)' },
  'usage.stat.pricedCalls': { en: '{count} priced calls', he: '{count} קריאות מתומחרות' },
  'usage.stat.unpricedCalls': { en: 'Unpriced calls', he: 'קריאות לא מתומחרות' },
  'usage.stat.unpricedCalls.sub': {
    en: 'Workers AI — in the billed total',
    he: 'Workers AI — כלול בסך המחויב',
  },
  'usage.stat.llmCalls': { en: 'LLM calls', he: 'קריאות למודל' },
  'usage.stat.errored': { en: '{count} errored', he: '{count} נכשלו' },
  'usage.stat.tokens': { en: 'Tokens', he: 'טוקנים' },
  'usage.stat.tokensInOut': { en: '{in} in / {out} out', he: '{in} נכנסים / {out} יוצאים' },
  'usage.shas.title': { en: 'Cost to warm all of shas', he: 'עלות חימום כל הש״ס' },
  'usage.shas.sub': {
    en: '· estimate · every producer × {amudim} amudim',
    he: '· אומדן · כל מפיק × {amudim} עמודים',
  },
  'usage.shas.full': { en: 'Full-depth shas', he: 'ש״ס מלא' },
  'usage.shas.perAmud': { en: 'Avg / amud', he: 'ממוצע / עמוד' },
  'usage.shas.spent': { en: 'Spent so far', he: 'הוצא עד כה' },
  'usage.shas.remaining': { en: 'Remaining', he: 'נותר' },
  'usage.shas.note': {
    en: 'Estimate: each producer’s avg $/priced call × how often it fires per amud × {amudim} amudim, grossed up ×{gross} for Workers AI (billed but unpriced per-producer). Coverage is uneven, so most of the remaining cost is the lightly-warmed long tail. The billed total above is authoritative for money actually spent.',
    he: 'אומדן: עלות ממוצעת לקריאה מתומחרת לכל מפיק × תדירות ההפעלה לעמוד × {amudim} עמודים, מוגדל פי {gross} עבור Workers AI (מחויב אך לא מתומחר ברמת המפיק). הכיסוי אינו אחיד, ולכן רוב העלות שנותרה היא הזנב הארוך שחומם מעט. הסכום המחויב למעלה הוא המקור הסמכותי להוצאה בפועל.',
  },
  'usage.shas.col.producer': { en: 'Producer', he: 'מפיק' },
  'usage.shas.col.perCall': { en: '$/call', he: '$/קריאה' },
  'usage.shas.col.firesPerAmud': { en: '/amud', he: '/עמוד' },
  'usage.shas.col.spent': { en: 'Spent', he: 'הוצא' },
  'usage.shas.col.remaining': { en: 'Remaining', he: 'נותר' },
  'usage.shas.col.full': { en: 'Full shas', he: 'ש״ס מלא' },
  'usage.shas.more': { en: '+{count} more producers', he: '+{count} מפיקים נוספים' },
  'usage.shas.empty': {
    en: 'Not enough data yet — needs priced spend and cache coverage.',
    he: 'אין עדיין מספיק נתונים — נדרשת הוצאה מתומחרת וכיסוי מטמון.',
  },
  'usage.byMark': { en: 'By mark', he: 'לפי סימון' },
  'usage.byEnrichment': { en: 'By enrichment', he: 'לפי העשרה' },
  'usage.byModel': { en: 'By model', he: 'לפי מודל' },
  'usage.byModel.sub': { en: '{count} rows — click to expand', he: '{count} שורות — לחצו להרחבה' },
  'usage.shas.breakdown': { en: 'Per-producer breakdown', he: 'פירוט לפי מפיק' },
  'usage.callsCount': { en: '{count} calls', he: '{count} קריאות' },
  'usage.unpriced': { en: 'unpriced', he: 'לא מתומחר' },
  'usage.latency.byEndpoint': {
    en: 'By type · {count} recent calls',
    he: 'לפי סוג · {count} קריאות אחרונות',
  },
  'usage.latency.slowest': { en: 'Slowest producers', he: 'המפיקים האיטיים' },
  'usage.latency.barsHint': {
    en: 'p95 latency · tick = p50 · hit% · calls',
    he: 'זמן p95 · סימן = p50 · אחוז מטמון · קריאות',
  },
  'usage.latency.byMark': { en: 'Marks', he: 'סימונים' },
  'usage.latency.byMark.hint': { en: 'per mark, across all runs', he: 'לכל סימון, בכל ההרצות' },
  'usage.table.empty': { en: 'Nothing yet.', he: 'עדיין ריק.' },
  'usage.table.showMore': { en: 'Show all ({count} more)', he: 'הצג הכול (עוד {count})' },
  'usage.table.showLess': { en: 'Show less', he: 'הצג פחות' },
  'usage.errors.byReason': { en: 'By reason', he: 'לפי סיבה' },
  'usage.lint.byProducer': { en: 'By producer', he: 'לפי מפיק' },
  'usage.lint.col.issues': { en: 'Issues', he: 'בעיות' },
  'usage.lint.col.producer': { en: 'Producer', he: 'מפיק' },
  'usage.latency.byEnrichment': { en: 'Enrichments', he: 'העשרות' },
  'usage.latency.byEnrichment.hint': {
    en: 'per enrichment, across all runs',
    he: 'לכל העשרה, בכל ההרצות',
  },
  'usage.recentErrors.title': { en: 'Recent errors', he: 'שגיאות אחרונות' },
  'usage.recentErrors.hint': { en: 'from request telemetry', he: 'מתוך טלמטריית הבקשות' },
  'usage.errorKind.other': { en: 'other', he: 'אחר' },
  'usage.errors.col.when': { en: 'When', he: 'מתי' },
  'usage.errors.col.where': { en: 'Where', he: 'היכן' },
  'usage.errors.col.kind': { en: 'Kind', he: 'סוג' },
  'usage.errors.col.job': { en: 'Job', he: 'משימה' },
  'usage.errors.col.error': { en: 'Error', he: 'שגיאה' },
  'usage.jobErrors.title': { en: 'Queue job failures ({count})', he: 'כשלי משימות בתור ({count})' },
  'usage.jobErrors.hint': {
    en: 'hard exceptions in the enrichment queue consumer',
    he: 'חריגות קשות בצרכן תור ההעשרה',
  },
  'usage.lintFailures.title': { en: 'Lint failures ({count})', he: 'כשלי בדיקת סגנון ({count})' },
  'usage.lintFailures.hint': {
    en: 'cards pinned after repeated gloss-style / Hebrew-anchor lint failures',
    he: 'כרטיסים שננעלו לאחר כשלים חוזרים בבדיקת סגנון/עוגן עברי',
  },
  'usage.bugReports.title': { en: 'Bug reports ({count})', he: 'דיווחי תקלות ({count})' },
  'usage.bugReports.empty': { en: 'Inbox empty.', he: 'תיבת הדואר ריקה.' },
  // Actionable bug reports at the top of Backlog
  'usage.reports.title': { en: 'User reports ({count})', he: 'דיווחי משתמשים ({count})' },
  'usage.reports.empty': {
    en: 'No open reports — nicely done.',
    he: 'אין דיווחים פתוחים — כל הכבוד.',
  },
  'usage.reports.doneTitle': { en: 'Done ({count})', he: 'טופלו ({count})' },
  'usage.reports.markDone': { en: 'Mark done', he: 'סמן כטופל' },
  'usage.reports.restore': { en: 'Restore', he: 'שחזר' },
  'usage.notTracked': { en: 'not tracked', he: 'לא במעקב' },
  'usage.missing': { en: '{count} missing', he: '{count} חסרים' },
  'usage.activity.title': { en: 'Activity', he: 'פעילות' },
  'usage.activity.hint': {
    en: 'Cloudflare edge requests — whole zone (≈the app); requests include bots & crawlers, visitors are deduped',
    he: 'בקשות מקצה Cloudflare — כל האזור (בקירוב האפליקציה); בקשות כוללות בוטים וזחלנים, מבקרים ללא כפילויות',
  },
  'usage.activity.today': { en: 'Today', he: 'היום' },
  'usage.activity.week': { en: 'Last 7 days', he: '7 ימים אחרונים' },
  'usage.activity.month': { en: 'Last 30 days', he: '30 ימים אחרונים' },
  'usage.activity.requests': { en: 'requests', he: 'בקשות' },
  'usage.activity.visits': { en: '{count} visitors', he: '{count} מבקרים' },
  'usage.activity.trend': { en: 'Daily requests', he: 'בקשות יומיות' },
  'usage.activity.fromWhere': { en: 'From where', he: 'מאיפה' },
  'usage.activity.unknownCountry': { en: 'Unknown', he: 'לא ידוע' },
  'usage.activity.queryFailed': {
    en: 'Activity query failed: {error}',
    he: 'שאילתת הפעילות נכשלה: {error}',
  },
  'usage.activity.notConfigured.before': {
    en: 'Not configured. Set a Cloudflare API token (Zone Analytics: Read) via ',
    he: 'לא הוגדר. הגדירו טוקן API של Cloudflare (Zone Analytics: Read) באמצעות ',
  },
  'usage.activity.notConfigured.after': {
    en: ' plus CF_ZONE_TAG to see app traffic. ({error})',
    he: ' ובנוסף CF_ZONE_TAG כדי לראות את תנועת האפליקציה. ({error})',
  },
  'usage.group.telemetry': { en: 'Telemetry & latency', he: 'טלמטריה וזמני תגובה' },
  'usage.group.telemetry.hint': {
    en: 'recent request timing & errors',
    he: 'תזמון ושגיאות של בקשות אחרונות',
  },
  'usage.group.errors': { en: 'Errors & reports', he: 'שגיאות ודיווחים' },
  'usage.group.errors.hint': {
    en: 'queue failures & user bug reports',
    he: 'כשלי תור ודיווחי תקלות ממשתמשים',
  },

  // — Halacha body —
  'halacha.codification': { en: 'In the codes', he: 'בפוסקים' },
  'halacha.note': { en: 'Note', he: 'הערה' },
  'halacha.basis': { en: 'Based on', he: 'על פי' },
  'halacha.codes.none': {
    en: 'No Rambam, Tur or Shulchan Aruch is linked to these lines of the daf.',
    he: 'אין רמב״ם, טור או שולחן ערוך המקושרים לשורות אלה בדף.',
  },
  'halacha.codes.near': { en: 'Linked from a nearby line', he: 'מקושר משורה סמוכה' },
  'halacha.codes.einMishpat': { en: 'Ein Mishpat', he: 'עין משפט' },
  'halacha.codes.more': { en: 'Show full text', he: 'הצג את כל הלשון' },
  'halacha.codes.less': { en: 'Show less', he: 'הצג פחות' },
  'halacha.dispute': { en: 'Where practice splits', he: 'היכן ההלכה נחלקת' },
  'halacha.practical': { en: 'Practical', he: 'למעשה' },
  'halacha.disputes': { en: 'Disputes', he: 'מחלוקות' },
  // Codification source labels (the פסיקה rows).
  'source.mishnehTorah': { en: 'Mishneh Torah', he: 'משנה תורה' },
  'source.tur': { en: 'Tur', he: 'טור' },
  'source.shulchanAruch': { en: 'Shulchan Aruch', he: 'שולחן ערוך' },
  'source.rema': { en: 'Rema', he: 'רמ״א' },
  // Codification-map node labels (the lineage cards: Gemara → Rambam → … → Rema).
  'source.gemara': { en: 'Gemara', he: 'גמרא' },
  'source.rambam': { en: 'Rambam', he: 'רמב״ם' },
  'source.mechaber': { en: 'Mechaber', he: 'מחבר' },
  'source.badge': { en: 'source', he: 'מקור' },
  // Halacha derivation (מקורות בש״ס) source-role badges + the current-daf marker.
  // Dispute axis chips (מחלוקות).
  'axis.mechaber-rema': { en: 'Mechaber–Rema', he: 'מחבר–רמ״א' },
  'axis.ashkenaz-sefarad': { en: 'Ashkenaz–Sefarad', he: 'אשכנז–ספרד' },
  'axis.rishonim': { en: 'Rishonim', he: 'ראשונים' },
  'axis.acharonim': { en: 'Acharonim', he: 'אחרונים' },
  'axis.poskim': { en: 'Poskim', he: 'פוסקים' },
  'axis.modern': { en: 'Modern', he: 'מודרני' },
  'axis.other': { en: 'Other', he: 'אחר' },
  'halacha.lechatchila': { en: 'Lechatchila', he: 'לכתחילה' },
  'halacha.bedieved': { en: 'Bedieved', he: 'בדיעבד' },
  'halacha.appliesWhen': { en: 'Applies when', he: 'חל כאשר' },
  'halacha.exceptions': { en: 'Exceptions', he: 'יוצאים מן הכלל' },

  // — Pasuk body —
  'pasuk.loading': { en: 'Leining the parsha…', he: 'קורא בפרשה…' },
  'pasuk.verses.hide': { en: 'Hide surrounding verses', he: 'הסתרת הפסוקים הסמוכים' },
  'pasuk.verses.show': { en: 'Show verse before + after', he: 'הצגת הפסוק שלפני ושאחרי' },
  'pasuk.tanachContext': { en: 'Tanach context', he: 'הקשר בתנ״ך' },
  'pasuk.whyHere': { en: 'Why here', he: 'מדוע כאן' },
  'pasuk.mechanism': { en: 'Mechanism', he: 'מנגנון הדרשה' },
  'pasuk.landing': { en: 'Landing', he: 'מסקנה' },

  // — Yerushalmi body —
  'yerushalmi.differences': { en: 'Differences from the Yerushalmi', he: 'הבדלים מן הירושלמי' },
  'yerushalmi.autoAligned': { en: 'auto-aligned', he: 'יושר אוטומטית' },
  'yerushalmi.readOnSefaria': {
    en: 'Read the full Yerushalmi on Sefaria',
    he: 'קרא את הירושלמי המלא בספריא',
  },
  'yerushalmi.curatedParallel': { en: 'Curated parallel (Sefaria)', he: 'מקבילה נבחרת (ספריא)' },

  // — Aggadata body —
  'aggadata.background': { en: 'Background', he: 'רקע' },
  'aggadata.interpretation': { en: 'Interpretation', he: 'פרשנות' },
  'aggadata.parallels': { en: 'Parallels', he: 'מקבילות' },
  'aggadata.parallel.same-story': { en: 'Same story', he: 'אותו סיפור' },
  'aggadata.parallel.same-actors': { en: 'Same actors', he: 'אותן דמויות' },
  'aggadata.parallel.same-motif': { en: 'Same motif', he: 'אותו מוטיב' },
  'aggadata.parallel.tanach-source': { en: 'Tanach source', he: 'מקור בתנ״ך' },

  // — Place body —
  'place.alsoKnownAs': { en: 'also {names}', he: 'ידוע גם כ{names}' },

  // — Rishonim body —
  'rishonim.onSegment': { en: 'Rishonim on segment {n}', he: 'ראשונים על קטע {n}' },
  'rishonim.commentCount.one': { en: '{count} comment', he: 'פירוש אחד' },
  'rishonim.commentCount.other': { en: '{count} comments', he: '{count} פירושים' },
  'rishonim.workCount.one': { en: '{count} work', he: 'חיבור אחד' },
  'rishonim.workCount.other': { en: '{count} works', he: '{count} חיבורים' },
  'rishonim.primarySources': { en: 'Primary sources', he: 'מקורות ראשוניים' },

  // — Voice group —
  'voiceGroup.collective': { en: 'Collective voice', he: 'קול קיבוצי' },

  // — Sidebar (addition) —
  'sidebar.backTo': { en: 'Back to {label}', he: 'חזרה אל {label}' },

  // — Rabbi card: shared —
  'rabbi.onDaf': { en: 'on daf', he: 'בדף' },
  'rabbi.onThisDaf': { en: 'On this daf: {text}', he: 'בדף זה: {text}' },
  'rabbi.row.highlight': { en: 'Click to highlight in daf', he: 'לחצו להדגשה בדף' },
  'rabbi.row.unhighlight': { en: 'Click to un-highlight', he: 'לחצו לביטול ההדגשה' },
  'rabbi.generationUncertain': {
    en: 'Generation uncertain — {count} rabbis share this name',
    he: 'הדור אינו ודאי — {count} חכמים נושאים שם זה',
  },
  'rabbi.generationLikely': {
    en: 'Most likely {name} — {count} rabbis share this name (AI guess)',
    he: 'ככל הנראה {name} — {count} חכמים נושאים שם זה (ניחוש בינה מלאכותית)',
  },

  // — Rabbi geography card —
  'rabbi.geography.title': { en: 'Geography', he: 'גאוגרפיה' },
  'rabbi.geography.movements': { en: 'Movements', he: 'מסעות' },
  'rabbi.geography.birthplace': { en: 'Birthplace', he: 'מקום לידה' },
  'rabbi.geography.studiedAt': { en: 'Studied at', he: 'מקום לימוד' },
  'rabbi.geography.notablePlaces': { en: 'Notable places', he: 'מקומות בולטים' },

  // — Rabbi lineage tree —
  'rabbi.lineage.title': { en: 'Lineage', he: 'שלשלת' },
  // — Rabbi interactions (replaces the lineage tree where the study is sure who the sage is) —
  'rabbi.interactions.title': { en: 'Interactions', he: 'קשרים' },
  'rabbi.connections.inProgressTitle': { en: 'Connections', he: 'קשרים' },
  'rabbi.connections.inDevelopment': {
    en: 'This feature is in active development.',
    he: 'התכונה הזו בפיתוח פעיל.',
  },
  'rabbi.connections.inProgressBody': {
    en: 'Still being worked out. We are checking who this is, and who he is linked to, from the text itself.',
    he: 'עדיין בעבודה. אנחנו בודקים מי זה, ועם מי הוא קשור, מתוך הטקסט עצמו.',
  },
  'rabbi.interactions.onThisPage': { en: 'also on this page', he: 'גם בדף הזה' },
  'rabbi.interactions.openCard': { en: 'Open his card', he: 'פתח את הכרטיס שלו' },
  'rabbi.interactions.about': {
    en: 'Counted from the text: each number is a passage where the two names stand together. {n} names in all.',
    he: 'נספר מן הטקסט: כל מספר הוא קטע שבו שני השמות מופיעים יחד. {n} שמות בסך הכל.',
  },
  'rabbi.lineage.debatePartners': { en: 'Debate partners', he: 'בני פלוגתא' },

  // — Rabbi places timeline —
  'rabbi.places.title': { en: 'Places — timeline', he: 'מקומות — ציר זמן' },
  'rabbi.places.youAreHere': { en: 'you are here', he: 'אתם כאן' },
  'rabbi.places.kind.birth': { en: 'birth', he: 'לידה' },
  'rabbi.places.kind.movement': { en: 'moved', he: 'מעבר' },
  'rabbi.places.kind.study': { en: 'study', he: 'לימוד' },
  'rabbi.places.kind.notable': { en: 'notable', he: 'בולט' },
  'rabbi.places.confidence.high': { en: 'high', he: 'גבוהה' },
  'rabbi.places.confidence.medium': { en: 'medium', he: 'בינונית' },
  'rabbi.places.confidence.low': { en: 'low', he: 'נמוכה' },
  // — Across the Talmud (accumulated observations) —
  'rabbi.observations.title': { en: 'Across the Talmud', he: 'לאורך הש"ס' },
  'rabbi.observations.appearsOn': { en: 'Appears on {n} dapim', he: 'מופיע ב-{n} דפים' },
  'rabbi.observations.oftenWith': { en: 'Often appears with', he: 'מופיע לעתים קרובות עם' },
  'rabbi.observations.places': { en: 'Places', he: 'מקומות' },
  'rabbi.observations.opinions': { en: 'opinions', he: 'דעות' },
  'rabbi.observations.stories': { en: 'stories', he: 'סיפורים' },
  'rabbi.observations.exegesis': { en: 'verse expositions', he: 'דרשות פסוקים' },
  'rabbi.observations.loading': { en: 'Gathering across the Talmud…', he: 'אוסף מכל הש"ס…' },
  'rabbi.observations.onNDapim': { en: 'on {n} dapim', he: 'ב-{n} דפים' },

  // — Commentary picker / strip —
  'commentary.heading': { en: 'Commentaries on this daf', he: 'מפרשים על הדף' },
  'commentary.loading': { en: 'Loading…', he: 'טוען…' },
  'commentary.empty': { en: 'No commentary links on this daf.', he: 'אין מפרשים על דף זה.' },
  'commentary.choose': { en: '— choose a commentary —', he: '— בחרו מפרש —' },
  'commentary.clickHint': {
    en: 'Click any highlighted span on the daf to open the specific comment.',
    he: 'לחצו על קטע מודגש בדף לפתיחת הפירוש הספציפי.',
  },
  'commentary.segmentCount.one': {
    en: '{count} comment on segment #{seg}',
    he: 'פירוש אחד על קטע #{seg}',
  },
  'commentary.segmentCount.other': {
    en: '{count} comments on segment #{seg}',
    he: '{count} פירושים על קטע #{seg}',
  },
  'commentary.closeSegment': { en: 'Close segment', he: 'סגירת הקטע' },
  'commentary.autoTranslated': { en: 'auto-translated', he: 'תורגם אוטומטית' },
  'commentary.translating': { en: 'Translating…', he: 'מתרגם…' },
  'commentary.translateError': { en: "Couldn't translate: {error}", he: 'התרגום נכשל: {error}' },
  'commentary.noText': { en: '(No text available)', he: '(אין טקסט זמין)' },

  // — Geography map —
  'geography.chip': { en: 'Geography', he: 'גאוגרפיה' },
  'geography.title': { en: 'Geography', he: 'גאוגרפיה' },
  'geography.empty': {
    en: 'No rabbis on this daf could be placed on the map yet.',
    he: 'לא ניתן עדיין למקם חכמים מדף זה על המפה.',
  },
  'geography.loading': {
    en: 'Mapping this daf’s rabbis…',
    he: 'ממפה את חכמי הדף…',
  },
  'geography.heading': {
    en: 'Geography · click a dot to highlight',
    he: 'גאוגרפיה · לחצו על נקודה להדגשה',
  },
  'geography.mapTitle': { en: 'Geography map', he: 'מפת גאוגרפיה' },
  'geography.mentionedInDaf': { en: 'mentioned in daf', he: 'מוזכר בדף' },
  'geography.cityUnknown': { en: 'city unknown', he: 'עיר לא ידועה' },
  'geography.eretzYisrael': { en: 'Eretz Yisrael', he: 'ארץ ישראל' },
  'geography.eretzYisrael.aria': {
    en: 'Eretz Yisrael — rabbi geographic origins',
    he: 'ארץ ישראל — מוצא גאוגרפי של החכמים',
  },
  'geography.bavel': { en: 'Bavel', he: 'בבל' },
  'geography.bavel.aria': {
    en: 'Bavel — rabbi geographic origins',
    he: 'בבל — מוצא גאוגרפי של החכמים',
  },
  'geography.euphrates': { en: 'Euphrates', he: 'פרת' },
  'geography.tigris': { en: 'Tigris', he: 'חידקל' },
  'geography.migration': { en: 'Migration', he: 'הגירה' },
  'geography.view.fit': { en: 'Fit', he: 'הכל' },
  'geography.trajectory.hint': {
    en: 'click a rabbi to trace their path',
    he: 'לחצו על חכם כדי לעקוב אחר מסלולו',
  },
  'geography.trajectory.clear': { en: 'clear', he: 'נקה' },
  'geography.trajectory.tracing': { en: 'Tracing {name}', he: 'מסלול {name}' },

  // — Translation popup —
  'translation.loading': { en: 'Translating…', he: 'מתרגם…' },
  'translation.mobileHint': {
    en: 'Tap another word within {max} words to translate a region · tap again to close',
    he: 'הקישו על מילה נוספת בטווח {max} מילים לתרגום קטע · הקישו שוב לסגירה',
  },

  'translation.seeProfile': { en: 'See profile →', he: 'לדף החכם ←' },
  'translation.aboutPlace': { en: 'About this place →', he: 'על המקום ←' },

  // — Mobile top drawer (daf picker / nav) —
  'header.drawer.expand': { en: 'Menu ▾', he: 'תפריט ▾' },
  'header.drawer.collapse': { en: 'Hide ▴', he: 'הסתר ▴' },

  // — Mobile layers —
  'mobile.layers': { en: 'Layers', he: 'שכבות' },
  'mobile.layers.title': { en: 'Annotation layers', he: 'שכבות ביאור' },
  'mobile.layers.close': { en: 'Close', he: 'סגירה' },

  // — User highlights / notes —
  'highlight.action': { en: 'Highlight:', he: 'הדגשה:' },
  'highlight.notePlaceholder': { en: 'Add a note…', he: 'הוספת הערה…' },
  'highlight.delete': { en: 'Delete', he: 'מחיקה' },
  'highlight.save': { en: 'Save', he: 'שמירה' },
  'highlight.notesTitle': { en: 'My notes', he: 'ההערות שלי' },
  'highlight.notesEmpty': { en: 'No highlights on this daf yet.', he: 'אין עדיין הדגשות בדף זה.' },
  'highlight.notesToggle': { en: 'Notes', he: 'הערות' },
  'highlight.noteLabel': { en: 'Note', he: 'הערה' },

  // — Bug report —
  'bugreport.open': { en: 'Report a problem', he: 'דיווח על תקלה' },
  'bugreport.sent': { en: 'Thanks — report sent for {daf}.', he: 'תודה — הדיווח נשלח עבור {daf}.' },
  'bugreport.prompt': {
    en: 'Reporting a problem with {daf} — what went wrong?',
    he: 'דיווח על תקלה ב{daf} — מה השתבש?',
  },
  'bugreport.placeholder': {
    en: "e.g. Rabbi Yochanan wasn't underlined in this passage, or the translation for this word was wrong.",
    he: 'לדוגמה: רבי יוחנן לא סומן בקטע זה, או שתרגום המילה היה שגוי.',
  },
  'bugreport.cancel': { en: 'Cancel', he: 'ביטול' },
  'bugreport.submit': { en: 'Submit', he: 'שליחה' },
  'bugreport.sending': { en: 'Sending…', he: 'שולח…' },
  'bugreport.sendError': { en: "Couldn't send: {error}", he: 'השליחה נכשלה: {error}' },

  // — Daf load progress —
  'dafLoad.analyzing': {
    en: 'Analyzing daf — {done} of {total} anchors',
    he: 'מנתח את הדף — {done} מתוך {total} עוגנים',
  },
  'dafLoad.loadingSections': {
    en: 'Loading {section} — {done} of {total}',
    he: 'טוען {section} — {done} מתוך {total}',
  },
  'dafLoad.sections': { en: 'sections', he: 'מקטעים' },
  'dafLoad.upToDate': { en: 'Up to date', he: 'מעודכן' },
  'dafLoad.paused': {
    en: 'AI generation is paused for now (spend budget reached). Cards will fill in once it resumes.',
    he: 'יצירת התוכן בבינה מלאכותית מושהית כעת (תקציב ההוצאה הושג). הכרטיסים יתמלאו כשהיא תתחדש.',
  },
  'dafLoad.failed': {
    en: 'Some content couldn’t be generated just now. Open a card to retry.',
    he: 'חלק מהתוכן לא נוצר כעת. פתחו כרטיס כדי לנסות שוב.',
  },
  // Prefetch family labels — substituted into dafLoad.loadingSections. Keyed
  // from dafPrefetch's FRIENDLY map so the warmed-family name localizes too.
  'dafLoad.family.arguments': { en: 'arguments', he: 'סוגיות' },
  'dafLoad.family.argumentMoves': { en: 'argument moves', he: 'מהלכים' },
  'dafLoad.family.moveQuestions': { en: 'move questions', he: 'שאלות מהלך' },
  'dafLoad.family.verses': { en: 'verses', he: 'פסוקים' },
  'dafLoad.family.verseQuestions': { en: 'verse questions', he: 'שאלות פסוקים' },
  'dafLoad.family.aggadot': { en: 'aggadot', he: 'אגדות' },
  'dafLoad.family.aggadahQuestions': { en: 'aggadah questions', he: 'שאלות אגדה' },
  'dafLoad.family.places': { en: 'places', he: 'מקומות' },
  'dafLoad.family.halachot': { en: 'halachot', he: 'הלכות' },
  'dafLoad.family.rabbis': { en: 'rabbis', he: 'חכמים' },
  'dafLoad.family.rishonim': { en: 'rishonim', he: 'ראשונים' },
  'dafLoad.family.argumentOverview': { en: 'overview', he: 'סקירה' },
  'dafLoad.family.background': { en: 'background', he: 'רקע' },
  'dafLoad.family.tidbit': { en: 'chiddush', he: 'חידוש' },
  'dafLoad.family.biyun': { en: "bi'yun", he: 'עיון' },

  // — Gutter icon tooltips —
  'gutter.argument': { en: 'Argument structure & rabbis', he: 'מבנה הסוגיה וחכמים' },
  'gutter.halacha': { en: 'Practical halacha', he: 'הלכה למעשה' },
  'gutter.chart': { en: 'Comparison chart for this region', he: 'טבלת השוואה לקטע זה' },
  'gutter.aggadata': { en: 'Aggada — narrative on this line', he: 'אגדה — סיפור בשורה זו' },
  'gutter.yerushalmi': {
    en: 'Yerushalmi — parallel in the Jerusalem Talmud',
    he: 'ירושלמי — מקבילה בתלמוד הירושלמי',
  },
  'gutter.rishonim': { en: 'Rishonim on this line', he: 'ראשונים על שורה זו' },
  'gutter.pesukim': { en: 'Pasuk — Tanach citation', he: 'פסוק — ציטוט מהתנ״ך' },

  // — Explore-deeper Q&A panel —
  'qa.loadingQuestions': { en: 'Loading questions…', he: 'טוען שאלות…' },
  'qa.community': { en: 'community', he: 'קהילה' },
  'qa.askedCount': { en: 'asked {count}×', he: 'נשאל {count}×' },
  'qa.lowConfidence': {
    en: "Low confidence — the available sources didn't fully answer this.",
    he: 'ביטחון נמוך — המקורות הזמינים לא ענו על כך במלואו.',
  },
  'qa.showMore': { en: 'show {count} more', he: 'הצג עוד {count}' },
  'qa.showLess': { en: 'show less', he: 'הצג פחות' },
  'qa.error.tooLong': {
    en: 'Please keep questions under 280 characters.',
    he: 'נא לשמור על שאלות מתחת ל-280 תווים.',
  },
  'qa.error.rateLimit': {
    en: "You've asked a lot of new questions recently — please wait a bit before asking another.",
    he: 'שאלת הרבה שאלות חדשות לאחרונה — נא להמתין מעט לפני שאלה נוספת.',
  },
  'qa.error.paused': {
    en: 'AI generation is paused for now to keep this project sustainable. Please try again tomorrow.',
    he: 'יצירת התוכן בבינה מלאכותית מושהית כעת כדי לשמור על קיימות הפרויקט. נא לנסות שוב מחר.',
  },
  'enrich.error.unavailable': {
    en: 'AI generation is temporarily unavailable. Please try again later or tomorrow.',
    he: 'יצירת התוכן בבינה מלאכותית אינה זמינה כרגע. נא לנסות שוב מאוחר יותר או מחר.',
  },
  // Short labels for the compact failure badge (full message shows on hover).
  'enrich.badge.failed': { en: "Couldn't load", he: 'טעינה נכשלה' },
  'enrich.badge.paused': { en: 'Paused', he: 'מושהה' },
  'enrich.badge.unavailable': { en: 'Unavailable', he: 'לא זמין' },

  // — First-time-user tutorial —
  'tutorial.help': { en: 'Help', he: 'עזרה' },
  'tutorial.help.title': { en: 'Open the tutorial', he: 'פתחו את המדריך' },
  'tutorial.next': { en: 'Next', he: 'הבא' },
  'tutorial.back': { en: 'Back', he: 'הקודם' },
  'tutorial.skip': { en: 'Skip', he: 'דילוג' },
  'tutorial.done': { en: 'Done', he: 'סיום' },
  'tutorial.progress': { en: '{n} of {total}', he: '{n} מתוך {total}' },

  'tutorial.chapter.welcome': { en: 'Welcome', he: 'ברוכים הבאים' },
  'tutorial.chapter.reading': { en: 'Reading the page', he: 'קריאת הדף' },
  'tutorial.chapter.marks': { en: 'Smart notes', he: 'הערות חכמות' },
  'tutorial.chapter.done': { en: 'All set', he: 'מוכנים' },

  'tutorial.welcome.title': { en: 'Welcome to talmud.dev', he: 'ברוכים הבאים ל-talmud.dev' },
  'tutorial.welcome.body': {
    en: 'A short tour of how to read a daf here, and of the notes added around it. It takes about two minutes. You can skip at any time.',
    he: 'סיור קצר על קריאת הדף כאן ועל ההערות שנוספו סביבו. הוא אורך כשתי דקות. אפשר לדלג בכל רגע.',
  },

  'tutorial.lang.title': { en: 'Hebrew or English', he: 'עברית או אנגלית' },
  'tutorial.lang.body': {
    en: 'Switch the whole interface — and the AI explanations — between English and Hebrew here. The page itself stays in the original Aramaic and Hebrew.',
    he: 'כאן מחליפים את כל הממשק — ואת הסברי הבינה המלאכותית — בין אנגלית לעברית. הדף עצמו נשאר בארמית ובעברית המקוריות.',
  },

  'tutorial.nav.title': { en: 'Move between pages', he: 'מעבר בין דפים' },
  'tutorial.nav.body': {
    en: 'Pick a tractate and page here, or step forward and back with the arrows. "Today\'s Daf" jumps to the daily Daf Yomi.',
    he: 'בחרו מסכת ודף כאן, או דפדפו קדימה ואחורה עם החצים. "הדף היומי" מקפיץ אתכם לדף היומי של היום.',
  },

  'tutorial.translateWord.title': { en: 'Translate any word', he: 'תרגום כל מילה' },
  'tutorial.translateWord.body': {
    en: 'Click or tap any word in the text to see its translation.',
    he: 'לחצו או הקישו על כל מילה בטקסט כדי לראות את תרגומה.',
  },
  'tutorial.translateWord.example': { en: 'man', he: 'אִישׁ' },

  'tutorial.translatePhrase.title': { en: '…or a whole phrase', he: '…או ביטוי שלם' },
  'tutorial.translatePhrase.body': {
    en: 'Drag across a few words to translate them as one phrase. This helps when the meaning comes from the words together. You can also highlight the selected words and keep them.',
    he: 'גררו על פני כמה מילים כדי לתרגם אותן כביטוי אחד. זה עוזר כשהמשמעות באה מהמילים יחד. אפשר גם להדגיש את המילים שסימנתם ולשמור אותן.',
  },
  'tutorial.translatePhrase.bodyMobile': {
    en: "Tap a word, then tap a second word nearby. Everything between them is translated as one phrase. Tap a rabbi's name or a place to see who or what it is, with a link to read more. Tap anywhere else to close.",
    he: 'הקישו על מילה, ואז על מילה נוספת בקרבתה. כל מה שביניהן יתורגם כביטוי אחד. הקישו על שם של חכם או של מקום כדי לראות מי או מה הוא, עם קישור להרחבה. הקישו במקום אחר כדי לסגור.',
  },
  'tutorial.translatePhrase.exampleHe': { en: 'כָּל הָעוֹלָם כֻּלּוֹ', he: 'כָּל הָעוֹלָם כֻּלּוֹ' },
  'tutorial.translatePhrase.exampleEn': { en: 'the whole world', he: 'כל העולם' },

  'tutorial.marks.title': { en: 'Notes in the margins', he: 'הערות בשוליים' },
  'tutorial.marks.body': {
    en: 'The small icons in the margins show where a note sits. When one line has several notes, their icons stack together. Hover over them, or tap them on a phone, to spread them out, then pick one. The note opens beside the page on a computer, or from the bottom on a phone. Each colour is a different kind of note:',
    he: 'הסמלים הקטנים בשוליים מראים היכן יושבת הערה. כשבשורה אחת יש כמה הערות, הסמלים שלהן נערמים יחד. רחפו מעליהם, או הקישו עליהם בטלפון, כדי לפרוש אותם, ואז בחרו אחד. ההערה נפתחת לצד הדף במחשב, או מלמטה בטלפון. כל צבע הוא סוג הערה אחר:',
  },
  'tutorial.icon.argument.label': { en: 'Argument', he: 'מהלך הסוגיה' },
  'tutorial.icon.argument.desc': {
    en: 'how the sugya builds its case, step by step',
    he: 'כיצד הסוגיה בונה את טיעונה, שלב אחר שלב',
  },
  'tutorial.icon.halacha.label': { en: 'Halacha', he: 'הלכה' },
  'tutorial.icon.halacha.desc': { en: 'the practical legal ruling', he: 'הפסיקה המעשית' },
  'tutorial.icon.aggadata.label': { en: 'Aggada', he: 'אגדה' },
  'tutorial.icon.aggadata.desc': { en: 'story, ethics, and lore', he: 'סיפור, מוסר ומחשבה' },
  'tutorial.icon.yerushalmi.label': { en: 'Yerushalmi', he: 'ירושלמי' },
  'tutorial.icon.yerushalmi.desc': {
    en: 'the parallel passage in the Jerusalem Talmud',
    he: 'המקבילה בתלמוד הירושלמי',
  },
  'tutorial.icon.pesuk.label': { en: 'Verses', he: 'פסוקים' },
  'tutorial.icon.pesuk.desc': { en: 'Tanakh quoted or alluded to', he: 'מקראות שצוטטו או נרמזו' },
  'tutorial.icon.rishonim.label': { en: 'Rishonim', he: 'ראשונים' },
  'tutorial.icon.rishonim.desc': {
    en: 'medieval commentary anchored here',
    he: 'פירוש הראשונים על המקום',
  },

  'tutorial.chips.title': { en: 'Notes on the whole daf', he: 'הערות על כל הדף' },
  'tutorial.chips.body': {
    en: 'The buttons at the top open notes about the whole page, not one spot. Overview gives a short summary above the same map. Background covers what you need to know going in. Tidbit points out something worth noticing. Geography shows the places the page mentions on a map.',
    he: 'הכפתורים שלמעלה פותחים הערות על כל הדף, ולא על נקודה אחת. סקירה נותנת סיכום קצר מעל אותה מפה. רקע מסביר מה כדאי לדעת לפני הלימוד. תובנה מצביעה על משהו ששווה לשים לב אליו. גאוגרפיה מראה על מפה את המקומות שהדף מזכיר.',
  },

  'tutorial.argument.title': { en: 'Following the argument', he: 'מעקב אחר מהלך הסוגיה' },
  'tutorial.argument.body': {
    en: 'This is a real argument note. Its map lists the sections of the daf in order. The lines on the side show how they connect: which one answers, objects to, or builds on another. Open a section to see its statements. Point at or tap a statement to highlight its words on the page.',
    he: 'זו הערת מהלך אמיתית. המפה שלה מונה את קטעי הדף לפי הסדר. הקווים שבצד מראים איך הם מתחברים: איזה קטע עונה, מקשה או ממשיך קטע אחר. פתחו קטע כדי לראות את אמירותיו. הצביעו על אמירה או הקישו עליה כדי להדגיש את מילותיה בדף.',
  },
  'tutorial.fullMap.title': { en: 'See the whole map at once', he: 'כל המפה במבט אחד' },
  'tutorial.fullMap.body': {
    en: '"Full-screen map" opens the same map across the whole screen. Each section becomes a column, with its statements listed underneath. Arrows run between the columns, so you can follow the argument across the page. From there you can zoom, switch to a stacked view, or carry on to the next page.',
    he: '"מפה במסך מלא" פותח את אותה מפה על כל המסך. כל קטע הופך לעמודה, ואמירותיו רשומות תחתיו. חצים עוברים בין העמודות, כך שאפשר לעקוב אחר הטיעון לרוחב הדף. משם אפשר להגדיל, לעבור לתצוגה מוערמת, או להמשיך לדף הבא.',
  },

  'tutorial.halacha.title': { en: 'The practical ruling', he: 'הפסיקה למעשה' },
  'tutorial.halacha.body': {
    en: 'A halacha note traces how the discussion settles into law — the codification, from the Gemara through the Rishonim to the Shulchan Aruch.',
    he: 'הערת הלכה עוקבת אחר האופן שבו הדיון מתגבש לפסיקה — מהגמרא דרך הראשונים ועד השולחן ערוך.',
  },

  'tutorial.underline.title': { en: 'The colored names', he: 'השמות הצבעוניים' },
  'tutorial.underline.body': {
    en: "Rabbis' names are underlined by when they lived: a red scale for the Talmudic era (darker = earlier) and a blue scale for the Geonim onward. Click or tap a name to read about that rabbi. Dotted underlines mark key terms. Point at or tap them for a short explanation.",
    he: 'שמות החכמים מסומנים בקו תחתון לפי תקופתם: סולם אדום לתקופת התלמוד (כהה = מוקדם יותר) וסולם כחול מהגאונים ואילך. לחצו או הקישו על שם כדי לקרוא על החכם. קווים מקווקווים מסמנים מונחי מפתח. הצביעו או הקישו עליהם להסבר קצר.',
  },
  'tutorial.underline.early': {
    en: 'Talmudic era (earlier → later)',
    he: 'תקופת התלמוד (מוקדם ← מאוחר)',
  },
  'tutorial.underline.late': { en: 'Geonim onward', he: 'מהגאונים ואילך' },
  'tutorial.underline.dotted': {
    en: 'dotted = a key term; tap for a gloss',
    he: 'מקווקו = מונח מפתח; הקישו להסבר',
  },

  'tutorial.qa.title': { en: 'Ask your own question', he: 'שאלו שאלה משלכם' },
  'tutorial.qa.body': {
    en: 'Most notes end with a Q&A box like this. Pick a suggested question or type your own about the passage — the answer is written for you and grounded in the text.',
    he: 'רוב ההערות מסתיימות בתיבת שאלות ותשובות כזו. בחרו שאלה מוצעת או הקלידו שאלה משלכם על הקטע — התשובה נכתבת עבורכם ומעוגנת בטקסט.',
  },
  'tutorial.qa.example1': { en: 'Why this order?', he: 'למה הסדר הזה?' },
  'tutorial.qa.example2': { en: 'Who disagrees?', he: 'מי חולק?' },
  'tutorial.qa.placeholder': { en: 'Ask about this passage…', he: 'שאלו על הקטע הזה…' },
  'tutorial.report.title': { en: 'Spot a problem?', he: 'מצאתם תקלה?' },
  'tutorial.report.body': {
    en: 'These notes are generated and not perfect. If something looks wrong — a mistranslation, a misplaced note, a bad reading — use "Report a problem" at the bottom of the daf to flag it. It genuinely helps.',
    he: 'ההערות נוצרות אוטומטית ואינן מושלמות. אם משהו נראה שגוי — תרגום, מיקום הערה, או קריאה — השתמשו ב"דיווח על תקלה" בתחתית הדף כדי לסמן זאת. זה באמת עוזר.',
  },

  'tutorial.finish.title': { en: "You're ready", he: 'אתם מוכנים' },
  'tutorial.finish.body': {
    en: "That's the tour. To see it again, open More at the top of the page and choose Help. On a phone, open Menu first. Enjoy learning.",
    he: 'זה הסיור. כדי לראות אותו שוב, פתחו את "עוד" בראש הדף ובחרו "עזרה". בטלפון, פתחו קודם את התפריט. למידה נעימה.',
  },
  'tutorial.explore.title': { en: 'More to explore', he: 'עוד מה לגלות' },
  'tutorial.explore.body': {
    en: "The links at the bottom lead further. People has a page for each rabbi: when they lived, where, and who they learned with and argued with. Argument graph shows this daf's argument on one large page. Tanach opens the sister site for the Bible.",
    he: 'הקישורים בתחתית מובילים הלאה. חכמים: דף לכל חכם, מתי ואיפה חי, ועם מי למד והתווכח. גרף הסוגיה: הטיעון של הדף הזה על דף אחד גדול. תנ״ך: אתר האחות למקרא.',
  },
  'tutorial.finish.contact': {
    en: 'Questions, ideas, or feedback? Feel free to reach out:',
    he: 'שאלות, רעיונות או משוב? אתם מוזמנים לכתוב לי:',
  },

  // — First-visit banner on the reader —
  'tutorial.banner.text': { en: 'New here? Take a quick tour.', he: 'חדשים כאן? צאו לסיור קצר.' },
  'tutorial.banner.action': { en: 'Take the tour', he: 'צאו לסיור' },
  'tutorial.banner.dismiss': { en: 'Dismiss', he: 'סגירה' },
} satisfies Record<string, Entry>;

/** Every known catalog key. Lets UI props (e.g. section labels) demand a real
 *  key at compile time instead of an arbitrary string. */
export type CatalogKey = keyof typeof CATALOG;

/**
 * Translate a catalog key for the active language. Unknown keys fall back to
 * the key itself (so a missing string is visible rather than silently blank).
 * Optional {placeholder} interpolation via the params object.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const entry = (CATALOG as Record<string, Entry>)[key];
  let s = entry ? (lang() === 'he' ? entry.he : entry.en) : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
