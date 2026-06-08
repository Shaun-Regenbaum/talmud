import { createEffect, onCleanup, type JSX } from 'solid-js';
// @ts-expect-error - daf-renderer ships without types
import Daf from 'daf-renderer';

export interface NpmSpacerReport {
  start: number;
  inner: number;
  outer: number;
  end: number;
  exception?: number;
}

export interface DafRendererNpmProps {
  main: string;
  inner: string;
  outer: string;
  amud?: 'a' | 'b';
  contentWidth?: number;
  mainWidth?: number;
  fontSize?: { main: number; side: number };
  lineHeight?: { main: number; side: number };
  onSpacers?: (s: NpmSpacerReport) => void;
}

export function DafRendererNpm(props: DafRendererNpmProps): JSX.Element {
  let host: HTMLDivElement | undefined;
  let instance: {
    render: (main: string, inner: string, outer: string, amud: string, linebreak?: undefined, cb?: () => void) => void;
    spacerHeights: NpmSpacerReport;
  } | undefined;

  // Recreate the daf-renderer instance whenever its construction-time options
  // (width, font sizes) change. Text-only changes reuse the same instance.
  createEffect(() => {
    if (!host) return;
    const cw = props.contentWidth ?? 720;
    const mw = props.mainWidth ?? 0.48;
    const fs = props.fontSize ?? { main: 15, side: 10.5 };
    const lh = props.lineHeight ?? { main: 17, side: 14 };
    host.innerHTML = '';
    const target = document.createElement('div');
    host.appendChild(target);
    instance = Daf(target, {
      contentWidth: `${cw}px`,
      mainWidth: `${mw * 100}%`,
      fontSize: { main: `${fs.main}px`, side: `${fs.side}px` },
      lineHeight: { main: `${lh.main}px`, side: `${lh.side}px` },
      fontFamily: { main: 'Mekorot Vilna', inner: 'Mekorot Rashi', outer: 'Mekorot Rashi' },
    });
    instance!.render(
      props.main,
      props.inner,
      props.outer,
      props.amud ?? 'a',
      undefined,
      () => {
        if (props.onSpacers && instance) props.onSpacers({ ...instance.spacerHeights });
      },
    );
  });

  // Text-only updates — re-render without recreating instance
  createEffect(() => {
    const _triggers = [props.main, props.inner, props.outer, props.amud];
    void _triggers;
    if (instance) {
      instance.render(
        props.main,
        props.inner,
        props.outer,
        props.amud ?? 'a',
        undefined,
        () => {
          if (props.onSpacers && instance) props.onSpacers({ ...instance.spacerHeights });
        },
      );
    }
  });

  onCleanup(() => {
    if (host) host.innerHTML = '';
    instance = undefined;
  });

  return <div ref={host} />;
}
