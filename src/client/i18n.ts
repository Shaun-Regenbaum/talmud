/**
 * App language state — a single module-level signal so any of the hash-routed
 * pages can read/set it without a shared context provider. Two things hang off
 * it:
 *
 *   1. Enrichment generation language. Every /api/studio/run (and /api/qa/ask)
 *      caller threads lang() into the request body; the worker selects the
 *      Hebrew prompt variant and a `:he`-namespaced cache key (see
 *      src/worker/cache-keys.ts + code-marks.ts *_HE prompts).
 *   2. UI chrome direction + (eventually) the t() string catalog. On 'he' the
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

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
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

// Apply once at module load so the very first paint has the right dir.
applyToDocument(lang());

export function setLang(next: Lang): void {
  if (next === lang()) return;
  setLangSignal(next);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  applyToDocument(next);
  // Drop cached enrichment runs so cards re-fetch under the new lang's cache
  // key. clearRunResultCache() listens for this event (see enrichmentQueue.ts).
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('marks-runs-invalidate'));
    window.dispatchEvent(new CustomEvent('lang-changed', { detail: next }));
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

const CATALOG: Record<string, Entry> = {
  // — App / daf header —
  'app.title': { en: 'Talmud', he: 'תלמוד' },
  'header.nav.hint': {
    en: '← / → to navigate · click any word to translate',
    he: '← / → לניווט · לחצו על מילה לתרגום',
  },
  'header.todaysDaf': { en: "Today's Daf", he: 'הדף היומי' },
  'header.todaysDaf.finding': { en: 'Finding today’s daf…', he: 'מאתר את דף היום…' },
  'header.todaysDaf.title': { en: "Jump to today's Daf Yomi", he: 'מעבר לדף היומי של היום' },
  'header.amud.title': { en: 'Toggle amud (side)', he: 'החלפת עמוד (צד)' },
  'header.dev': { en: 'dev', he: 'פיתוח' },
  'header.dev.title': {
    en: 'Toggle dev sidebar (marks + console log)',
    he: 'פתיחת סרגל הפיתוח (סימונים + יומן)',
  },
  'dev.usageReports': { en: 'Usage & reports', he: 'שימוש ודוחות' },
  'dev.alignmentDebug': { en: 'Alignment debug', he: 'ניפוי יישור' },

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
  'move.highlighted': { en: 'highlighted', he: 'מודגש' },
  'move.highlight.set': { en: 'Click to highlight this move on the daf', he: 'לחצו להדגשת המהלך בדף' },
  'move.highlight.clear': { en: 'Click to clear highlight', he: 'לחצו לניקוי ההדגשה' },

  // — Sidebar kind titles —
  'sidebar.kind.argument': { en: 'Argument', he: 'סוגיה' },
  'sidebar.kind.halacha': { en: 'Practical Halacha', he: 'הלכה למעשה' },
  'sidebar.kind.aggadata': { en: 'Aggada', he: 'אגדה' },
  'sidebar.kind.pesuk': { en: 'Pasuk', he: 'פסוק' },
  'sidebar.kind.place': { en: 'Place', he: 'מקום' },
  'sidebar.kind.rishonim': { en: 'Rishonim', he: 'ראשונים' },
  'sidebar.kind.voice-group': { en: 'Voice', he: 'קול' },
  'sidebar.kind.rabbi': { en: 'Rabbi', he: 'חכם' },

  // — Common —
  'common.open': { en: 'Open {name}', he: 'פתיחת {name}' },
  'common.close': { en: 'Close', he: 'סגירה' },

  // — Enrichment loading copy (evocative; streamed while a card generates) —
  'loading.rabbi.named': { en: 'Interviewing {name}…', he: 'מראיין את {name}…' },
  'loading.rabbi': { en: 'Interviewing the Rabbi…', he: 'מראיין את החכם…' },
  'loading.argument.named': { en: 'Tracing the argument: {title}…', he: 'עוקב אחר הסוגיה: {title}…' },
  'loading.argument': { en: 'Tracing the argument…', he: 'עוקב אחר הסוגיה…' },
  'loading.move.named': { en: 'Listening to {voice}…', he: 'מקשיב ל{voice}…' },
  'loading.move': { en: 'Tracing the flow…', he: 'עוקב אחר המהלך…' },
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

  // — Questions (Q&A) panel —
  'qa.questions': { en: 'Questions', he: 'שאלות' },
  'qa.empty': { en: 'No suggested questions yet. Ask your own below.', he: 'אין עדיין שאלות מוצעות. שאלו את שלכם למטה.' },
  'qa.placeholder': { en: 'Ask your own question about this move…', he: 'שאלו שאלה משלכם על המהלך…' },
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
  'sages.compile.graph.desc': { en: 'Bidirectional teacher↔student + family inversion across all enriched sages.', he: 'היפוך דו-כיווני רב↔תלמיד + משפחה על פני כל החכמים המועשרים.' },
  'sages.compile.cohort.desc': { en: 'Group sages by generation; emit slug→contemporaries.', he: 'קיבוץ חכמים לפי דור; הפקת מזהה→בני דור.' },
  'sages.compile.places.desc': { en: 'Invert sage.places[] into place→sages.', he: 'היפוך places[] של חכם ל-מקום→חכמים.' },
  'sages.compile.academies.desc': { en: 'Invert sage.academy into academy→sages.', he: 'היפוך academy של חכם ל-ישיבה→חכמים.' },
  'sages.compile.title': { en: '{desc}\nlast: {last}', he: '{desc}\nאחרון: {last}' },
  'sages.compile.never': { en: 'never', he: 'מעולם' },
  'sages.compile.running': { en: '{name}…', he: '{name}…' },
  'sages.compile.action': { en: 'compile {name}', he: 'הידור {name}' },
  'sages.compile.err': { en: 'err', he: 'שגיאה' },
  'sages.search.placeholder': { en: 'search by name, slug, alias, or Hebrew…', he: 'חיפוש לפי שם, מזהה, כינוי או עברית…' },
  'sages.filter.region': { en: 'region', he: 'אזור' },
  'sages.filter.gen': { en: 'gen', he: 'דור' },
  'sages.filter.all': { en: 'all', he: 'הכול' },
  'sages.region.israel': { en: 'Israel', he: 'ארץ ישראל' },
  'sages.region.bavel': { en: 'Bavel', he: 'בבל' },
  'sages.list.loading': { en: 'loading…', he: 'טוען…' },
  'sages.list.noMatches': { en: 'no matches', he: 'אין תוצאות' },
  'sages.list.cap': { en: '+{count} more — refine search', he: 'עוד {count} — צמצמו את החיפוש' },
  'sages.meta.gen': { en: 'gen {gen}', he: 'דור {gen}' },
  'sages.detail.pickPrompt': { en: 'Pick a sage on the left to see everything we have on file.', he: 'בחרו חכם מימין כדי לראות את כל המידע שברשותנו.' },
  'sages.detail.clearSelection': { en: 'Clear selection', he: 'ניקוי הבחירה' },
  'sages.detail.loadingSage': { en: 'loading sage…', he: 'טוען חכם…' },
  'sages.detail.noUnified': { en: 'No unified record cached for this sage yet.', he: 'אין עדיין רשומה מאוחדת שמורה לחכם זה.' },
  'sages.detail.runUnified': { en: 'Run unified enrichment', he: 'הרצת העשרה מאוחדת' },
  'sages.meta.genLabel': { en: 'gen', he: 'דור' },
  'sages.meta.region': { en: 'region', he: 'אזור' },
  'sages.meta.academy': { en: 'academy', he: 'ישיבה' },
  'sages.meta.prominence': { en: 'prominence', he: 'בולטות' },
  'sages.section.aliases': { en: 'aliases', he: 'כינויים' },
  'sages.section.bio': { en: 'Bio', he: 'ביוגרפיה' },
  'sages.bio.empty': { en: 'No bio in the unified record. Hit Refresh to re-run.', he: 'אין ביוגרפיה ברשומה המאוחדת. לחצו רענון כדי להריץ מחדש.' },
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
  'sages.section.contemporaries': { en: 'Contemporaries (gen {gen})', he: 'בני דורו (דור {gen})' },
  'sages.section.academyOf': { en: 'Academy of {name}', he: 'ישיבת {name}' },
  'sages.section.placeMates': { en: 'Place-mates', he: 'בני אותו מקום' },
  'sages.section.events': { en: 'Events', he: 'אירועים' },
  'sages.section.contemporariesRecord': { en: 'Contemporaries (per record)', he: 'בני דורו (לפי הרשומה)' },
  'sages.section.wikipedia': { en: 'Wikipedia', he: 'ויקיפדיה' },
  'sages.wiki.noExtract': { en: 'No Wikipedia extract cached. Run to fetch.', he: 'אין תקציר ויקיפדיה שמור. הריצו כדי להביא.' },
  'sages.wiki.noPage': { en: 'No Wikipedia page found for this sage.', he: 'לא נמצא ערך ויקיפדיה לחכם זה.' },
  'sages.wiki.enPrefix': { en: 'en:', he: 'אנגלית:' },
  'sages.wiki.hePrefix': { en: 'he:', he: 'עברית:' },
  'sages.section.wikidata': { en: 'Wikidata', he: 'ויקינתונים' },
  'sages.wikidata.noRecord': { en: 'No Wikidata record cached. Run to fetch family/teacher/student QIDs.', he: 'אין רשומת ויקינתונים שמורה. הריצו כדי להביא מזהי QID של משפחה/רב/תלמיד.' },
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
  'sages.stage.refreshTitle': { en: 'Force refresh, bypass cache', he: 'רענון מאולץ, עקיפת המטמון' },
  'sages.stage.unified.desc': { en: 'Sefaria + LLM combined biographical record.', he: 'רשומה ביוגרפית משולבת של ספריא + מודל שפה.' },
  'sages.stage.wikidata.desc': { en: 'Family/teacher/student QIDs + birth/death years from Wikidata (no AI).', he: 'מזהי QID של משפחה/רב/תלמיד + שנות לידה/פטירה מוויקינתונים (ללא בינה מלאכותית).' },
  'sages.stage.wikiBio.desc': { en: 'Full Wikipedia (en/he) page extracts via MediaWiki (no AI).', he: 'תקצירי ערכי ויקיפדיה מלאים (אנגלית/עברית) דרך MediaWiki (ללא בינה מלאכותית).' },
  'sages.edge.source': { en: 'source: {source}', he: 'מקור: {source}' },
  'sages.edge.sourceWeight': { en: 'source: {source} · weight {weight}', he: 'מקור: {source} · משקל {weight}' },

  // — Settings page —
  'settings.title': { en: 'LLM Settings', he: 'הגדרות מודל שפה' },
  'settings.intro.before': { en: 'Default model and fallback chain for every LLM call in the worker. Changes apply immediately; no redeploy. Per-call ', he: 'מודל ברירת המחדל ושרשרת הגיבוי לכל קריאה למודל בשרת. שינויים חלים מיד, ללא פריסה מחדש. דריסות ' },
  'settings.intro.after': { en: ' overrides on enrichment endpoints win over these defaults.', he: ' פר-קריאה בנקודות הקצה של ההעשרה גוברות על ברירות המחדל האלה.' },
  'settings.section.defaultModel': { en: 'Default model', he: 'מודל ברירת מחדל' },
  'settings.section.fallbackChain': { en: 'Fallback chain', he: 'שרשרת גיבוי' },
  'settings.probing': { en: 'probing…', he: 'בודק…' },
  'settings.probePing': { en: 'probe (ping)', he: 'בדיקה (פינג)' },
  'settings.probe': { en: 'probe', he: 'בדיקה' },
  'settings.remove': { en: 'remove', he: 'הסרה' },
  'settings.moveUp': { en: 'Move up', he: 'הזזה למעלה' },
  'settings.moveDown': { en: 'Move down', he: 'הזזה למטה' },
  'settings.fallbackChain.hint': { en: 'Tried in order if the default model returns a retryable failure (HTTP 5xx, 429, 1031, 3046, network).', he: 'מנוסים לפי הסדר אם מודל ברירת המחדל מחזיר כשל הניתן לניסיון חוזר (HTTP 5xx, 429, 1031, 3046, רשת).' },
  'settings.fallbackChain.empty': { en: '(empty — no fallback)', he: '(ריק — ללא גיבוי)' },
  'settings.addToChain': { en: '+ add to fallback chain…', he: '+ הוספה לשרשרת הגיבוי…' },
  'settings.saving': { en: 'saving…', he: 'שומר…' },
  'settings.save': { en: 'save', he: 'שמירה' },
  'settings.savedAt': { en: 'saved {time}', he: 'נשמר {time}' },
  'settings.errorPrefix': { en: 'error: {msg}', he: 'שגיאה: {msg}' },
  'settings.lastSavedAtServer': { en: 'Last saved at server: {time}', he: 'נשמר לאחרונה בשרת: {time}' },
  'settings.loadFailed': { en: 'Failed to load settings: {error}', he: 'טעינת ההגדרות נכשלה: {error}' },

  // — Usage page —
  'usage.title': { en: 'Usage', he: 'שימוש' },
  'usage.backToDaf': { en: '← back to daf', he: '← חזרה לדף' },
  'usage.refresh': { en: 'Refresh', he: 'רענון' },
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
  'usage.col.model': { en: 'Model', he: 'מודל' },
  'usage.col.requests': { en: 'Requests', he: 'בקשות' },
  'usage.col.tokens': { en: 'Tokens', he: 'טוקנים' },
  'usage.col.cost': { en: 'Cost', he: 'עלות' },
  'usage.col.calls': { en: 'Calls', he: 'קריאות' },
  'usage.col.cacheHit': { en: 'Cache hit%', he: 'אחוז פגיעות מטמון' },
  'usage.col.errors': { en: 'Errors', he: 'שגיאות' },
  'usage.col.kinds': { en: 'Kinds', he: 'סוגים' },
  'usage.pipeline.title': { en: 'Per-daf pipeline coverage', he: 'כיסוי צנרת לכל דף' },
  'usage.pipeline.hint': { en: 'of {count} dafim in the shas', he: 'מתוך {count} דפים בש״ס' },
  'usage.source.hebrewbooks': { en: 'HebrewBooks pages (hb:v2)', he: 'דפי HebrewBooks (hb:v2)' },
  'usage.source.gemara': { en: 'Aligned to Sefaria — gemara (ctx:gemara:v1)', he: 'יושר לספריא — גמרא (ctx:gemara:v1)' },
  'usage.source.commentaries': { en: 'Aligned to Sefaria — commentaries (ctx:commentaries:v1)', he: 'יושר לספריא — מפרשים (ctx:commentaries:v1)' },
  'usage.anchors.title': { en: 'Anchors per daf', he: 'עוגנים לכל דף' },
  'usage.anchors.hint': { en: 'click a row to see cache versions', he: 'לחצו על שורה לצפייה בגרסאות המטמון' },
  'usage.anchors.empty': { en: 'No marks registered.', he: 'אין סימונים רשומים.' },
  'usage.localEnrich.title': { en: 'Local enrichments', he: 'העשרות מקומיות' },
  'usage.localEnrich.hint': { en: 'per mark-instance, per daf — depth on top of anchors', he: 'לכל מופע סימון, לכל דף — עומק מעל העוגנים' },
  'usage.localEnrich.empty': { en: 'No local enrichments registered.', he: 'אין העשרות מקומיות רשומות.' },
  'usage.staleBadge': { en: '{count} stale', he: '{count} מיושנים' },
  'usage.heBadge': { en: '{count} he', he: '{count} עברית' },
  'usage.version.current': { en: '(current) — {count} dafim', he: '(נוכחי) — {count} דפים' },
  'usage.version.noSuperseded': { en: 'No superseded versions in cache.', he: 'אין גרסאות מוחלפות במטמון.' },
  'usage.version.supersededHeading': { en: 'Superseded versions still in KV (orphaned — safe to purge):', he: 'גרסאות מוחלפות שעדיין ב-KV (יתומות — ניתן למחוק בבטחה):' },
  'usage.version.entries': { en: '{count} entries', he: '{count} רשומות' },
  'usage.globalRepo.title': { en: 'Global repository', he: 'מאגר גלובלי' },
  'usage.globalRepo.hint': { en: 'enriched once, reused across every daf', he: 'מועשר פעם אחת, נעשה בו שימוש חוזר בכל דף' },
  'usage.rabbiCoverage.title': { en: 'Rabbi dataset coverage', he: 'כיסוי מאגר החכמים' },
  'usage.rabbiCoverage.sub': { en: '· bundled JSON, {count} rabbis', he: '· JSON מצורף, {count} חכמים' },
  'usage.rabbi.bio': { en: 'Bio (any source)', he: 'ביוגרפיה (כל מקור)' },
  'usage.rabbi.sefariaBio': { en: 'Sefaria bio', he: 'ביוגרפיה מספריא' },
  'usage.rabbi.sefariaBio.hint': { en: 'from Sefaria PersonTopic API', he: 'מ-API של ספריא (PersonTopic)' },
  'usage.rabbi.wiki': { en: 'Hebrew Wikipedia', he: 'ויקיפדיה העברית' },
  'usage.rabbi.wiki.hint': { en: 'Hebrew Wikipedia page linked', he: 'קושר לדף בויקיפדיה העברית' },
  'usage.rabbi.generation': { en: 'Generation identified', he: 'דור מזוהה' },
  'usage.rabbi.region': { en: 'Region (E.Y. / Bavel)', he: 'אזור (ארץ ישראל / בבל)' },
  'usage.rabbi.places': { en: 'Places (cities)', he: 'מקומות (ערים)' },
  'usage.rabbi.chain': { en: 'Chain of tradition', he: 'שלשלת המסורה' },
  'usage.rabbi.chain.hint': { en: 'teacher / student / contemporary', he: 'רב / תלמיד / בן דור' },
  'usage.rabbi.family': { en: 'Familial relations', he: 'קשרי משפחה' },
  'usage.rabbi.family.hint': { en: 'father / mother / spouse / child / sibling', he: 'אב / אם / בן זוג / ילד / אח' },
  'usage.rabbi.orientation': { en: 'Orientation', he: 'נטייה' },
  'usage.rabbi.orientation.hint': { en: 'mystical / practical / mixed', he: 'מיסטית / מעשית / מעורבת' },
  'usage.globalEnrich.title': { en: 'Global enrichments cached', he: 'העשרות גלובליות במטמון' },
  'usage.globalEnrich.sub': { en: '· the pool of pre-generated context to pull from', he: '· מאגר ההקשר שנוצר מראש לשליפה' },
  'usage.globalEnrich.empty': { en: 'No global enrichments registered.', he: 'אין העשרות גלובליות רשומות.' },
  'usage.globalEnrich.noGazetteer': { en: 'Note: there is no global places gazetteer yet — place enrichments are LLM-inferred per sighting. The backlog below is the seed for one.', he: 'הערה: אין עדיין מאגר מקומות גלובלי — העשרות המקומות מוסקות על ידי המודל לכל אזכור. המצבור שלהלן הוא הזרע למאגר כזה.' },
  'usage.backlog.title': { en: 'Needs global enrichment', he: 'דרושה העשרה גלובלית' },
  'usage.backlog.hint': { en: 'entities seen in the app that have no global record yet — grows as users explore', he: 'ישויות שנצפו באפליקציה ואין להן עדיין רשומה גלובלית — גדל ככל שמשתמשים מתעמקים' },
  'usage.backlog.rabbis.title': { en: 'Rabbis not in dataset', he: 'חכמים שאינם במאגר' },
  'usage.backlog.distinct': { en: '· {count} distinct', he: '· {count} ייחודיים' },
  'usage.backlog.rabbis.empty': { en: 'None yet — every rabbi seen so far resolved to the dataset.', he: 'אין עדיין — כל חכם שנצפה עד כה זוהה במאגר.' },
  'usage.backlog.places.title': { en: 'Places observed', he: 'מקומות שנצפו' },
  'usage.backlog.places.distinct': { en: '· {count} distinct (no gazetteer)', he: '· {count} ייחודיים (ללא מאגר מקומות)' },
  'usage.backlog.places.empty': { en: 'No places observed yet.', he: 'לא נצפו עדיין מקומות.' },
  'usage.cost.title': { en: 'Cost', he: 'עלות' },
  'usage.cost.hint': { en: 'two sources — AI Gateway is authoritative; self-tracked attributes spend per mark/enrichment', he: 'שני מקורות — AI Gateway הוא המקור הסמכותי; המעקב העצמי מייחס הוצאה לכל סימון/העשרה' },
  'usage.aigw.title': { en: 'AI Gateway', he: 'AI Gateway' },
  'usage.aigw.sub': { en: '· provider-reported, last 30d', he: '· מדווח על ידי הספק, 30 הימים האחרונים' },
  'usage.aigw.queryFailed': { en: 'AI Gateway query failed: {error}', he: 'שאילתת AI Gateway נכשלה: {error}' },
  'usage.aigw.notConfigured.before': { en: 'Not configured. Set a Cloudflare API token (Account Analytics: Read) via ', he: 'לא הוגדר. הגדירו טוקן API של Cloudflare (Account Analytics: Read) באמצעות ' },
  'usage.aigw.notConfigured.after': { en: ' to pull authoritative spend. ({error})', he: ' כדי למשוך נתוני הוצאה סמכותיים. ({error})' },
  'usage.stat.totalCost': { en: 'Total cost', he: 'עלות כוללת' },
  'usage.stat.requests': { en: 'Requests', he: 'בקשות' },
  'usage.stat.tokensIn': { en: 'Tokens in', he: 'טוקנים נכנסים' },
  'usage.stat.tokensOut': { en: 'Tokens out', he: 'טוקנים יוצאים' },
  'usage.selfTracked.title': { en: 'Self-tracked', he: 'מעקב עצמי' },
  'usage.selfTracked.sub': { en: '· daily rollups, priced models only', he: '· סיכומים יומיים, מודלים מתומחרים בלבד' },
  'usage.selfTracked.subSince': { en: '· daily rollups, priced models only · since {date}', he: '· סיכומים יומיים, מודלים מתומחרים בלבד · מאז {date}' },
  'usage.selfTracked.empty': { en: 'No usage recorded yet.', he: 'לא נרשם עדיין שימוש.' },
  'usage.stat.costPriced': { en: 'Cost (priced)', he: 'עלות (מתומחר)' },
  'usage.stat.pricedCalls': { en: '{count} priced calls', he: '{count} קריאות מתומחרות' },
  'usage.stat.unpricedCalls': { en: 'Unpriced calls', he: 'קריאות לא מתומחרות' },
  'usage.stat.unpricedCalls.sub': { en: 'Workers AI — see gateway', he: 'Workers AI — ראו gateway' },
  'usage.stat.llmCalls': { en: 'LLM calls', he: 'קריאות למודל' },
  'usage.stat.errored': { en: '{count} errored', he: '{count} נכשלו' },
  'usage.stat.tokens': { en: 'Tokens', he: 'טוקנים' },
  'usage.stat.tokensInOut': { en: '{in} in / {out} out', he: '{in} נכנסים / {out} יוצאים' },
  'usage.projection.before': { en: 'Projection: ~{perDaf}/daf (priced models) × {remaining} remaining dafim ≈ ', he: 'תחזית: ~{perDaf} לדף (מודלים מתומחרים) × {remaining} דפים נותרים ≈ ' },
  'usage.projection.after': { en: ' to warm the rest of the shas.', he: ' לחימום שאר הש״ס.' },
  'usage.projection.note': { en: 'Excludes Workers AI spend — check the gateway total for the full picture.', he: 'לא כולל הוצאת Workers AI — בדקו את סך ה-gateway לתמונה המלאה.' },
  'usage.byMark': { en: 'By mark', he: 'לפי סימון' },
  'usage.byEnrichment': { en: 'By enrichment', he: 'לפי העשרה' },
  'usage.callsCount': { en: '{count} calls', he: '{count} קריאות' },
  'usage.unpriced': { en: 'unpriced', he: 'לא מתומחר' },
  'usage.latency.byEndpoint': { en: 'Latency by endpoint ({count} recent calls)', he: 'זמן תגובה לפי נקודת קצה ({count} קריאות אחרונות)' },
  'usage.latency.byMark': { en: 'Studio runs by mark', he: 'הרצות סטודיו לפי סימון' },
  'usage.latency.byMark.hint': { en: 'rolled up across /api/studio/run with mark_id', he: 'מסוכם על פני /api/studio/run עם mark_id' },
  'usage.latency.byEnrichment': { en: 'Studio runs by enrichment', he: 'הרצות סטודיו לפי העשרה' },
  'usage.latency.byEnrichment.hint': { en: 'rolled up across /api/studio/run with enrichment_id', he: 'מסוכם על פני /api/studio/run עם enrichment_id' },
  'usage.recentErrors.title': { en: 'Recent errors', he: 'שגיאות אחרונות' },
  'usage.recentErrors.hint': { en: 'from request telemetry', he: 'מתוך טלמטריית הבקשות' },
  'usage.errorKind.other': { en: 'other', he: 'אחר' },
  'usage.jobErrors.title': { en: 'Queue job failures ({count})', he: 'כשלי משימות בתור ({count})' },
  'usage.jobErrors.hint': { en: 'hard exceptions in the enrichment queue consumer', he: 'חריגות קשות בצרכן תור ההעשרה' },
  'usage.bugReports.title': { en: 'Bug reports ({count})', he: 'דיווחי תקלות ({count})' },
  'usage.bugReports.empty': { en: 'Inbox empty.', he: 'תיבת הדואר ריקה.' },
  'usage.notTracked': { en: 'not tracked', he: 'לא במעקב' },
  'usage.missing': { en: '{count} missing', he: '{count} חסרים' },

  // — Halacha body —
  'halacha.codification': { en: 'Codification', he: 'פסיקה' },
  'halacha.practical': { en: 'Practical', he: 'למעשה' },
  'halacha.disputes': { en: 'Disputes', he: 'מחלוקות' },
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

  // — Rabbi geography card —
  'rabbi.geography.title': { en: 'Geography', he: 'גאוגרפיה' },
  'rabbi.geography.movements': { en: 'Movements', he: 'מסעות' },
  'rabbi.geography.birthplace': { en: 'Birthplace', he: 'מקום לידה' },
  'rabbi.geography.studiedAt': { en: 'Studied at', he: 'מקום לימוד' },
  'rabbi.geography.notablePlaces': { en: 'Notable places', he: 'מקומות בולטים' },

  // — Rabbi lineage tree —
  'rabbi.lineage.title': { en: 'Lineage', he: 'שלשלת' },
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

  // — Rabbi tree strip —
  'rabbi.tree.title': { en: 'Chain of tradition', he: 'שלשלת הקבלה' },
  'rabbi.tree.noEdges': { en: 'no edges', he: 'אין קשרים' },
  'rabbi.tree.teacherStudent': { en: 'teacher → student', he: 'רב → תלמיד' },
  'rabbi.tree.contemporary': { en: 'contemporary', he: 'בן דורו' },
  'rabbi.tree.gen': { en: 'Gen {n}', he: 'דור {n}' },
  'rabbi.tree.onThisDaf': { en: 'On this daf', he: 'בדף זה' },
  'rabbi.tree.relatedRole': { en: '{role} of a rabbi on this daf', he: '{role} של חכם בדף זה' },
  'rabbi.tree.role.teacher': { en: 'teacher', he: 'רבו' },
  'rabbi.tree.role.student': { en: 'student', he: 'תלמידו' },
  'rabbi.tree.role.colleague': { en: 'colleague', he: 'בן דורו' },
  'rabbi.tree.role.related': { en: 'relative', he: 'קרוב' },
  'rabbi.tree.era.zugim': { en: 'Zugim', he: 'זוגות' },
  'rabbi.tree.era.tannaim': { en: 'Tannaim', he: 'תנאים' },
  'rabbi.tree.era.amoraim': { en: 'Amoraim', he: 'אמוראים' },
  'rabbi.tree.era.savoraim': { en: 'Savoraim', he: 'סבוראים' },

  // — Commentary picker / strip —
  'commentary.heading': { en: 'Commentaries on this daf', he: 'מפרשים על הדף' },
  'commentary.loading': { en: 'Loading…', he: 'טוען…' },
  'commentary.empty': { en: 'No commentary links on this daf.', he: 'אין מפרשים על דף זה.' },
  'commentary.choose': { en: '— choose a commentary —', he: '— בחרו מפרש —' },
  'commentary.clickHint': { en: 'Click any highlighted span on the daf to open the specific comment.', he: 'לחצו על קטע מודגש בדף לפתיחת הפירוש הספציפי.' },
  'commentary.segmentCount.one': { en: '{count} comment on segment #{seg}', he: 'פירוש אחד על קטע #{seg}' },
  'commentary.segmentCount.other': { en: '{count} comments on segment #{seg}', he: '{count} פירושים על קטע #{seg}' },
  'commentary.closeSegment': { en: 'Close segment', he: 'סגירת הקטע' },
  'commentary.autoTranslated': { en: 'auto-translated', he: 'תורגם אוטומטית' },
  'commentary.translating': { en: 'Translating…', he: 'מתרגם…' },
  'commentary.translateError': { en: "Couldn't translate: {error}", he: 'התרגום נכשל: {error}' },
  'commentary.noText': { en: '(No text available)', he: '(אין טקסט זמין)' },

  // — Geography map —
  'geography.heading': { en: 'Geography · click a dot to highlight', he: 'גאוגרפיה · לחצו על נקודה להדגשה' },
  'geography.mapping': { en: 'Mapping rabbi geography…', he: 'ממפה את גאוגרפיית החכמים…' },
  'geography.mentionedInDaf': { en: 'mentioned in daf', he: 'מוזכר בדף' },
  'geography.eretzYisrael': { en: 'Eretz Yisrael', he: 'ארץ ישראל' },
  'geography.eretzYisrael.aria': { en: 'Eretz Yisrael — rabbi geographic origins', he: 'ארץ ישראל — מוצא גאוגרפי של החכמים' },
  'geography.bavel': { en: 'Bavel', he: 'בבל' },
  'geography.bavel.aria': { en: 'Bavel — rabbi geographic origins', he: 'בבל — מוצא גאוגרפי של החכמים' },
  'geography.euphrates': { en: 'Euphrates', he: 'פרת' },
  'geography.tigris': { en: 'Tigris', he: 'חידקל' },
  'geography.placesMentioned': { en: 'Places mentioned', he: 'מקומות מוזכרים' },
  'geography.migration': { en: 'Migration', he: 'הגירה' },

  // — Translation popup —
  'translation.loading': { en: 'Translating…', he: 'מתרגם…' },

  // — Bug report —
  'bugreport.open': { en: 'Report a problem', he: 'דיווח על תקלה' },
  'bugreport.sent': { en: 'Thanks — report sent for {daf}.', he: 'תודה — הדיווח נשלח עבור {daf}.' },
  'bugreport.prompt': { en: 'Reporting a problem with {daf} — what went wrong?', he: 'דיווח על תקלה ב{daf} — מה השתבש?' },
  'bugreport.placeholder': { en: "e.g. Rabbi Yochanan wasn't underlined in this passage, or the translation for this word was wrong.", he: 'לדוגמה: רבי יוחנן לא סומן בקטע זה, או שתרגום המילה היה שגוי.' },
  'bugreport.cancel': { en: 'Cancel', he: 'ביטול' },
  'bugreport.submit': { en: 'Submit', he: 'שליחה' },
  'bugreport.sending': { en: 'Sending…', he: 'שולח…' },
  'bugreport.sendError': { en: "Couldn't send: {error}", he: 'השליחה נכשלה: {error}' },

  // — Daf load progress —
  'dafLoad.analyzing': { en: 'Analyzing daf — {done} of {total} anchors', he: 'מנתח את הדף — {done} מתוך {total} עוגנים' },
  'dafLoad.loadingSections': { en: 'Loading {section} — {done} of {total}', he: 'טוען {section} — {done} מתוך {total}' },
  'dafLoad.sections': { en: 'sections', he: 'מקטעים' },
  'dafLoad.upToDate': { en: 'Up to date', he: 'מעודכן' },
};

/**
 * Translate a catalog key for the active language. Unknown keys fall back to
 * the key itself (so a missing string is visible rather than silently blank).
 * Optional {placeholder} interpolation via the params object.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const entry = CATALOG[key];
  let s = entry ? (lang() === 'he' ? entry.he : entry.en) : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
