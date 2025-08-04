import { LAYOUT_CONSTANTS } from './constants.js';

/**
 * Calculate the area of text when rendered with specific styling
 * @param {string} text - HTML text content
 * @param {string} font - Font family
 * @param {number} fs - Font size in pixels
 * @param {number} width - Container width in pixels
 * @param {number} lh - Line height in pixels
 * @param {HTMLElement} dummy - Dummy container for measurement
 * @returns {number} Area of rendered text in square pixels
 */
function getAreaOfText(text, font, fs, width, lh, dummy) {
  const testDiv = document.createElement("div");
  testDiv.style.font = `${fs}px ${font}`;
  testDiv.style.width = `${width}px`;
  testDiv.style.lineHeight = `${lh}px`;
  testDiv.innerHTML = text;
  dummy.append(testDiv);
  const height = testDiv.clientHeight;
  const actualWidth = testDiv.clientWidth;
  const test_area = height * actualWidth;
  testDiv.remove();
  return test_area;
}

/**
 * Helper function to ensure single-line content fits on one line
 * @param {string} text - HTML text content
 * @param {string} font - Font family
 * @param {number} baseFontSize - Starting font size in pixels
 * @param {number} baseWidth - Starting container width in pixels
 * @param {number} lineHeight - Line height in pixels
 * @param {HTMLElement} dummy - Dummy container for measurement
 * @param {Object} options - Adjustment options
 * @returns {Object} Adjusted parameters {fontSize, width, actualHeight}
 */
function fitSingleLine(text, font, baseFontSize, baseWidth, lineHeight, dummy, options = {}) {
  const {
    preferFontAdjustment = true, // Prefer adjusting font over width
    minFontSize = baseFontSize * 0.7, // Don't go below 70% of original
    maxFontSize = baseFontSize, // Don't exceed original size
    minWidth = baseWidth,
    maxWidth = baseWidth * 1.2, // Allow up to 20% width increase
    tolerance = 2 // Pixel tolerance for "single line"
  } = options;
  
  // First check if it already fits
  const testDiv = document.createElement("div");
  testDiv.style.font = `${baseFontSize}px ${font}`;
  testDiv.style.width = `${baseWidth}px`;
  testDiv.style.lineHeight = `${lineHeight}px`;
  testDiv.style.position = "absolute";
  testDiv.style.whiteSpace = "nowrap"; // Force single line to measure
  testDiv.innerHTML = text;
  dummy.append(testDiv);
  
  const singleLineHeight = testDiv.offsetHeight;
  const textWidth = testDiv.scrollWidth; // Actual width needed
  
  // Now check with normal wrapping
  testDiv.style.whiteSpace = "normal";
  const wrappedHeight = testDiv.offsetHeight;
  
  testDiv.remove();
  
  // If it already fits on one line, return original values
  if (Math.abs(wrappedHeight - singleLineHeight) <= tolerance) {
    return {
      fontSize: baseFontSize,
      width: baseWidth,
      actualHeight: wrappedHeight,
      adjusted: false
    };
  }
  
  let adjustedFontSize = baseFontSize;
  let adjustedWidth = baseWidth;
  
  // Calculate how much we need to adjust
  const widthRatio = textWidth / baseWidth;
  
  if (preferFontAdjustment) {
    // Try font size adjustment first
    adjustedFontSize = baseFontSize / widthRatio;
    
    // Clamp to limits
    if (adjustedFontSize < minFontSize) {
      // Font would be too small, try width adjustment
      adjustedFontSize = minFontSize;
      adjustedWidth = textWidth * (minFontSize / baseFontSize);
      adjustedWidth = Math.min(adjustedWidth, maxWidth);
    } else if (adjustedFontSize > maxFontSize) {
      adjustedFontSize = maxFontSize;
    }
  } else {
    // Try width adjustment first
    adjustedWidth = Math.min(textWidth, maxWidth);
    
    // If still doesn't fit, adjust font size
    if (adjustedWidth < textWidth) {
      const remainingRatio = textWidth / adjustedWidth;
      adjustedFontSize = baseFontSize / remainingRatio;
      adjustedFontSize = Math.max(adjustedFontSize, minFontSize);
    }
  }
  
  // Verify the adjustment worked
  const verifyDiv = document.createElement("div");
  verifyDiv.style.font = `${adjustedFontSize}px ${font}`;
  verifyDiv.style.width = `${adjustedWidth}px`;
  verifyDiv.style.lineHeight = `${lineHeight * (adjustedFontSize / baseFontSize)}px`;
  verifyDiv.innerHTML = text;
  dummy.append(verifyDiv);
  const finalHeight = verifyDiv.offsetHeight;
  verifyDiv.remove();
  
  console.log('📏 Single line adjustment:', {
    original: { fontSize: baseFontSize, width: baseWidth },
    adjusted: { fontSize: adjustedFontSize.toFixed(1), width: adjustedWidth.toFixed(1) },
    textSample: text.substring(0, 50)
  });
  
  return {
    fontSize: adjustedFontSize,
    width: adjustedWidth,
    actualHeight: finalHeight,
    adjusted: true
  };
}

/**
 * Parse and normalize options from string values to numbers
 * @param {Object} options - Raw options object
 * @returns {Object} Parsed options with numeric values
 */
function parseOptions(options) {
  return {
    width: parseFloat(options.contentWidth),
    padding: {
      vertical: parseFloat(options.padding.vertical),
      horizontal: parseFloat(options.padding.horizontal)
    },
    halfway: 0.01 * parseFloat(options.halfway),
    fontFamily: options.fontFamily,
    fontSize: {
      main: parseFloat(options.fontSize.main),
      side: parseFloat(options.fontSize.side),
    },
    lineHeight: {
      main: parseFloat(options.lineHeight.main),
      side: parseFloat(options.lineHeight.side),
    },
    mainWidth: 0.01 * parseFloat(options.mainWidth)
  };
}

/**
 * Calculate layout dimensions based on parsed options
 * @param {Object} parsedOptions - Parsed options with numeric values
 * @returns {Object} Layout dimensions
 */
function calculateLayoutDimensions(parsedOptions) {
  return {
    midWidth: parsedOptions.width * parsedOptions.mainWidth - 2 * parsedOptions.padding.horizontal,
    topWidth: parsedOptions.width * parsedOptions.halfway - parsedOptions.padding.horizontal,
    sideWidth: parsedOptions.width * (1 - parsedOptions.mainWidth) / 2
  };
}

function calculateSpacers(mainText, innerText, outerText, options, dummy) {
  const parsedOptions = parseOptions(options);
  const { midWidth, topWidth, sideWidth } = calculateLayoutDimensions(parsedOptions);

  // Initialize spacer heights
  const spacerHeights = {
    start: LAYOUT_CONSTANTS.START_SPACER_MULTIPLIER * parsedOptions.lineHeight.side,
    inner: null,
    outer: null,
    end: 0,
    exception: 0
  };

  // Note: Line break handling is done in calculate-spacers-breaks.js


  // Calculate padding corrections
  const paddingAreas = {
    name: "paddingAreas",
    horizontalSide: sideWidth * parsedOptions.padding.vertical,
  };

  // Calculate area taken by header lines
  const topArea = (lineHeight) => LAYOUT_CONSTANTS.HEADER_LINES * lineHeight * topWidth;

  /**
   * Create text measurement object
   * @param {string} name - Text section name
   * @param {string} text - HTML text content
   * @param {number} width - Container width
   * @param {Object} style - Font and line height settings
   * @param {boolean} adjustForHeader - Whether to subtract header area
   * @returns {Object} Text measurement object
   */
  function createTextMeasurement(name, text, width, style, adjustForHeader = false) {
    const rawArea = getAreaOfText(text, style.font, style.fontSize, width, style.lineHeight, dummy);
    const area = adjustForHeader ? rawArea - topArea(style.lineHeight) : rawArea;
    
    return {
      name,
      width,
      text,
      lineHeight: style.lineHeight,
      area,
      length: null,
      height: null,
    };
  }

  // Create text measurements for each section
  const main = createTextMeasurement(
    "main",
    mainText,
    midWidth,
    {
      font: parsedOptions.fontFamily.main,
      fontSize: parsedOptions.fontSize.main,
      lineHeight: parsedOptions.lineHeight.main
    }
  );

  const outer = createTextMeasurement(
    "outer",
    outerText,
    sideWidth,
    {
      font: parsedOptions.fontFamily.outer,
      fontSize: parsedOptions.fontSize.side,
      lineHeight: parsedOptions.lineHeight.side
    },
    true // adjust for header
  );

  const inner = createTextMeasurement(
    "inner",
    innerText,
    sideWidth,
    {
      font: parsedOptions.fontFamily.inner,
      fontSize: parsedOptions.fontSize.side,
      lineHeight: parsedOptions.lineHeight.side
    },
    true // adjust for header
  );

  // Calculate heights for all text sections
  const texts = [main, outer, inner];
  texts.forEach(text => {
    text.height = text.area / text.width;
    text.unadjustedArea = text.area + topArea(parsedOptions.lineHeight.side);
    text.unadjustedHeight = text.unadjustedArea / text.width;
  });

  const perHeight = Array.from(texts).sort((a, b) => a.height - b.height);
 
  // Layout Types:
  // - Double-Wrap: Main text is smallest, commentaries wrap around it
  // - Stairs: Main text is middle-sized, wraps around one commentary
  // - Double-Extend: Main text is largest, wraps around both commentaries

  /**
   * Validate that we have sufficient commentary text
   * @returns {Object|null} Default spacer heights if no commentary, null otherwise
   */
  function validateCommentaryText() {
    if (inner.height <= 0 && outer.height <= 0) {
      // No commentary - return default spacer heights for main text only
      console.warn("No commentary text provided. Rendering main text only.");
      spacerHeights.inner = 0;
      spacerHeights.outer = 0;
      spacerHeights.end = main.height;
      return spacerHeights;
    }
    
    if (inner.height <= spacerHeights.start && outer.height <= spacerHeights.start) {
      // Very little commentary - use minimal heights
      console.warn("Insufficient commentary text. Using minimal spacer heights.");
      spacerHeights.inner = inner.height || 0;
      spacerHeights.outer = outer.height || 0;
      spacerHeights.end = 0;
      return spacerHeights;
    }
    
    return null;
  }

  /**
   * Handle edge case where one commentary has insufficient text
   * @returns {Object|null} Spacer heights if edge case applies, null otherwise
   */
  function handleInsufficientCommentary() {
    const headerArea = parsedOptions.width * LAYOUT_CONSTANTS.HEADER_LINES * parsedOptions.lineHeight.side;
    
    if (inner.unadjustedHeight <= spacerHeights.start) {
      spacerHeights.inner = inner.unadjustedHeight;
      spacerHeights.outer = (outer.unadjustedArea - headerArea) / sideWidth;
      spacerHeights.exception = 1;
      return spacerHeights;
    }
    
    if (outer.unadjustedHeight <= spacerHeights.start) {
      spacerHeights.outer = outer.unadjustedHeight;
      spacerHeights.inner = (inner.unadjustedArea - headerArea) / sideWidth;
      spacerHeights.exception = 2;
      return spacerHeights;
    }
    
    return null;
  }

  // Validate commentary text
  const validationResult = validateCommentaryText();
  if (validationResult) return validationResult;

  // Handle edge cases
  if (inner.unadjustedHeight <= spacerHeights.start || outer.unadjustedHeight <= spacerHeights.start) {
    const edgeCaseResult = handleInsufficientCommentary();
    if (edgeCaseResult) return edgeCaseResult;
    return new Error("Unexpected error calculating inner spacer heights");
  }

  /**
   * Calculate spacer heights for Double-Wrap layout
   * @returns {Object} Spacer heights
   */
  function calculateDoubleWrap() {
    spacerHeights.inner = main.area / midWidth;
    spacerHeights.outer = spacerHeights.inner;
    
    const sideArea = spacerHeights.inner * sideWidth + paddingAreas.horizontalSide;
    const bottomChunk = perHeight[1].area - sideArea;
    const bottomHeight = bottomChunk / topWidth;
    spacerHeights.end = bottomHeight;
    
    return spacerHeights;
  }

  /**
   * Calculate spacer heights for Stairs layout
   * @returns {Object|null} Spacer heights if stairs layout applies, null otherwise
   */
  function calculateStairs() {
    // The remaining two texts form a "block" that we must compare with the bottom text
    const blockArea = main.area + perHeight[0].area;
    const blockWidth = midWidth + sideWidth;
    const blockHeight = blockArea / blockWidth;

    const stair = perHeight[1].name === "main" ? perHeight[2] : perHeight[1];
    const stairHeight = stair.area / stair.width;

    if (blockHeight < stairHeight) {
      // Account for extra space introduced by padding
      const paddingAdjustment = (height1, height2, horizPadding) => horizPadding * (height1 - height2);
      const smallest = perHeight[0];
      
      spacerHeights[smallest.name] = smallest.height;
      spacerHeights[stair.name] = (blockArea - paddingAdjustment(blockHeight, spacerHeights[smallest.name], parsedOptions.padding.horizontal)) / blockWidth;
      
      return spacerHeights;
    }
    
    return null;
  }

  /**
   * Calculate spacer heights for Double-Extend layout
   * @returns {Object} Spacer heights
   */
  function calculateDoubleExtend() {
    spacerHeights.inner = inner.height;
    spacerHeights.outer = outer.height;
    return spacerHeights;
  }

  // Determine layout type and calculate accordingly
  if (perHeight[0].name === "main") {
    // Double-Wrap: main text is smallest
    return calculateDoubleWrap();
  }

  // Try Stairs layout
  const stairsResult = calculateStairs();
  if (stairsResult) {
    return stairsResult;
  }

  // Default to Double-Extend
  return calculateDoubleExtend();
}


export default calculateSpacers;
export { fitSingleLine };