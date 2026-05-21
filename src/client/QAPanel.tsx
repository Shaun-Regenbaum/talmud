/**
 * QAPanel — "Explore deeper" expander attached to each argument-move card.
 *
 * What it does
 * ------------
 * 1. Renders a collapsed "Explore deeper" button. The first time the user
 *    expands it, fetches the curated suggested-questions list (via
 *    /api/studio/run for argument-move.suggested-questions) AND the
 *    community-asked registry (via /api/qa/registry).
 * 2. Shows the top 1-2 questions by default; "show more" reveals the rest
 *    (curated first, then community, ranked by clickCount).
 * 3. Clicking a question lazy-loads its answer via /api/studio/run for
 *    argument-move.qa with `user_question` set. The answer caches in shared
 *    KV so the second person to ask the same question gets it instantly.
 * 4. "+ Ask your own question" opens a textarea + submit. Submit POSTs to
 *    /api/qa/ask which validates, rate-limits, appends to the registry, and
 *    kicks the LLM job. The submitted question then renders inline with a
 *    loading state until the answer arrives.
 *
 * Why a new component (not MarkEnrichmentCards)
 * ---------------------------------------------
 * MarkEnrichmentCards auto-fires every aggregate on mount. We need parameterized,
 * on-demand fetches keyed by question text; the existing card has no slot for
 * user-supplied `qualifier` strings. We POST to /api/studio/run directly with
 * `user_question` in the body.
 */

import { createSignal, createResource, For, Show, type JSX } from 'solid-js';
import { Hebraized } from './Hebraized';
import { hebraize } from './hebraize';
import { trackAI } from './aiActivity';

export interface QAPanelProps {
  /** Argument-move id, e.g. fields.id from ArgumentMoveInstance. Used as
   *  the registry partition + as the instance for /api/studio/run. */
  moveId: string;
  /** The mark instance that the worker needs to recreate the move (must
   *  match what MarkEnrichmentCards passes for argument-move). */
  moveInstance: unknown;
  tractate: string;
  page: string;
}

interface SuggestedQuestion { q: string; why_useful: string; }
interface SuggestedQuestionsPayload { questions: SuggestedQuestion[]; }

interface CommunityQuestion { q: string; qHash: string; askedAt: number; clickCount: number; }
interface RegistryPayload { community: CommunityQuestion[]; }

interface QAAnswer { answer: string; confidence: 'high' | 'medium' | 'low'; }

interface RunResultLike {
  parsed: unknown;
  content: string;
}
type RunResponse =
  | { status: 'ok'; result: RunResultLike }
  | { status: 'pending'; runId: string }
  | { status: 'error'; error: string };

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 300_000;

async function runEnrichmentDirect(
  enrichmentId: string,
  tractate: string,
  page: string,
  markInput: unknown,
  userQuestion?: string,
): Promise<RunResultLike> {
  const body: Record<string, unknown> = {
    enrichment_id: enrichmentId,
    tractate, page,
    mark_input: markInput,
  };
  if (userQuestion) body.user_question = userQuestion;
  const r = await fetch('/api/studio/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json() as RunResponse | { error?: string };
  if (!r.ok && r.status !== 202) {
    throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  if ('status' in j) {
    if (j.status === 'ok') return j.result;
    if (j.status === 'error') throw new Error(j.error);
    if (j.status === 'pending') return pollJob(j.runId);
  }
  return j as unknown as RunResultLike;
}

async function pollJob(runId: string): Promise<RunResultLike> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const r = await fetch(`/api/studio/run-status/${encodeURIComponent(runId)}`);
    const j = await r.json() as RunResponse | { status: 'pending' };
    if ('status' in j) {
      if (j.status === 'ok') return (j as { result: RunResultLike }).result;
      if (j.status === 'error') throw new Error((j as { error: string }).error);
    }
  }
  throw new Error(`qa job ${runId} timed out`);
}

async function fetchSuggested(tractate: string, page: string, moveId: string, instance: unknown): Promise<SuggestedQuestion[]> {
  const result = await trackAI(
    `argument-move.suggested-questions:${tractate}:${page}:${moveId}`,
    `Suggested questions · ${moveId}`,
    () => runEnrichmentDirect('argument-move.suggested-questions', tractate, page, instance),
  );
  const parsed = result.parsed as SuggestedQuestionsPayload | null;
  return Array.isArray(parsed?.questions) ? parsed!.questions : [];
}

async function fetchRegistry(tractate: string, page: string, moveId: string): Promise<CommunityQuestion[]> {
  const r = await fetch(`/api/qa/registry?tractate=${encodeURIComponent(tractate)}&page=${encodeURIComponent(page)}&move_id=${encodeURIComponent(moveId)}`);
  if (!r.ok) return [];
  const j = await r.json() as RegistryPayload;
  return Array.isArray(j.community) ? j.community : [];
}

async function fetchAnswer(tractate: string, page: string, moveId: string, instance: unknown, question: string): Promise<QAAnswer | null> {
  const result = await trackAI(
    `argument-move.qa:${tractate}:${page}:${moveId}:${question.slice(0, 40)}`,
    `Answering · ${question.slice(0, 80)}`,
    () => runEnrichmentDirect('argument-move.qa', tractate, page, instance, question),
  );
  const parsed = result.parsed as QAAnswer | null;
  if (parsed && typeof parsed.answer === 'string') return parsed;
  return null;
}

async function postAsk(tractate: string, page: string, moveId: string, instance: unknown, question: string): Promise<{
  qHash: string;
  alreadyAsked: boolean;
  rateLimited?: boolean;
  error?: string;
}> {
  const r = await fetch('/api/qa/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tractate, page, move_id: moveId,
      mark_input: instance,
      question,
    }),
  });
  const j = await r.json() as { qHash?: string; alreadyAsked?: boolean; rateLimited?: boolean; error?: string };
  if (!r.ok) {
    return { qHash: '', alreadyAsked: false, rateLimited: r.status === 429, error: j.error ?? `HTTP ${r.status}` };
  }
  return {
    qHash: j.qHash ?? '',
    alreadyAsked: j.alreadyAsked === true,
    rateLimited: j.rateLimited === true,
  };
}

const DEFAULT_VISIBLE = 2;

// Flavor copy for the per-question loading state. Picked once when the run
// kicks off and stored alongside the loading state so it doesn't re-roll on
// every Solid re-render. Same playful voice as MarkEnrichmentCards'
// loadingCopy() so the panel feels consistent with the rest of the daf.
const QA_LOADING_OPTIONS = [
  'Asking the Rabbis…',
  'Checking a Sefer…',
  'Asking my Chavruta…',
  'Double-Checking the Sugya…',
  'Checking Rashi…',
  'Asking the Maggid Shiur…',
];
function pickQALoadingCopy(): string {
  return QA_LOADING_OPTIONS[Math.floor(Math.random() * QA_LOADING_OPTIONS.length)];
}

export default function QAPanel(props: QAPanelProps): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const [showAll, setShowAll] = createSignal(false);
  const [askingOpen, setAskingOpen] = createSignal(false);
  const [askText, setAskText] = createSignal('');
  const [askError, setAskError] = createSignal<string | null>(null);
  const [openAnswers, setOpenAnswers] = createSignal<Record<string, {
    state: 'loading' | 'ok' | 'error';
    data?: QAAnswer;
    error?: string;
    /** Loading flavor copy. Picked once at the loading-state transition so
     *  it doesn't shuffle on every re-render. */
    loadingCopy?: string;
  }>>({});

  // Two parallel resources, both gated on `expanded` so we don't pay
  // anything until the user opens the panel for the first time.
  const [suggested, { mutate: setSuggested }] = createResource(
    () => (expanded() ? { t: props.tractate, p: props.page, m: props.moveId, i: props.moveInstance } : null),
    (k) => fetchSuggested(k.t, k.p, k.m, k.i),
  );
  const [registry, { refetch: refetchRegistry, mutate: setRegistry }] = createResource(
    () => (expanded() ? { t: props.tractate, p: props.page, m: props.moveId } : null),
    (k) => fetchRegistry(k.t, k.p, k.m),
  );

  // Combined, ordered list of questions. Curated first (in their generated
  // order), then community sorted by clickCount desc. Each entry knows its
  // origin so we can render a small badge.
  type CombinedQuestion = { q: string; why?: string; origin: 'curated' | 'community'; clickCount?: number; qHash?: string };
  const combined = (): CombinedQuestion[] => {
    const out: CombinedQuestion[] = [];
    const sList = suggested() ?? [];
    for (const s of sList) out.push({ q: s.q, why: s.why_useful, origin: 'curated' });
    const cList = (registry() ?? []).slice().sort((a, b) => b.clickCount - a.clickCount);
    for (const c of cList) {
      // Dedupe: if a curated and a community question normalize identical,
      // keep the curated one (it has the why-useful copy).
      const dup = out.some((x) => normalizeQ(x.q) === normalizeQ(c.q));
      if (dup) continue;
      out.push({ q: c.q, origin: 'community', clickCount: c.clickCount, qHash: c.qHash });
    }
    return out;
  };

  const visibleList = () => {
    const all = combined();
    return showAll() ? all : all.slice(0, DEFAULT_VISIBLE);
  };
  const hiddenCount = () => Math.max(0, combined().length - DEFAULT_VISIBLE);

  const handleQuestionClick = async (q: string) => {
    const key = normalizeQ(q);
    const cur = openAnswers()[key];
    if (cur) {
      // Toggle closed if already shown.
      setOpenAnswers((m) => {
        const next = { ...m };
        delete next[key];
        return next;
      });
      return;
    }
    setOpenAnswers((m) => ({ ...m, [key]: { state: 'loading', loadingCopy: pickQALoadingCopy() } }));
    try {
      const ans = await fetchAnswer(props.tractate, props.page, props.moveId, props.moveInstance, q);
      if (!ans) throw new Error('empty answer');
      setOpenAnswers((m) => ({ ...m, [key]: { state: 'ok', data: ans } }));
      // Best-effort click bump for community questions.
      const ce = combined().find((x) => normalizeQ(x.q) === key);
      if (ce?.origin === 'community' && ce.qHash) {
        void fetch('/api/qa/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tractate: props.tractate, page: props.page,
            move_id: props.moveId, qHash: ce.qHash,
          }),
        }).catch(() => { /* swallow */ });
      }
    } catch (err) {
      setOpenAnswers((m) => ({ ...m, [key]: { state: 'error', error: String((err as Error)?.message ?? err) } }));
    }
  };

  const submitAsk = async () => {
    const q = askText().trim();
    if (q.length === 0) return;
    if (q.length > 280) {
      setAskError('Please keep questions under 280 characters.');
      return;
    }
    setAskError(null);
    const reply = await postAsk(props.tractate, props.page, props.moveId, props.moveInstance, q);
    if (reply.error) {
      setAskError(reply.rateLimited
        ? 'You\'ve asked a lot of new questions recently — please wait a bit before asking another.'
        : reply.error);
      return;
    }
    // Optimistically prepend to registry so it appears immediately, then
    // open the answer panel (which will hit cache if reply.alreadyAsked or
    // wait for the LLM if novel).
    setRegistry((cur) => {
      const list = Array.isArray(cur) ? cur.slice() : [];
      // Avoid double-push if it was already there.
      if (!list.some((e) => e.qHash === reply.qHash)) {
        list.unshift({ q, qHash: reply.qHash, askedAt: Date.now(), clickCount: 1 });
      }
      return list;
    });
    setAskText('');
    setAskingOpen(false);
    void handleQuestionClick(q);
    // Refresh registry in the background so the canonical view shows up
    // on next open.
    void refetchRegistry();
  };

  return (
    <div style={{
      'margin-top': '0.6rem',
      'border-top': '1px solid #eee',
      'padding-top': '0.5rem',
    }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          'align-items': 'center',
          gap: '0.35rem',
          'font-size': '0.72rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          color: '#666',
          'font-weight': 500,
        }}
        aria-expanded={expanded()}
      >
        <span>{expanded() ? '−' : '+'}</span>
        <span>Questions</span>
      </button>

      <Show when={expanded()}>
        <div style={{ 'margin-top': '0.55rem' }}>
          <Show when={suggested.loading || registry.loading}>
            <div style={{ color: '#888', 'font-size': '0.78rem', 'font-style': 'italic' }}>
              Loading questions…
            </div>
          </Show>

          <For each={visibleList()}>{(item) => {
            const key = normalizeQ(item.q);
            const ans = () => openAnswers()[key];
            return (
              <div style={{ 'margin-bottom': '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => handleQuestionClick(item.q)}
                  // Title is an HTML attribute — can't host a JSX component,
                  // so we run the why_useful hint through the synchronous
                  // dict pass directly. Async LLM upgrade isn't worth it for
                  // hover text that vanishes the moment the user moves on.
                  title={item.why ? hebraize(item.why) : ''}
                  style={{
                    all: 'unset',
                    display: 'block',
                    width: '100%',
                    cursor: 'pointer',
                    'box-sizing': 'border-box',
                    padding: '0.4rem 0.55rem',
                    background: ans() ? '#fefce8' : '#fafaf7',
                    border: '1px solid ' + (ans() ? '#eab308' : '#eae8e0'),
                    'border-radius': '4px',
                    'font-size': '0.84rem',
                    color: '#222',
                    'line-height': 1.4,
                  }}
                >
                  <span style={{ color: '#999', 'margin-right': '0.3rem' }}>›</span>
                  <Hebraized text={item.q} />
                  <Show when={item.origin === 'community'}>
                    <span style={{
                      'margin-left': '0.4rem',
                      'font-size': '0.62rem',
                      color: '#999',
                      'text-transform': 'uppercase',
                      'letter-spacing': '0.05em',
                    }}>
                      community
                      <Show when={typeof item.clickCount === 'number' && item.clickCount! > 1}>
                        {' '}· asked {item.clickCount}×
                      </Show>
                    </span>
                  </Show>
                </button>
                <Show when={ans()}>
                  {(state) => (
                    <div style={{
                      'margin-top': '0.3rem',
                      padding: '0.5rem 0.65rem',
                      background: '#fff',
                      border: '1px solid #f1ecd9',
                      'border-radius': '4px',
                      'font-size': '0.85rem',
                      color: '#222',
                      'line-height': 1.55,
                    }}>
                      <Show when={state().state === 'loading'}>
                        <span style={{ color: '#888', 'font-style': 'italic' }}>
                          {state().loadingCopy ?? 'Asking the Rabbis…'}
                        </span>
                      </Show>
                      <Show when={state().state === 'error'}>
                        <span style={{ color: '#c00', 'font-family': 'monospace', 'font-size': '0.78rem' }}>
                          {state().error}
                        </span>
                      </Show>
                      <Show when={state().state === 'ok' && state().data}>
                        <p style={{ margin: 0 }}>
                          <Hebraized text={state().data!.answer} />
                        </p>
                        <Show when={state().data!.confidence === 'low'}>
                          <div style={{
                            'margin-top': '0.35rem',
                            'font-size': '0.7rem',
                            color: '#a16207',
                          }}>
                            Low confidence — the available sources didn't fully answer this.
                          </div>
                        </Show>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>
            );
          }}</For>

          <Show when={!suggested.loading && !registry.loading && combined().length === 0}>
            <div style={{ color: '#888', 'font-size': '0.78rem', 'font-style': 'italic' }}>
              No suggested questions yet. Ask your own below.
            </div>
          </Show>

          <Show when={hiddenCount() > 0 && !showAll()}>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                'font-size': '0.72rem',
                color: '#666',
                'margin-top': '0.2rem',
              }}
            >
              ⌄ show {hiddenCount()} more
            </button>
          </Show>
          <Show when={showAll() && combined().length > DEFAULT_VISIBLE}>
            <button
              type="button"
              onClick={() => setShowAll(false)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                'font-size': '0.72rem',
                color: '#666',
                'margin-top': '0.2rem',
              }}
            >
              ⌃ show less
            </button>
          </Show>

          {/* Custom-question affordance */}
          <div style={{ 'margin-top': '0.55rem' }}>
            <Show when={!askingOpen()} fallback={
              <div>
                <textarea
                  value={askText()}
                  onInput={(e) => setAskText((e.currentTarget as HTMLTextAreaElement).value)}
                  placeholder="Ask your own question about this move…"
                  rows={3}
                  style={{
                    width: '100%',
                    'box-sizing': 'border-box',
                    padding: '0.45rem 0.55rem',
                    border: '1px solid #d6d3d1',
                    'border-radius': '4px',
                    'font-family': 'inherit',
                    'font-size': '0.85rem',
                    'line-height': 1.45,
                    color: '#222',
                    resize: 'vertical',
                  }}
                />
                <Show when={askError()}>
                  <div style={{
                    'margin-top': '0.3rem',
                    'font-size': '0.75rem',
                    color: '#c00',
                  }}>{askError()}</div>
                </Show>
                <div style={{
                  display: 'flex',
                  gap: '0.4rem',
                  'margin-top': '0.4rem',
                }}>
                  <button
                    type="button"
                    onClick={() => { void submitAsk(); }}
                    disabled={askText().trim().length === 0}
                    style={{
                      all: 'unset',
                      cursor: askText().trim().length === 0 ? 'not-allowed' : 'pointer',
                      padding: '0.35rem 0.7rem',
                      background: askText().trim().length === 0 ? '#e7e5e0' : '#1e293b',
                      color: askText().trim().length === 0 ? '#999' : '#fff',
                      'border-radius': '4px',
                      'font-size': '0.78rem',
                    }}
                  >
                    Submit
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAskingOpen(false); setAskText(''); setAskError(null); }}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '0.35rem 0.7rem',
                      color: '#666',
                      'font-size': '0.78rem',
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <Show when={suggested() || registry()}>
                  <div style={{
                    'margin-top': '0.4rem',
                    'font-size': '0.7rem',
                    color: '#999',
                  }}>
                    Your question will be answered with the move + commentaries
                    as context. New questions are visible to future learners on
                    this move — no personal info is recorded.
                  </div>
                </Show>
              </div>
            }>
              <button
                type="button"
                onClick={() => setAskingOpen(true)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'flex',
                  'align-items': 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.55rem',
                  border: '1px dashed #d6d3d1',
                  'border-radius': '4px',
                  color: '#666',
                  'font-size': '0.78rem',
                }}
              >
                <span style={{ 'font-size': '0.9rem', color: '#999' }}>+</span>
                <span>Ask your own question</span>
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

function normalizeQ(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
