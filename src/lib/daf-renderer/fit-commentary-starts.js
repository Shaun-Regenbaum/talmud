import { fitSingleLine } from './calculate-spacers.js';

/**
 * Ensures commentary start lines (first 4 lines) fit within their width
 * by adjusting font size if needed
 * 
 * @param {Array} lines - Array of text lines
 * @param {Object} options - Renderer options
 * @param {HTMLElement} dummy - Dummy element for measurements
 * @param {boolean} isInner - Whether this is inner (Rashi) or outer (Tosafot)
 * @returns {Array} Modified lines with adjusted font sizes if needed
 */
export function fitCommentaryStarts(lines, options, dummy, isInner = true) {
  if (!lines || lines.length === 0) return lines;
  
  // Calculate the side width
  const contentWidth = parseFloat(options.contentWidth);
  const mainWidth = 0.01 * parseFloat(options.mainWidth);
  const sideWidth = contentWidth * (1 - mainWidth) / 2;
  
  // Get font options
  const fontFamily = isInner ? options.fontFamily.inner : options.fontFamily.outer;
  const fontSize = parseFloat(options.fontSize.side);
  const lineHeight = parseFloat(options.lineHeight.side);
  
  // Process first 4 lines to ensure they fit
  const processedLines = [...lines];
  
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    
    // Check if this line needs adjustment
    const fitted = fitSingleLine(
      line,
      fontFamily,
      fontSize,
      sideWidth,
      lineHeight,
      dummy,
      {
        preferFontAdjustment: true,
        minFontSize: fontSize * 0.8, // Don't go below 80% of original
        maxWidth: sideWidth // Don't increase width for start lines
      }
    );
    
    if (fitted.adjusted) {
      // Wrap the line with a span that has the adjusted font size
      processedLines[i] = `<span style="font-size: ${fitted.fontSize}px">${line}</span>`;
      console.log(`📏 Adjusted start line ${i + 1} font from ${fontSize}px to ${fitted.fontSize}px`);
    }
  }
  
  return processedLines;
}

/**
 * Pre-process commentary text arrays to ensure start lines fit
 * 
 * @param {Object} textArrays - Object with main, rashi, tosafot arrays
 * @param {Object} options - Renderer options
 * @param {HTMLElement} dummy - Dummy element for measurements
 * @returns {Object} Modified text arrays
 */
export function preprocessCommentaryLines(textArrays, options, dummy) {
  return {
    main: textArrays.main,
    rashi: fitCommentaryStarts(textArrays.rashi, options, dummy, true),
    tosafot: fitCommentaryStarts(textArrays.tosafot, options, dummy, false)
  };
}