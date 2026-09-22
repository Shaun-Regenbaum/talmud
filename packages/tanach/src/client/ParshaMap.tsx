import { ReadingMap } from '@corpus/ui/ReadingMap';
import type { JSX } from 'solid-js';
import { hebrewNumeral } from '../lib/hebrew';
import { layoutParshaColumn, type ParshaStudy } from '../lib/parsha';

export { PARSHA_KIND_LABEL } from '@corpus/ui/ReadingMap';
export interface ParshaMapProps {
  study: ParshaStudy;
  lang: 'en' | 'he';
  selected: number | null;
  onSelect: (index: number) => void;
  onOpenVerse: (chapter: number, verse: number) => void;
}
export function ParshaMap(props: ParshaMapProps): JSX.Element {
  return (
    <ReadingMap
      {...props}
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
