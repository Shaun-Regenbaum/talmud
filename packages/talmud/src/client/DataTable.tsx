import { type DataTableProps, DataTable as SharedDataTable } from '@corpus/ui/DataTable';
import type { JSX } from 'solid-js';
import { t } from './i18n';

export {
  type Align,
  type Column,
  HitChip,
  heatColor,
  Meter,
  RankedBars,
  type RankedItem,
} from '@corpus/ui/DataTable';
export function DataTable<T>(props: Omit<DataTableProps<T>, 'labels'>): JSX.Element {
  return (
    <SharedDataTable
      {...props}
      labels={{
        get empty() {
          return t('usage.table.empty');
        },
        get showLess() {
          return t('usage.table.showLess');
        },
        showMore: (count) => t('usage.table.showMore', { count: String(count) }),
      }}
    />
  );
}
