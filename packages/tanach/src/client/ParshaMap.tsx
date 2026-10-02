import { ReadingMap } from '@corpus/ui/ReadingMap';
import type { JSX } from 'solid-js';
import { formatGeneratedText } from '../lib/displayText';
import { hebrewNumeral } from '../lib/hebrew';
import { layoutParshaColumn, type ParshaStudy } from '../lib/parsha';

export { PARSHA_KIND_LABEL } from '@corpus/ui/ReadingMap';
export interface ParshaMapProps {
  study: ParshaStudy;
  lang: 'en' | 'he';
  selected: number | null;
  onSelect: (index: number) => void;
  onHover?: (index: number | null) => void;
  onOpenVerse: (chapter: number, verse: number) => void;
}
export function ParshaMap(props: ParshaMapProps): JSX.Element {
  return (
    <ReadingMap
      {...props}
      study={{
        ...props.study,
        landmarks: props.study.landmarks.map((landmark) => ({
          ...landmark,
          labelEn: formatGeneratedText(landmark.labelEn, 'en', props.study.terms ?? []),
        })),
        flow: props.study.flow.map((section) => ({
          ...section,
          titleEn: formatGeneratedText(section.titleEn, 'en', props.study.terms ?? []),
        })),
      }}
      height={430}
      formatDivision={hebrewNumeral}
      column={layoutParshaColumn(props.study.map?.units ?? [], {
        totalVerses: props.study.map?.totalVerses ?? 0,
        height: 430,
        minGap: 24,
      })}
    />
  );
}
