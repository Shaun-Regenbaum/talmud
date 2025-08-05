/**
 * @fileoverview Constants for Daf Renderer
 * 
 * This module contains all the magic numbers and constants used throughout
 * the daf renderer. These values have been fine-tuned to create the optimal
 * visual layout for Talmud pages.
 */

/**
 * Layout calculation constants
 * @const {Object}
 */
export const LAYOUT_CONSTANTS = {
  /**
   * Number of lines reserved for header/title sections
   * @type {number}
   */
  HEADER_LINES: 4,
  
  /**
   * Multiplier for calculating start spacer height (4.3 lines)
   * @type {number}
   */
  START_SPACER_MULTIPLIER: 4.3,
  
  /**
   * Threshold for detecting excessive spacing
   * If content fills less than 30% of container, it's considered excessive
   * @type {number}
   */
  EXCESSIVE_SPACING_THRESHOLD: 0.3,
  
  /**
   * Multiplier used for special exception cases
   * @type {number}
   */
  EXCEPTION_MULTIPLIER: 2.2,
  
  /**
   * Default amud (page side) - 'a' is right side, 'b' is left side
   * @type {string}
   */
  DEFAULT_AMUD: 'a'
};

/**
 * Delay for debouncing window resize events (milliseconds)
 * @const {number}
 */
export const RESIZE_DEBOUNCE_DELAY = 100;

/**
 * Possible layout types based on text proportions
 * @const {Object}
 */
export const LAYOUT_TYPES = {
  /** Main text is smallest, commentaries wrap around it */
  DOUBLE_WRAP: 'double-wrap',
  
  /** Main text is middle-sized, creates stair-step effect */
  STAIRS: 'stairs', 
  
  /** Main text is largest, extends past both commentaries */
  DOUBLE_EXTEND: 'double-extend'
};