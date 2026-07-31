import { describe, expect, it } from 'vitest';
import {
  overviewSelectionForSection,
  overviewShowsSectionSummary,
} from '../src/client/ArgumentSidebar';

describe('overview parent-section summary', () => {
  it('shows for parent focus and yields to a nested statement selection', () => {
    expect(overviewShowsSectionSummary(null)).toBe(true);
    expect(overviewShowsSectionSummary('selected-statement')).toBe(false);
  });

  it('returns to the parent level when the focused section is selected again', () => {
    expect(overviewSelectionForSection(2)).toEqual({
      focusedSectionIndex: 2,
      selectedStatementId: null,
      highlightedMoveId: null,
    });
  });
});
