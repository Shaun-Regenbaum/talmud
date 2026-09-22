import { createUniqueId, type JSX } from 'solid-js';
import './graph.css';

export interface GraphEdgeProps {
  path: string;
  color: string;
  label: string;
  dash?: string;
  opacity?: number;
  selected?: boolean;
  arrow?: boolean;
  onSelect?: () => void;
  onFocus?: (focused: boolean) => void;
}

/** A fixed-size arrow, a generous hit area, and a unique marker per mounted edge. */
export function GraphEdge(props: GraphEdgeProps): JSX.Element {
  const id = `graph-arrow-${createUniqueId()}`;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: selectable SVG edges receive a button role and keyboard handlers; passive edges only expose their label
    <g
      class="ui-graph-edge"
      role={props.onSelect ? 'button' : undefined}
      tabindex={props.onSelect ? 0 : undefined}
      aria-label={props.label}
      style={{ color: props.color, opacity: props.opacity ?? 1 }}
      onClick={() => props.onSelect?.()}
      onPointerEnter={() => props.onFocus?.(true)}
      onPointerLeave={() => props.onFocus?.(false)}
      onFocus={() => props.onFocus?.(true)}
      onBlur={() => props.onFocus?.(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelect?.();
        }
      }}
    >
      <title>{props.label}</title>
      <defs>
        <marker
          id={id}
          markerUnits="userSpaceOnUse"
          viewBox="0 0 8 8"
          markerWidth="9"
          markerHeight="9"
          refX="8"
          refY="4"
          orient="auto"
        >
          <path d="M0 0L8 4L0 8Z" fill="currentColor" />
        </marker>
      </defs>
      <path d={props.path} fill="none" stroke="transparent" stroke-width="14" />
      <path
        class="ui-graph-edge-line"
        d={props.path}
        fill="none"
        stroke="currentColor"
        stroke-width={props.selected ? 2.5 : 1.5}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray={props.dash}
        marker-end={props.arrow === false ? undefined : `url(#${id})`}
      />
    </g>
  );
}
