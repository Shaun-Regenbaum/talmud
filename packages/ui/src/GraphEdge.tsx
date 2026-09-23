import { createUniqueId, type JSX } from 'solid-js';
import './graph.css';

export interface GraphEdgeProps {
  path: string;
  color: string;
  label: string;
  dash?: string;
  opacity?: number;
  selected?: boolean;
  highlighted?: boolean;
  edgeId?: string;
  arrow?: boolean;
  onSelect?: () => void;
  onFocus?: (focused: boolean) => void;
}

/** A fixed-size arrow, a generous hit area, and a unique marker per mounted edge. */
export function GraphEdge(props: GraphEdgeProps): JSX.Element {
  const id = `graph-arrow-${createUniqueId()}`;
  let hovered = false,
    focused = false;
  const reportFocus = () => props.onFocus?.(hovered || focused);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: selectable SVG edges receive a button role and keyboard handlers; passive edges only expose their label
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-pressed is supplied only with the conditional button role
    <g
      class="ui-graph-edge"
      role={props.onSelect ? 'button' : undefined}
      tabindex={props.onSelect ? 0 : undefined}
      aria-label={props.label}
      aria-pressed={props.onSelect ? props.selected : undefined}
      data-graph-edge={props.edgeId}
      style={{ color: props.color, opacity: props.opacity ?? 1 }}
      onClick={() => props.onSelect?.()}
      onPointerEnter={() => {
        hovered = true;
        reportFocus();
      }}
      onPointerLeave={() => {
        hovered = false;
        reportFocus();
      }}
      onFocus={() => {
        focused = true;
        reportFocus();
      }}
      onBlur={() => {
        focused = false;
        reportFocus();
      }}
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
        stroke-width={props.selected || props.highlighted ? 2.5 : 1.5}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray={props.dash}
        marker-end={props.arrow === false ? undefined : `url(#${id})`}
      />
    </g>
  );
}
