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
    font: ${fontSize}px ${font};
    line-height: ${lineHeight}px;
    direction: rtl;
    text-align: justify;
  `;
  
  container.innerHTML = text;
  dummy.appendChild(container);
  
  const totalHeight = container.offsetHeight;
  const actualLines = Math.round(totalHeight / lineHeight);
  
  container.remove();
  return actualLines;
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
  
  // Calculate suggested fixes
  let suggestions = [];
  
  // Option 1: Increase content width to accommodate overflow
  const suggestedContentWidth = Math.ceil(parsedOptions.width * maxOverflowRatio);
  suggestions.push({
    name: "Increase Content Width",
    contentWidth: Math.min(suggestedContentWidth, 1200), // Cap at 1200px
    mainWidthPercent: parseFloat(currentOptions.mainWidth),
    description: `Expand from ${parsedOptions.width}px to ${Math.min(suggestedContentWidth, 1200)}px`,
    effectiveness: maxOverflowRatio < 1.5 ? "high" : "medium"
  });
  
  // Option 2: Reduce main text width to give more space to commentary
  if (overflowRatios.inner > 1.2 || overflowRatios.outer > 1.2) {
    const currentMainPercent = parseFloat(currentOptions.mainWidth);
    const suggestedMainPercent = Math.max(30, currentMainPercent - 10); // Reduce by 10%, minimum 30%
    suggestions.push({
      name: "Reduce Main Text Width",
      contentWidth: parseFloat(currentOptions.contentWidth),
      mainWidthPercent: suggestedMainPercent,
      description: `Reduce main text from ${currentMainPercent}% to ${suggestedMainPercent}%`,
      effectiveness: (overflowRatios.inner > overflowRatios.main && overflowRatios.outer > overflowRatios.main) ? "high" : "medium"
    });
  }
  
  // Option 3: Combined approach - moderate increases to both
  const combinedContentWidth = Math.ceil(parsedOptions.width * Math.min(maxOverflowRatio * 0.7, 1.3));
  const combinedMainPercent = Math.max(35, parseFloat(currentOptions.mainWidth) - 5);
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
 * Calculate spacers using the original line counts (what should be used)
 */
export function calculateSpacersFromMeasurements(mainText, innerText, outerText, options, dummy) {
  const analysis = suggestLayoutFix(mainText, innerText, outerText, options, dummy);
  
  // Use ORIGINAL counts for spacer calculation (this is what the layout expects)
  const originalCounts = analysis.originalCounts;
  
  const originalLogic = {
    start: Math.max(Math.min(4, originalCounts.inner), Math.min(4, originalCounts.outer)),
    inner: Math.max(0, originalCounts.inner - 4),
    outer: Math.max(0, originalCounts.outer - 4)
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
      rendered: analysis.renderedCounts,
      originalLogic: originalLogic,
      shouldUseOriginal: true
    },
    startLineInfo: {
      preservedLines: originalLogic.start,
      calculationMethod: 'original-line-count-with-layout-fix-suggestions'
    }
  };
}