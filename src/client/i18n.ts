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
