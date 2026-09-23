// Real cached Berakhot 2a annotations from the existing golden-anchor fixtures.
import type { GraphConnection, GraphGroup } from '@corpus/ui/graph/model';
import { buildStatementSpine } from '../../src/lib/typing/statementSpine';
import sections from './golden-anchors/berakhot_2a_argument.json';
import moves from './golden-anchors/berakhot_2a_argument-move.json';

export const graphs = sections.raw.instances.map((section, index) => ({
  id: `section:${index}`,
  title: section.fields.title,
  spine: buildStatementSpine({
    moves: moves.raw.instances.filter(
      (move) =>
        move.fields.sectionStartSegIdx === section.startSegIdx &&
        move.fields.sectionEndSegIdx === section.endSegIdx,
    ),
  }),
}));
export const groups: GraphGroup[] = graphs.map(({ id, title, spine }) => ({
  id,
  label: title,
  expanded: true,
  children: spine.nodes.map((n) => ({
    id: n.id,
    label: n.summary || n.speaker,
    role: n.role,
    detail: n.excerpt,
  })),
}));
export const edges: GraphConnection[] = graphs.flatMap(({ spine }) =>
  spine.links.map((edge, i) => ({
    id: `${edge.from}:${i}`,
    from: edge.from,
    to: edge.to,
    label: edge.relation,
    color: '#666',
  })),
);
