import { createSignal, For, type JSX, Show } from 'solid-js';
import { InlineHint } from '../InlineHint';
import { Prose } from '../Prose';
import {
  ChoiceCard,
  FilterChip,
  Input,
  SectionHeading,
  SourceCard,
  StatCard,
  StatusMessage,
} from '../Study';
import example from './content/parsha.json';
import { type GalleryLang, t } from './i18n';

export function StudyExamples(props: { lang: GalleryLang }): JSX.Element {
  const [index, setIndex] = createSignal(0);
  const [filter, setFilter] = createSignal<'all' | 'selected'>('all');
  const label = (key: Parameters<typeof t>[0]) => t(key, props.lang);
  const pick = (en: string, he: string) => (props.lang === 'he' ? he || en : en || he);
  const selected = () => example.data.flow[index()];
  return (
    <section id="studyControls">
      <h2>{label('studyControls')}</h2>
      <p>{label('studyControlsHint')}</p>
      <div class="gallery-chart-grid">
        <StatCard label={label('portionFlow')} value={example.data.flow.length} />
        <StatCard label={label('versesCount')} value={example.data.map.totalVerses} />
      </div>
      <SectionHeading title={label('sourceChoices')} detail={example.data.ref} />
      <div class="gallery-row">
        <FilterChip
          active={filter() === 'all'}
          onClick={() => setFilter('all')}
          count={example.data.flow.length}
        >
          {label('allChoices')}
        </FilterChip>
        <FilterChip
          active={filter() === 'selected'}
          onClick={() => setFilter('selected')}
          count={1}
        >
          {label('selected')}
        </FilterChip>
        <label for="gallery-study-index">
          {label('section')}{' '}
          <Input
            id="gallery-study-index"
            type="number"
            min={1}
            max={example.data.flow.length}
            value={index() + 1}
            onChange={(e) =>
              setIndex(
                Math.max(
                  0,
                  Math.min(
                    example.data.flow.length - 1,
                    Math.floor(Number(e.currentTarget.value) || 1) - 1,
                  ),
                ),
              )
            }
          />
        </label>
      </div>
      <div class="gallery-choice-list">
        <For each={example.data.flow}>
          {(section, i) => (
            <Show when={filter() === 'all' || i() === index()}>
              <ChoiceCard
                active={index() === i()}
                onClick={() => setIndex(i())}
                title={pick(section.titleEn, section.titleHe)}
                detail={section.ref}
              />
            </Show>
          )}
        </For>
      </div>
      <SourceCard title={pick(selected().titleEn, selected().titleHe)} reference={selected().ref}>
        <Prose en={selected().summaryEn} he={selected().summaryHe} lang={props.lang} />
      </SourceCard>
      <Show when={example.data.terms[0]}>
        {(term) => (
          <p>
            <InlineHint
              label={`${term().he}: ${term().en}`}
              content={
                <>
                  <bdi>{term().he}</bdi>
                  <span>{term().en}</span>
                </>
              }
            >
              {term().he}
            </InlineHint>{' '}
            · {label('hintHelp')}
          </p>
        )}
      </Show>
      <SectionHeading title={label('statusExamples')} />
      <StatusMessage tone="empty">{label('emptyExample')}</StatusMessage>
      <StatusMessage tone="paused">{label('pausedExample')}</StatusMessage>
      <code class="gallery-source">@corpus/ui/Study · InlineHint</code>
    </section>
  );
}
