/**
 * @fileoverview Default Options for Daf Renderer
 * 
 * This module defines the default configuration options for rendering Talmud pages.
 * These options control fonts, sizes, spacing, and layout proportions.
 */

/**
 * Default configuration options for daf renderer
 * @type {Object}
 * @property {string} contentWidth - Total width of the daf in CSS units
 * @property {string} mainWidth - Percentage width of main text column
 * @property {Object} padding - Vertical and horizontal padding
 * @property {string} innerPadding - Padding between inner commentary sections
 * @property {string} outerPadding - Padding between outer commentary sections
 * @property {string} halfway - Percentage for header alignment calculation
 * @property {Object} fontFamily - Font families for different sections
 * @property {string} direction - Text direction (rtl for Hebrew)
 * @property {Object} fontSize - Font sizes for main and side texts
 * @property {Object} lineHeight - Line heights for main and side texts
 */
const defaultOptions = {
  contentWidth: "600px",
  mainWidth: "50%",
  padding: {
    vertical: "10px",
    horizontal: "16px",
  },
  innerPadding: "4px",
  outerPadding: "4px",
  halfway: "50%",
  fontFamily: {
    inner: "Rashi",
    outer: "Rashi",
    main: "Vilna"
  },
  direction: "rtl",
  fontSize: {
    main: "15px",
    side: "10.5px"
  },
  lineHeight: {
    main: "17px",
    side: "14px",
  }
}

/**
 * Merges user options with defaults and validates types
 * @param {Object} modified - User-provided options
 * @param {Object} definitional - Default options to merge with
 * @returns {Object} Merged options object
 */
function mergeAndClone (modified, definitional = defaultOptions) {
  const newOptions = {};
  for (const key in definitional) {
    if (key in modified) {
      const defType = typeof definitional[key];
      if (typeof modified[key] !== defType) {
        console.error(`Option ${key} must be of type ${defType}; ${typeof modified[key]} was passed.`);
      }
      if (defType == "object") {
        newOptions[key] = mergeAndClone(modified[key], definitional[key])
      } else {
        newOptions[key] = modified[key];
      }
    } else {
      newOptions[key] = definitional[key];
    }
  }
  return newOptions;
}

export {defaultOptions, mergeAndClone}
