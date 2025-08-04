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
    main: "20px",
    side: "15px",
  },
  // More padding for better spacing
  padding: {
    vertical: "12px",
    horizontal: "20px",
  },
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
    main: "18px",
    side: "13px",
  },
  padding: {
    vertical: "8px",
    horizontal: "12px",
  }
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