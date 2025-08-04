/**
 * Auto-fix layout parameters to resolve line wrapping issues
 */

/**
 * Get actual rendered line count by measuring DOM elements
 */
function getActualRenderedLines(text, font, fontSize, width, lineHeight, dummy) {
  if (!text) return 0;
  
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    visibility: hidden;
    width: ${width}px;
    font-family: ${font};
    font-size: ${fontSize}px;
    line-height: ${lineHeight}px;
    direction: rtl;
    text-align: justify;
    word-wrap: break-word;
    overflow-wrap: break-word;
  `;
  
  container.innerHTML = text;
  dummy.appendChild(container);
  
  const totalHeight = container.offsetHeight;
  const actualLines = Math.round(totalHeight / lineHeight);
  
  console.log(`📏 Measuring ${font} text: width=${width}px, height=${totalHeight}px, lines=${actualLines}, expected=${text.split(/<br>/gi).length}`);
  
  container.remove();
  return Math.max(actualLines, 1); // Ensure at least 1 line
}

/**
 * Suggest optimal layout parameters based on line overflow analysis
 */
export function suggestLayoutFix(mainText, innerText, outerText, currentOptions, dummy) {
  const parsedOptions = {
    width: parseFloat(currentOptions.contentWidth),
    mainWidth: 0.01 * parseFloat(currentOptions.mainWidth),
    fontSize: {
      main: parseFloat(currentOptions.fontSize.main),
      side: parseFloat(currentOptions.fontSize.side)
    },
    lineHeight: {
      main: parseFloat(currentOptions.lineHeight.main),
      side: parseFloat(currentOptions.lineHeight.side)
    },
    fontFamily: currentOptions.fontFamily
  };
  
  const midWidth = parsedOptions.width * parsedOptions.mainWidth;
  const sideWidth = parsedOptions.width * (1 - parsedOptions.mainWidth) / 2;
  
  // Get original line counts vs rendered counts
  const originalCounts = {
    main: mainText.split(/<br>/gi).length,
    inner: innerText.split(/<br>/gi).length,
    outer: outerText.split(/<br>/gi).length
  };
  
  const renderedCounts = {
    main: getActualRenderedLines(mainText, parsedOptions.fontFamily.main, parsedOptions.fontSize.main, midWidth, parsedOptions.lineHeight.main, dummy),
    inner: getActualRenderedLines(innerText, parsedOptions.fontFamily.inner, parsedOptions.fontSize.side, sideWidth, parsedOptions.lineHeight.side, dummy),
    outer: getActualRenderedLines(outerText, parsedOptions.fontFamily.outer, parsedOptions.fontSize.side, sideWidth, parsedOptions.lineHeight.side, dummy)
  };
  
  // Calculate overflow ratios
  const overflowRatios = {
    main: renderedCounts.main / originalCounts.main,
    inner: renderedCounts.inner / originalCounts.inner,
    outer: renderedCounts.outer / originalCounts.outer
  };
  
  // The worst overflow ratio tells us how much we need to expand
  const maxOverflowRatio = Math.max(overflowRatios.main, overflowRatios.inner, overflowRatios.outer);
  
  console.log(`📊 Overflow Analysis:
Original: Main(${originalCounts.main}) Inner(${originalCounts.inner}) Outer(${originalCounts.outer})
Rendered: Main(${renderedCounts.main}) Inner(${renderedCounts.inner}) Outer(${renderedCounts.outer})
Ratios: Main(${overflowRatios.main.toFixed(2)}) Inner(${overflowRatios.inner.toFixed(2)}) Outer(${overflowRatios.outer.toFixed(2)})
Max Overflow: ${maxOverflowRatio.toFixed(2)}x`);
  
  // If overflow is minimal (< 10%), no fix needed
  if (maxOverflowRatio < 1.1) {
    return {
      needsFix: false,
      currentOptions,
      overflowRatios,
      message: "Layout is already optimal"
    };
  }
  
  // Calculate suggested fixes with hard caps
  let suggestions = [];
  
  // Hard caps
  const MAX_CONTENT_WIDTH = 700; // Don't go above 700px
  const MIN_MAIN_WIDTH_PERCENT = 30; // Don't go below 30% for main content
  const MAX_MAIN_WIDTH_PERCENT = 70; // Don't go above 70% for main content
  
  // Option 1: Increase content width to accommodate overflow
  const suggestedContentWidth = Math.ceil(parsedOptions.width * maxOverflowRatio);
  const cappedContentWidth = Math.min(suggestedContentWidth, MAX_CONTENT_WIDTH);
  suggestions.push({
    name: "Increase Content Width",
    contentWidth: cappedContentWidth,
    mainWidthPercent: parseFloat(currentOptions.mainWidth),
    description: `Expand from ${parsedOptions.width}px to ${cappedContentWidth}px`,
    effectiveness: maxOverflowRatio < 1.5 ? "high" : "medium"
  });
  
  // Option 2: Reduce main text width to give more space to commentary
  if (overflowRatios.inner > 1.2 || overflowRatios.outer > 1.2) {
    const currentMainPercent = parseFloat(currentOptions.mainWidth);
    const suggestedMainPercent = Math.max(MIN_MAIN_WIDTH_PERCENT, currentMainPercent - 10); // Reduce by 10%, minimum 30%
    suggestions.push({
      name: "Reduce Main Text Width",
      contentWidth: parseFloat(currentOptions.contentWidth),
      mainWidthPercent: suggestedMainPercent,
      description: `Reduce main text from ${currentMainPercent}% to ${suggestedMainPercent}%`,
      effectiveness: (overflowRatios.inner > overflowRatios.main && overflowRatios.outer > overflowRatios.main) ? "high" : "medium"
    });
  }
  
  // Option 3: Combined approach - moderate increases to both
  const combinedContentWidth = Math.min(Math.ceil(parsedOptions.width * Math.min(maxOverflowRatio * 0.7, 1.3)), MAX_CONTENT_WIDTH);
  const combinedMainPercent = Math.max(MIN_MAIN_WIDTH_PERCENT, Math.min(MAX_MAIN_WIDTH_PERCENT, parseFloat(currentOptions.mainWidth) - 5));
  suggestions.push({
    name: "Balanced Approach",
    contentWidth: combinedContentWidth,
    mainWidthPercent: combinedMainPercent,
    description: `Expand to ${combinedContentWidth}px and reduce main to ${combinedMainPercent}%`,
    effectiveness: "high"
  });
  
  return {
    needsFix: true,
    currentOptions,
    overflowRatios,
    maxOverflowRatio,
    suggestions,
    originalCounts,
    renderedCounts,
    message: `Text is wrapping ${maxOverflowRatio.toFixed(1)}x more than expected`
  };
}

/**
 * Categorize lines by length 
 */
function categorizeLines(text, isCommentary = false) {
  const lines = text.split(/<br>/gi);
  const categories = { empty: [], single: [], short: [], medium: [], long: [], start: [] };
  
  lines.forEach((line, index) => {
    const stripped = line.replace(/<[^>]*>/g, '').trim();
    const length = stripped.length;
    
    if (length === 0) {
      categories.empty.push(index);
    } else if (isCommentary && index < 4) {
      categories.start.push(index);
    } else if (length <= 20) {
      categories.single.push(index);
    } else if (length <= 40) {
      categories.short.push(index);
    } else if (length <= 60) {
      categories.medium.push(index);
    } else {
      categories.long.push(index);
    }
  });
  
  return {
    totalLines: lines.length,
    categories: categories,
    summary: {
      empty: categories.empty.length,
      single: categories.single.length,
      short: categories.short.length,
      medium: categories.medium.length,
      long: categories.long.length,
      start: categories.start.length
    }
  };
}

/**
 * Calculate spacers using the original line counts (what should be used)
 */
export function calculateSpacersFromMeasurements(mainText, innerText, outerText, options, dummy) {
  const analysis = suggestLayoutFix(mainText, innerText, outerText, options, dummy);
  
  // Use ORIGINAL counts for spacer calculation (this is what the layout expects)
  const originalCounts = analysis.originalCounts;
  const renderedCounts = analysis.renderedCounts;
  
  const originalLogic = {
    start: Math.max(Math.min(4, originalCounts.inner), Math.min(4, originalCounts.outer)),
    inner: Math.max(0, originalCounts.inner - 4),
    outer: Math.max(0, originalCounts.outer - 4)
  };
  
  // Also calculate what the rendered logic would be (for comparison)
  const renderedLogic = {
    start: Math.max(Math.min(4, renderedCounts.inner), Math.min(4, renderedCounts.outer)),
    inner: Math.max(0, renderedCounts.inner - 4),
    outer: Math.max(0, renderedCounts.outer - 4)
  };
  
  // Analyze line categories for original text
  const originalLineBreakdown = {
    main: categorizeLines(mainText, false),
    inner: categorizeLines(innerText, true),
    outer: categorizeLines(outerText, true)
  };
  
  const parsedOptions = {
    lineHeight: {
      side: parseFloat(options.lineHeight.side)
    }
  };
  
  const spacerHeights = {
    start: originalLogic.start * parsedOptions.lineHeight.side,
    inner: originalLogic.inner * parsedOptions.lineHeight.side,
    outer: originalLogic.outer * parsedOptions.lineHeight.side,
    end: 0
  };
  
  return {
    texts: {
      main: mainText,
      inner: innerText,
      outer: outerText
    },
    spacerHeights: spacerHeights,
    layoutAnalysis: analysis,
    lineCounts: {
      original: originalCounts,
      rendered: renderedCounts,
      originalLogic: originalLogic,
      renderedLogic: renderedLogic,
      shouldUseOriginal: true
    },
    lineBreakdown: originalLineBreakdown,
    startLineInfo: {
      preservedLines: originalLogic.start,
      calculationMethod: 'original-line-count-with-layout-fix-suggestions'
    }
  };
}