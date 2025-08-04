// Constants for daf-renderer calculations

// Layout constants
export const LAYOUT_CONSTANTS = {
  // Number of lines for header/start section
  HEADER_LINES: 4,
  
  // Multiplier for start spacer height (4.3 lines)
  START_SPACER_MULTIPLIER: 4.3,
  
  // Threshold for detecting excessive spacing (30% content)
  EXCESSIVE_SPACING_THRESHOLD: 0.3,
  
  // Exception case multiplier
  EXCEPTION_MULTIPLIER: 2.2,
  
  // Default amud (page side)
  DEFAULT_AMUD: 'a'
};

// Resize debounce delay in milliseconds
export const RESIZE_DEBOUNCE_DELAY = 100;

// Layout types
export const LAYOUT_TYPES = {
  DOUBLE_WRAP: 'double-wrap',
  STAIRS: 'stairs', 
  DOUBLE_EXTEND: 'double-extend'
};