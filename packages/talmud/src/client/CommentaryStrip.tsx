import { type JSX } from 'solid-js';
import { CommentaryPicker } from './CommentaryPicker';
import type { CommentaryWork, CommentaryComment } from './CommentaryPicker';

interface CommentaryStripProps {
  works: CommentaryWork[] | null;
  loading: boolean;
  activeTitle: string | null;
  onSelect: (title: string | null) => void;
  activeSegIdx: number | null;
  activeComments: CommentaryComment[];
  onCloseSegment: () => void;
  tractate: string;
  page: string;
}

// Thin wrapper: reuses CommentaryPicker's full picker+expansion UI but
// frames it for the left vertical strip (no card shadow, flows with strip
// scroll). When CommentaryPicker renders segment comments it already handles
// Hebrew/English wrapping, so the 240px strip accommodates both.
export function CommentaryStrip(props: CommentaryStripProps): JSX.Element {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.4rem' }}>
      <CommentaryPicker
        works={props.works}
        loading={props.loading}
        activeTitle={props.activeTitle}
        onSelect={props.onSelect}
        activeSegIdx={props.activeSegIdx}
        activeComments={props.activeComments}
        onCloseSegment={props.onCloseSegment}
        tractate={props.tractate}
        page={props.page}
      />
    </div>
  );
}
