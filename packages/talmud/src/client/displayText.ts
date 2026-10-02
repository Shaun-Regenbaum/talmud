import { rabbiItems } from '@corpus/core/text/bilingual';
import { type DisplayTextOptions, finishDisplayText } from '@corpus/core/text/displayText';
import { prepareDisplayText } from '@corpus/core/text/hebraize';
import { createMemo } from 'solid-js';
import { useBilingual, usePageGlossary } from './bilingual';
import { firstMentionGloss, useConceptLinks } from './conceptLinks';
import { lang } from './i18n';
import { useRabbiLinks } from './rabbiLinkContext';

export { finishDisplayText, plainGeneratedText } from '@corpus/core/text/displayText';

/** Both plain and linked prose use the same input, pair discovery and formatter.
 * Unknown spellings remain readable. A second whole-paragraph rewrite cannot
 * remove English glosses after the formatter has supplied them. */
export function useDisplayText(
  source: () => string,
  options: () => DisplayTextOptions = () => ({}),
): () => string {
  const ctx = useRabbiLinks();
  const glossary = usePageGlossary(() => ctx?.page?.());
  const concept = useConceptLinks();
  const prepared = createMemo(() => prepareDisplayText(source()));
  const judged = useBilingual(prepared);
  return createMemo(() => {
    const settings = options();
    return finishDisplayText(judged().text, {
      ...settings,
      english: settings.english ?? lang() === 'en',
      items: [
        ...judged().pairs,
        ...(settings.items ?? []),
        ...glossary(),
        ...rabbiItems(ctx?.rabbis() ?? []),
      ],
      cleanGlosses:
        settings.cleanGlosses ?? ((text) => firstMentionGloss(text, concept?.matcher() ?? null)),
    });
  });
}
