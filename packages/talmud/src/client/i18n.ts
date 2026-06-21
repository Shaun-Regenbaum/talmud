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
  'header.dev': { en: 'Inspect', he: 'בדיקה' },
  'header.dev.title': {
    en: 'Toggle the Inspect panel (build provenance · marks · checks)',
    he: 'פתיחת לוח הבדיקה (מקור הבנייה · סימונים · בדיקות)',
  },
  'dev.usageReports': { en: 'Usage & reports', he: 'שימוש ודוחות' },
  'dev.alignmentDebug': { en: 'Alignment debug', he: 'ניפוי יישור' },
  'dev.mcpGuide': { en: 'Connect via MCP', he: 'חיבור דרך MCP' },

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
    en: 'search by name, slug, alias, or Hebrew…',
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
  'sages.section.aliases': { en: 'aliases', he: 'כינויים' },
  'sages.section.bio': { en: 'Bio', he: 'ביוגרפיה' },
  'sages.bio.empty': {
    en: 'No bio in the unified record. Hit Refresh to re-run.',
    he: 'אין ביוגרפיה ברשומה המאוחדת. לחצו רענון כדי להריץ מחדש.',
  },
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
    en: 'billed by the provider · last 30 days',
    he: 'מחויב על ידי הספק · 30 הימים האחרונים',
  },
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
  'usage.cost.converge': {
    en: "Our 30-day tracking is {pct}% of the {billed} billed — the gap is Workers AI and other models the provider bills but we can't yet price per producer. The two should converge.",
    he: 'המעקב שלנו ל-30 יום הוא {pct}% מתוך {billed} שחויבו — הפער הוא Workers AI ומודלים נוספים שהספק מחייב אך איננו מתמחרים לכל מפיק. השניים אמורים להתכנס.',
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
  'usage.latency.byMark': { en: 'Marks', he: 'סימונים' },
  'usage.latency.byMark.hint': { en: 'per mark, across all runs', he: 'לכל סימון, בכל ההרצות' },
  'usage.latency.byEnrichment': { en: 'Enrichments', he: 'העשרות' },
  'usage.latency.byEnrichment.hint': {
    en: 'per enrichment, across all runs',
    he: 'לכל העשרה, בכל ההרצות',
  },
  'usage.recentErrors.title': { en: 'Recent errors', he: 'שגיאות אחרונות' },
  'usage.recentErrors.hint': { en: 'from request telemetry', he: 'מתוך טלמטריית הבקשות' },
  'usage.errorKind.other': { en: 'other', he: 'אחר' },
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
  'halacha.codification': { en: 'Codification', he: 'פסיקה' },
  'halacha.sourceTexts': { en: 'Source texts', he: 'לשון המקור' },
  'halacha.sourceTexts.none': {
    en: 'No codifier text cached for this daf yet',
    he: 'לשון המקור עדיין לא נטענה לדף זה',
  },
  'halacha.derivation': { en: 'Talmudic sources', he: 'מקורות בש״ס' },
  'halacha.note': { en: 'Note', he: 'הערה' },
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
  'halacha.role.primary': { en: 'primary source', he: 'מקור עיקרי' },
  'halacha.role.related': { en: 'related', he: 'קשור' },
  'halacha.role.root': { en: 'scriptural root', he: 'מקור מן הכתוב' },
  'halacha.youAreHere': { en: 'You are here', he: 'אתם כאן' },
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

  // — Mobile top drawer (daf picker / nav) —
  'header.drawer.expand': { en: 'Menu ▾', he: 'תפריט ▾' },
  'header.drawer.collapse': { en: 'Hide ▴', he: 'הסתר ▴' },

  // — Mobile interaction modes + layers —
  'mobile.mode.read': { en: 'Read', he: 'קריאה' },
  'mobile.mode.read.hint': {
    en: 'Pan & zoom; tap icons to open',
    he: 'גלילה וזום; הקישו על סמלים לפתיחה',
  },
  'mobile.mode.translate': { en: 'Translate', he: 'תרגום' },
  'mobile.mode.translate.hint': { en: 'Tap words to translate', he: 'הקישו על מילים לתרגום' },
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
    en: 'A quick tour of how to read a daf and use the smart notes layered onto it. Takes about a minute — you can skip anytime.',
    he: 'סיור קצר על קריאת הדף ועל השימוש בהערות החכמות שנוספו עליו. אורך כדקה — אפשר לדלג בכל רגע.',
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
    en: 'On a computer, click any word in the text to see its translation. On a phone, switch the bottom bar to "Translate" and tap a word.',
    he: 'במחשב, לחצו על כל מילה בטקסט כדי לראות את תרגומה. בטלפון, העבירו את הסרגל התחתון ל"תרגום" והקישו על מילה.',
  },
  'tutorial.translateWord.example': { en: 'man', he: 'אִישׁ' },

  'tutorial.translatePhrase.title': { en: '…or a whole phrase', he: '…או ביטוי שלם' },
  'tutorial.translatePhrase.body': {
    en: 'Select a run of several words and the whole phrase is translated together — handy when the sense lives in the combination, not the single word. Selecting text also lets you highlight and keep it.',
    he: 'סמנו רצף של כמה מילים והביטוי כולו יתורגם יחד — נוח כשהמשמעות נמצאת בצירוף ולא במילה הבודדת. סימון טקסט גם מאפשר להדגיש ולשמור אותו.',
  },
  'tutorial.translatePhrase.exampleHe': { en: 'כָּל הָעוֹלָם כֻּלּוֹ', he: 'כָּל הָעוֹלָם כֻּלּוֹ' },
  'tutorial.translatePhrase.exampleEn': { en: 'the whole world', he: 'כל העולם' },

  'tutorial.marks.title': { en: 'Notes in the margins', he: 'הערות בשוליים' },
  'tutorial.marks.body': {
    en: 'The small icons in the margins mark where smart notes sit. Click one to open it — a panel slides in on a computer, or up from the bottom on a phone. Each color is a different kind of note:',
    he: 'הסמלים הקטנים בשוליים מציינים היכן יושבות ההערות החכמות. לחצו על אחד כדי לפתוח אותו — במחשב נפתחת חלונית בצד, ובטלפון מגירה מלמטה. כל צבע הוא סוג הערה אחר:',
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
    en: 'The pills at the top open notes about the whole page rather than one spot: an Overview of the sugya, the Background you need going in, and the occasional Tidbit worth noticing.',
    he: 'הכפתורים שלמעלה פותחים הערות על כל הדף ולא על נקודה אחת: סקירה של הסוגיה, הרקע שכדאי להכיר לפני הלימוד, ולעיתים גם תובנה ששווה לשים לב אליה.',
  },

  'tutorial.argument.title': { en: 'Following the argument', he: 'מעקב אחר מהלך הסוגיה' },
  'tutorial.argument.body': {
    en: "Here's a real argument note open beside the daf. It draws the sugya as a small map of its moves — who speaks, and how each statement answers, objects to, or resolves another — so you can follow how the case is built. Tap a statement to highlight its words on the page.",
    he: 'הנה הערת מהלך אמיתית פתוחה לצד הדף. היא משרטטת את הסוגיה כמפה קטנה של מהלכיה — מי מדבר, וכיצד כל אמירה עונה, מקשה או מיישבת אמירה אחרת — כדי שתוכלו לעקוב אחר בניית הטיעון. הקישו על אמירה כדי להדגיש את מילותיה בדף.',
  },

  'tutorial.halacha.title': { en: 'The practical ruling', he: 'הפסיקה למעשה' },
  'tutorial.halacha.body': {
    en: 'A halacha note traces how the discussion settles into law — the codification, from the Gemara through the Rishonim to the Shulchan Aruch.',
    he: 'הערת הלכה עוקבת אחר האופן שבו הדיון מתגבש לפסיקה — מהגמרא דרך הראשונים ועד השולחן ערוך.',
  },

  'tutorial.overview.title': { en: 'The whole-daf overview', he: 'סקירת כל הדף' },
  'tutorial.overview.body': {
    en: 'This note zooms out to the whole page: a short summary and a map of how the discussion flows from one section to the next. Click a section in the map to open its statements right there, and click a statement to read its detail. It also points to where the sugya continues — a good place to get your bearings before diving in.',
    he: 'הערה זו מתרחקת אל כל הדף: סיכום קצר ומפה של מהלך הדיון מקטע לקטע. הקישו על קטע במפה כדי לפתוח בו במקום את אמירותיו, והקישו על אמירה כדי לקרוא את פירוטה. ההערה גם מפנה למקום שבו הסוגיה ממשיכה — מקום טוב להתמצא בו לפני הצלילה ללימוד.',
  },

  'tutorial.underline.title': { en: 'The colored names', he: 'השמות הצבעוניים' },
  'tutorial.underline.body': {
    en: "Rabbis' names are underlined by when they lived: a red scale for the Talmudic era (darker = earlier) and a blue scale for the Geonim onward. Dotted underlines mark key terms — hover or tap them for a short gloss.",
    he: 'שמות החכמים מסומנים בקו תחתון לפי תקופתם: סולם אדום לתקופת התלמוד (כהה = מוקדם יותר) וסולם כחול מהגאונים ואילך. קווים מקווקווים מסמנים מונחי מפתח — רחפו או הקישו עליהם להסבר קצר.',
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
    en: "That's the tour. You can reopen it anytime from the Help button. Enjoy learning.",
    he: 'זה הסיור. אפשר לפתוח אותו שוב בכל עת מכפתור העזרה. למידה נעימה.',
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
