import type { GraphLabels } from '@corpus/ui/GraphView';
import { t } from './i18n';

export const graphLabels = (): GraphLabels => ({
  title: t('arggraph.title'),
  expand: t('graph.expand'),
  close: t('graph.close'),
  vertical: t('graph.vertical'),
  horizontal: t('graph.horizontal'),
  zoomIn: t('graph.zoomIn'),
  zoomOut: t('graph.zoomOut'),
  fit: t('graph.fit'),
  readingOrder: t('graph.readingOrder'),
  sections: t('graph.sectionsOnly'),
  statements: t('graph.statements'),
  inspect: t('graph.inspect'),
});
