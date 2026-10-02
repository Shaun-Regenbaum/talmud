import { BidiText } from '@corpus/ui/BidiText';
import type { JSX } from 'solid-js';
import { useDisplayText } from './displayText';

export { BidiText, bidiSegments } from '@corpus/ui/BidiText';

export function Hebraized(props: {
  text: string | undefined | null;
  capitalize?: boolean;
}): JSX.Element {
  const out = useDisplayText(
    () => props.text ?? '',
    () => ({ capitalize: props.capitalize }),
  );
  return <BidiText text={out()} />;
}
