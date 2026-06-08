import { createSignal, Show, type JSX } from 'solid-js';
import { t } from './i18n';

export interface BugReportProps {
  tractate: string;
  page: string;
}

type Status = 'idle' | 'open' | 'submitting' | 'sent' | 'error';

export function BugReport(props: BugReportProps): JSX.Element {
  const [status, setStatus] = createSignal<Status>('idle');
  const [text, setText] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);

  const submit = async () => {
    const description = text().trim();
    if (!description) return;
    setStatus('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tractate: props.tractate,
          page: props.page,
          description,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
      setText('');
    } catch (err) {
      setStatus('error');
      setErrorMsg(String((err as Error).message ?? err));
    }
  };

  return (
    <section
      style={{
        'margin-top': '1.5rem',
        'margin-bottom': '0.5rem',
        'max-width': '520px',
        'margin-left': 'auto',
        'margin-right': 'auto',
        'text-align': 'center',
        'font-size': '0.75rem',
        color: '#888',
      }}
    >
      <Show
        when={status() !== 'idle' && status() !== 'sent'}
        fallback={
          <Show
            when={status() === 'sent'}
            fallback={
              <button
                data-tour="report"
                onClick={() => setStatus('open')}
                style={{
                  background: 'transparent',
                  border: '1px solid #ddd',
                  'border-radius': '4px',
                  padding: '0.3rem 0.7rem',
                  'font-size': '0.75rem',
                  color: '#666',
                  cursor: 'pointer',
                  'font-family': 'inherit',
                }}
              >
                {t('bugreport.open')}
              </button>
            }
          >
            <span style={{ color: '#059669' }}>
              {t('bugreport.sent', { daf: `${props.tractate} ${props.page}` })}
            </span>
          </Show>
        }
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.4rem', 'align-items': 'stretch', 'text-align': 'left' }}>
          <div style={{ color: '#666', 'font-size': '0.72rem' }}>
            {t('bugreport.prompt', { daf: `${props.tractate} ${props.page}` })}
          </div>
          <textarea
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder={t('bugreport.placeholder')}
            rows={3}
            style={{
              width: '100%',
              'box-sizing': 'border-box',
              'font-family': 'inherit',
              'font-size': '0.8rem',
              padding: '0.5rem',
              border: '1px solid #ddd',
              'border-radius': '4px',
              resize: 'vertical',
              color: '#333',
            }}
            disabled={status() === 'submitting'}
          />
          <div style={{ display: 'flex', gap: '0.5rem', 'justify-content': 'flex-end' }}>
            <button
              onClick={() => { setStatus('idle'); setText(''); setErrorMsg(null); }}
              disabled={status() === 'submitting'}
              style={{
                background: 'transparent',
                border: '1px solid #ddd',
                'border-radius': '4px',
                padding: '0.3rem 0.7rem',
                'font-size': '0.75rem',
                color: '#888',
                cursor: 'pointer',
              }}
            >
              {t('bugreport.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={status() === 'submitting' || !text().trim()}
              style={{
                background: '#8a2a2b',
                border: '1px solid #8a2a2b',
                'border-radius': '4px',
                padding: '0.3rem 0.8rem',
                'font-size': '0.75rem',
                color: '#fff',
                cursor: status() === 'submitting' || !text().trim() ? 'not-allowed' : 'pointer',
                opacity: status() === 'submitting' || !text().trim() ? 0.6 : 1,
              }}
            >
              {status() === 'submitting' ? t('bugreport.sending') : t('bugreport.submit')}
            </button>
          </div>
          <Show when={errorMsg()}>
            <div style={{ color: '#c33', 'font-size': '0.72rem' }}>
              {t('bugreport.sendError', { error: errorMsg() ?? '' })}
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
}
