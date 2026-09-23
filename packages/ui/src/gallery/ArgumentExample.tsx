import { createMemo, createSignal, type JSX } from 'solid-js';
import { type GraphConnection, type GraphGroup, GraphView } from '../GraphView';
import saved from './content/berakhot-argument.json';
import { type GalleryKey, type GalleryLang, t } from './i18n';

// Roles and connections come from the recorded response, without added links.
const roles: Record<string, { label: GalleryKey; color: string }> = {
  opening: { label: 'graphOpening', color: '#5b5f66' },
  question: { label: 'graphQuestion', color: '#3b5a78' },
  answer: { label: 'graphAnswer', color: '#4c6b48' },
  resolution: { label: 'graphResolution', color: '#4c6b48' },
  'supporting-evidence': { label: 'graphEvidence', color: '#3f6b73' },
};
const relations: Record<string, GalleryKey> = {
  continues: 'graphContinues',
  'responds-to': 'graphResponds',
  resolves: 'graphResolves',
};

export function ArgumentExample(props: { lang: GalleryLang }): JSX.Element {
  const label = (key: GalleryKey) => t(key, props.lang);
  const [open, setOpen] = createSignal<string | null>('section:1');
  const [selected, setSelected] = createSignal<string | null>(null);
  const groups = createMemo<GraphGroup[]>(() =>
    saved.data.sections.map((section) => {
      const id = `section:${section.index}`;
      return {
        id,
        label: section.title,
        badge: String(section.index + 1),
        reference: label('graphReference'),
        expanded: open() === id,
        selected: open() === id,
        children: section.spine.nodes.map((node) => ({
          id: `${id}:${node.id}`,
          label: node.speaker,
          summary: node.summary,
          detail: node.excerpt,
          role: roles[node.role] ? label(roles[node.role].label) : node.role,
          color: roles[node.role]?.color,
          badge: 'side' in node ? node.side : undefined,
          badgeColor: 'var(--accent)',
          selected: selected() === `${id}:${node.id}`,
        })),
      };
    }),
  );
  const edges = createMemo<GraphConnection[]>(() => [
    ...saved.data.flow.map((edge, index) => ({
      id: `flow:${index}`,
      from: `section:${edge.from}`,
      to: `section:${edge.to}`,
      label: label(relations[edge.kind]),
      kindLabel: label(relations[edge.kind]),
      color: '#666',
    })),
    ...saved.data.sections.flatMap((section) =>
      section.spine.links.map((edge, index) => ({
        id: `section:${section.index}:edge:${index}`,
        from: `section:${section.index}:${edge.from}`,
        to: `section:${section.index}:${edge.to}`,
        label: label(relations[edge.relation]),
        kindLabel: label(relations[edge.relation]),
        color: '#4c6b48',
        provenance: edge.source === 'role' ? label('graphInferred') : undefined,
      })),
    ),
  ]);
  return (
    <section id="argumentMaps">
      <h2>{label('argumentMaps')}</h2>
      <p>{label('argumentMapsHint')}</p>
      <a href={saved.source} target="_blank" rel="noreferrer">
        {label('graphSavedSource')}
      </a>
      <GraphView
        groups={groups()}
        edges={edges()}
        direction={props.lang === 'he' ? 'rtl' : 'ltr'}
        onSelect={(node) => {
          if (groups().some((group) => group.id === node.id))
            setOpen((current) => (current === node.id ? null : node.id));
          else setSelected(node.id);
        }}
        labels={{
          title: label('argumentMaps'),
          expand: label('graphExpand'),
          close: label('graphClose'),
          clearConnection: label('graphClear'),
          vertical: label('graphStacked'),
          horizontal: label('graphPassage'),
          zoomIn: label('graphZoomIn'),
          zoomOut: label('graphZoomOut'),
          fit: label('graphFit'),
          readingOrder: label('graphReadingOrder'),
          sections: label('graphSections'),
          statements: label('graphStatements'),
          inspect: label('graphInspect'),
        }}
      />
      <code class="gallery-source" dir="ltr">
        @corpus/ui/GraphView · @corpus/ui/GraphConnectionDetails
      </code>
    </section>
  );
}
