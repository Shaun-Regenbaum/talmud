import { defaultOptions } from '$lib/daf-renderer/options.js';

// Custom options for enhanced rendering
export const customOptions = {
  ...defaultOptions,
  // Slightly larger fonts for better readability
  fontSize: {
    main: "16px",
    side: "11px"
  },
  lineHeight: {
    main: "18px",    // Reduced from 20px to be more proportional
    side: "14px",    // Reduced from 15px
  },
  // Balanced padding - reduced vertical to prevent excessive spacing
  padding: {
    vertical: "8px",   // Reduced from 12px
    horizontal: "18px", // Slightly reduced from 20px
  },
  // Tighter spacing between sections
  innerPadding: "3px",  // Reduced from default 4px
  outerPadding: "3px",  // Reduced from default 4px
  // Use actual Hebrew fonts if available
  fontFamily: {
    inner: "Rashi, 'Mekorot Rashi', serif",
    outer: "Rashi, 'Mekorot Rashi', serif", 
    main: "Vilna, 'Frank Ruehl', serif"
  }
};

// Options for mobile/smaller screens
export const mobileOptions = {
  ...customOptions,
  fontSize: {
    main: "14px",
    side: "10px"
  },
  lineHeight: {
    main: "17px",    // Reduced from 18px for tighter mobile layout
    side: "13px",
  },
  padding: {
    vertical: "6px",   // Reduced from 8px for mobile
    horizontal: "10px", // Reduced from 12px
  },
  // Even tighter spacing for mobile
  innerPadding: "2px",
  outerPadding: "2px",
};

// Options for print
export const printOptions = {
  ...customOptions,
  fontSize: {
    main: "12px",
    side: "9px"
  },
  lineHeight: {
    main: "15px",
    side: "11px",
  },
  padding: {
    vertical: "6px",
    horizontal: "10px",
  }
};