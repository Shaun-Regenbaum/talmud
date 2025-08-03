function getLineInfo(text, font, fontSize, lineHeight, dummy) {
  dummy.innerHTML = "";
  let testDiv = document.createElement("span");
  testDiv.style.font = fontSize + " " + String(font);
  testDiv.style.lineHeight = String(lineHeight) + "px";
  testDiv.innerHTML = text;
  testDiv.style.position = "absolute";
  dummy.append(testDiv);
  const rect = testDiv.getBoundingClientRect();
  const height = rect.height;
  const width = rect.width;
  const widthProportional = width / dummy.getBoundingClientRect().width;
  
  // Font-size aware metrics
  const fontSizeNum = parseFloat(fontSize);
  const lineHeightRatio = lineHeight / fontSizeNum;
  const effectiveLineHeight = fontSizeNum * lineHeightRatio;
  const minSpacerHeight = effectiveLineHeight; // Minimum spacer based on font metrics
  
  testDiv.remove();
  return {height, width, widthProportional, fontSizeNum, lineHeightRatio, effectiveLineHeight, minSpacerHeight};
}

function heightAccumulator(font, fontSize, lineHeight, dummy) {
  return (lines) => {
    return getLineInfo(lines.join("<br>"), font, fontSize, lineHeight, dummy).height;
  }
}

function getBreaks(sizeArray) {
  const widths = sizeArray.map(size => size.widthProportional);
  const diffs = widths.map((width, index, widths) => index == 0 ? 0 : Math.abs(width - widths[index - 1]));
  const threshold = 0.12;
  let criticalPoints = diffs.reduce((indices, curr, currIndex) => {
    //Breaks before line 4 are flukes
    if (currIndex < 4) return indices;
    if (curr > threshold) {
      //There should never be two breakpoints in a row
      const prevIndex = indices[indices.length - 1];
      if (prevIndex && (currIndex - prevIndex) == 1) {
        return indices;
      }
      indices.push(currIndex);
    }
    return indices;
  }, []);
  const averageAround = points => points.map((point, i) => {
    let nextPoint;
    if (!nextPoint) {
      nextPoint = Math.min(point + 3, widths.length - 1);
    }
    let prevPoint;
    if (!prevPoint) {
      prevPoint = Math.max(point - 3, 0);
    }
    /*
      Note that these are divided by the width of the critical point line such that
      we get the average width of the preceeding and proceeding chunks *relative*
      to the critical line.
     */
    const before = (widths.slice(prevPoint, point).reduce((acc, curr) => acc + curr) /
      (point - prevPoint)) / widths[point];
    let after;
    if ( point + 1 >= nextPoint) {
      after = widths[nextPoint] / widths[point];
    } else {
        after =(widths.slice(point + 1, nextPoint).reduce((acc, curr) => acc + curr) /
          (nextPoint - point - 1)) / widths[point];
    }
    return {
      point,
      before,
      after,
      diff: Math.abs(after - before)
    }
   })
  const aroundDiffs = averageAround(criticalPoints)
    .sort( (a,b) => b.diff - a.diff);
  criticalPoints = aroundDiffs
    .filter( ({diff}) => diff > 0.22)
    .map( ({point}) => point)
  return criticalPoints.sort( (a, b) => a - b);
}

export function onlyOneCommentary(lines, options, dummy) {
  const fontFamily = options.fontFamily.inner;
  const fontSize = options.fontSize.side;
  const lineHeight = parseFloat(options.lineHeight.side);
  const sizes = lines.map(text => getLineInfo(text, fontFamily, fontSize, lineHeight, dummy));
  const breaks = getBreaks(sizes);
  if (breaks.length == 3) {
    const first = lines.slice(0, breaks[1]);
    const second = lines.slice(breaks[1]);
    return [first, second];
  }
}

// Overlap detection functions for line break mode
function detectOverlaps(spacerHeights, lineHeights, sizes) {
  console.log('🔍 OVERLAP DETECTION STARTED');
  console.log('spacerHeights:', spacerHeights);
  console.log('sizes:', sizes);
  
  const overlaps = [];
  
  // In line break mode, we need to check if the total height of each section
  // fits within the allocated space without overlapping
  
  // Calculate total heights for each section
  const totalMainHeight = sizes.main.reduce((sum, line) => sum + (line?.height || 0), 0);
  const totalInnerHeight = sizes.rashi.reduce((sum, line) => sum + (line?.height || 0), 0);
  const totalOuterHeight = sizes.tosafot.reduce((sum, line) => sum + (line?.height || 0), 0);
  
  console.log('📏 Text Heights:', {
    main: totalMainHeight,
    inner: totalInnerHeight, 
    outer: totalOuterHeight
  });
  
  // Starting positions
  const mainStart = spacerHeights.start;
  const innerStart = spacerHeights.start + spacerHeights.inner;
  const outerStart = spacerHeights.start + spacerHeights.outer;
  
  // Ending positions
  const mainEnd = mainStart + totalMainHeight;
  const innerEnd = innerStart + totalInnerHeight;
  const outerEnd = outerStart + totalOuterHeight;
  
  console.log('📍 Positions:', {
    mainStart, mainEnd,
    innerStart, innerEnd,
    outerStart, outerEnd,
    spacers: {
      inner: spacerHeights.inner,
      outer: spacerHeights.outer
    }
  });
  
  // Tolerance for rounding errors in calculations
  const overflowTolerance = 5;
  
  // Check for overlaps between main and inner (Rashi)
  if (spacerHeights.inner > 0 && totalInnerHeight > 0 && totalInnerHeight > spacerHeights.start) {
    // Inner starts before main ends - only check if meaningful content
    const overlapAmount = mainEnd - innerStart;
    if (overlapAmount > overflowTolerance && innerStart < mainEnd) {
      overlaps.push({
        type: 'main-inner',
        line: -1, // Not line-specific in this mode
        overlap: overlapAmount,
        mainPos: mainStart,
        innerPos: innerStart,
        mainEnd: mainEnd,
        innerEnd: innerEnd
      });
    }
  }
  
  // Check for overlaps between main and outer (Tosafot)
  if (spacerHeights.outer > 0 && totalOuterHeight > 0 && totalOuterHeight > spacerHeights.start) {
    // Outer starts before main ends - only check if meaningful content
    const overlapAmount = mainEnd - outerStart;
    if (overlapAmount > overflowTolerance && outerStart < mainEnd) {
      overlaps.push({
        type: 'main-outer',
        line: -1, // Not line-specific in this mode
        overlap: overlapAmount,
        mainPos: mainStart,
        outerPos: outerStart,
        mainEnd: mainEnd,
        outerEnd: outerEnd
      });
    }
  }
  
  // Check if text extends beyond spacer boundaries (text overflow)
  // Only check for overflow if there's meaningful content and spacer allocation
  
  // Inner text extending beyond its allocated spacer
  if (totalInnerHeight > 0 && spacerHeights.inner > 0) {
    const innerSpacerEnd = innerStart + spacerHeights.inner;
    const overflowAmount = innerEnd - innerSpacerEnd;
    
    console.log('🔍 Inner overflow check:', {
      innerEnd,
      innerSpacerEnd,
      overflow: overflowAmount > overflowTolerance,
      amount: overflowAmount
    });
    
    // Only report as overflow if it exceeds tolerance and is meaningful
    if (overflowAmount > overflowTolerance && totalInnerHeight > spacerHeights.start) {
      console.log('⚠️ Inner overflow detected:', overflowAmount);
      overlaps.push({
        type: 'inner-overflow',
        line: -1,
        overlap: overflowAmount,
        innerPos: innerStart,
        spacerEnd: innerSpacerEnd,
        textEnd: innerEnd,
        innerEnd: innerEnd
      });
    }
  }
  
  // Outer text extending beyond its allocated spacer
  if (totalOuterHeight > 0 && spacerHeights.outer > 0) {
    const outerSpacerEnd = outerStart + spacerHeights.outer;
    const overflowAmount = outerEnd - outerSpacerEnd;
    
    console.log('🔍 Outer overflow check:', {
      outerEnd,
      outerSpacerEnd,
      overflow: overflowAmount > overflowTolerance,
      amount: overflowAmount
    });
    
    // Only report as overflow if it exceeds tolerance and is meaningful
    if (overflowAmount > overflowTolerance && totalOuterHeight > spacerHeights.start) {
      console.log('⚠️ Outer overflow detected:', overflowAmount);
      overlaps.push({
        type: 'outer-overflow',
        line: -1,
        overlap: overflowAmount,
        outerPos: outerStart,
        spacerEnd: outerSpacerEnd,
        textEnd: outerEnd,
        outerEnd: outerEnd
      });
    }
  }
  
  // Also check if inner and outer overlap with each other in complex layouts
  if (totalInnerHeight > 0 && totalOuterHeight > 0) {
    // Check if they're in the same vertical space
    if (Math.abs(innerStart - outerStart) < 50) { // If they start close together
      // This might be a double-wrap or similar pattern, check horizontal overlap
      // This would need more sophisticated checking based on the actual layout
    }
  }
  
  console.log('📋 Final overlaps found:', overlaps);
  return overlaps;
}

function resolveOverlaps(spacerHeights, overlaps, sizes, options) {
  if (overlaps.length === 0) return spacerHeights;
  
  const resolved = { ...spacerHeights };
  const safetyMargin = 5; // pixels
  
  // Get font metrics for minimum spacer heights
  const minSpacerInner = sizes.rashi[0]?.minSpacerHeight || options.lineHeight.side;
  const minSpacerOuter = sizes.tosafot[0]?.minSpacerHeight || options.lineHeight.side;
  
  // Sort overlaps by severity
  overlaps.sort((a, b) => b.overlap - a.overlap);
  
  overlaps.forEach(({ type, overlap }) => {
    if (type === 'main-inner') {
      // Ensure spacer is at least the font size to prevent text cramping
      const adjustment = Math.max(overlap + safetyMargin, minSpacerInner);
      resolved.inner += adjustment;
    } else if (type === 'main-outer') {
      const adjustment = Math.max(overlap + safetyMargin, minSpacerOuter);
      resolved.outer += adjustment;
    } else if (type === 'inner-overflow') {
      // Text extends beyond spacer - need to extend the spacer
      const adjustment = overlap + safetyMargin;
      resolved.inner += adjustment;
      console.log(`Inner text overflow: extending spacer by ${adjustment}px`);
    } else if (type === 'outer-overflow') {
      // Text extends beyond spacer - need to extend the spacer
      const adjustment = overlap + safetyMargin;
      resolved.outer += adjustment;
      console.log(`Outer text overflow: extending spacer by ${adjustment}px`);
    }
  });
  
  return resolved;
}

export function calculateSpacersBreaks(mainArray, rashiArray, tosafotArray, options, dummy) {
  // Handle edge cases where arrays might be empty or contain only empty strings
  const lines = {
    main: (mainArray || []).filter(line => line && line.trim() !== ''),
    rashi: (rashiArray || []).filter(line => line && line.trim() !== ''),
    tosafot: (tosafotArray || []).filter(line => line && line.trim() !== '')
  }
  
  // Check for fundamental edge cases first
  console.log('📋 Text analysis:', {
    mainLines: lines.main.length,
    rashiLines: lines.rashi.length, 
    tosafotLines: lines.tosafot.length
  });
  
  // No commentary at all - this should be an error case
  if (lines.rashi.length === 0 && lines.tosafot.length === 0) {
    console.error("No Commentary");
    return {
      start: 0, // No commentary means no top spacer needed
      inner: 0,
      outer: 0,
      end: 0,
      exception: 0,
      error: "No Commentary"
    };
  }

  const parsedOptions = {
    padding: {
      vertical: parseFloat(options.padding.vertical),
      horizontal: parseFloat(options.padding.horizontal)
    },
    halfway: 0.01 * parseFloat(options.halfway),
    fontFamily: options.fontFamily, // Object of strings
    fontSize: {
      main: options.fontSize.main,
      side: options.fontSize.side,
    },
    lineHeight: {
      main: parseFloat(options.lineHeight.main),
      side: parseFloat(options.lineHeight.side),
    },
  }


  const mainOptions = [parsedOptions.fontFamily.main, parsedOptions.fontSize.main, parsedOptions.lineHeight.main];
  const commentaryOptions = [parsedOptions.fontFamily.inner, parsedOptions.fontSize.side, parsedOptions.lineHeight.side];
  
  const sizes = {};
  sizes.main = lines.main.map(text => getLineInfo(text, ...mainOptions, dummy));
  ["rashi", "tosafot"].forEach(text => {
    sizes[text] = lines[text].map(line => getLineInfo(line, ...commentaryOptions, dummy))
  })

  const accumulateMain = heightAccumulator(...mainOptions, dummy);
  const accumulateCommentary = heightAccumulator(...commentaryOptions, dummy);

  const breaks = {};

  ["rashi", "tosafot", "main"].forEach(text => {
    breaks[text] = getBreaks(sizes[text])
      /*
      Hadran lines aren't real candidates for line breaks.
        TODO: Extract this behavior , give it an option/parameter
       */
        .filter(lineNum => !(lines[text][lineNum].includes("hadran"))
    )
  })
  

  let spacerHeights = {
    start: 4.4 * parsedOptions.lineHeight.side,
    inner: null,
    outer: null,
    end: 0,
    exception: 0
  };

  const mainHeight = accumulateMain(lines.main);
  const mainHeightOld = (sizes.main.length) * parsedOptions.lineHeight.main;
  
  // Calculate total heights for each commentary section
  const totalInnerHeight = accumulateCommentary(lines.rashi);
  const totalOuterHeight = accumulateCommentary(lines.tosafot);

  // Handle forced spacer heights (fixed method) - MUST be first priority
  if (options.forcedSpacerHeights) {
    console.log('🔧 Using forced spacer heights:', options.forcedSpacerHeights);
    return {
      start: options.forcedSpacerHeights.start || spacerHeights.start,
      inner: options.forcedSpacerHeights.inner || 0,
      outer: options.forcedSpacerHeights.outer || 0,
      end: options.forcedSpacerHeights.end || 0,
      exception: options.forcedSpacerHeights.exception || 0
    };
  }
  
  console.log('📊 Commentary heights:', {
    inner: totalInnerHeight,
    outer: totalOuterHeight,
    startThreshold: spacerHeights.start
  });
  
  // Check if commentaries are too short to fill the initial space
  if (totalInnerHeight <= spacerHeights.start && totalOuterHeight <= spacerHeights.start) {
    console.error("Not Enough Commentary to Fill Four Lines");
    return {
      start: spacerHeights.start,
      inner: Math.max(totalInnerHeight, 0),
      outer: Math.max(totalOuterHeight, 0), 
      end: 0,
      exception: 0,
      error: "Not Enough Commentary"
    };
  }
  
  // Handle cases where only one commentary has sufficient content
  if (totalInnerHeight <= spacerHeights.start || totalOuterHeight <= spacerHeights.start) {
    console.log('🚨 One-sided commentary detected');
    
    if (totalInnerHeight <= spacerHeights.start) {
      // Inner (Rashi) is too short, outer (Tosafot) takes over
      spacerHeights.inner = Math.max(totalInnerHeight, 0);
      spacerHeights.outer = mainHeight; // Outer extends to match main text
      spacerHeights.exception = 1; // No Rashi exception
      console.log("Exception 1: Insufficient Rashi content");
      return spacerHeights;
    }
    
    if (totalOuterHeight <= spacerHeights.start) {
      // Outer (Tosafot) is too short, inner (Rashi) takes over  
      spacerHeights.outer = Math.max(totalOuterHeight, 0);
      spacerHeights.inner = mainHeight; // Inner extends to match main text
      spacerHeights.exception = 2; // No Tosafot exception
      console.log("Exception 2: Insufficient Tosafot content");
      return spacerHeights;
    }
  }
  
  // Calculate heights after the first break (if any)
  let afterBreak = {
    inner: 0,
    outer: 0
  };
  
  // Only calculate afterBreak if there are actual breaks
  if (breaks.rashi.length > 0) {
    const firstBreak = breaks.rashi[0];
    afterBreak.inner = accumulateCommentary(lines.rashi.slice(firstBreak));
  } else {
    // No breaks, use all lines
    afterBreak.inner = accumulateCommentary(lines.rashi);
  }
  
  if (breaks.tosafot.length > 0) {
    const firstBreak = breaks.tosafot[0];
    afterBreak.outer = accumulateCommentary(lines.tosafot.slice(firstBreak));
  } else {
    // No breaks, use all lines
    afterBreak.outer = accumulateCommentary(lines.tosafot);
  }

  let afterBreakOld = {
    inner: parsedOptions.lineHeight.side * (sizes.rashi.length - 4),
    outer: parsedOptions.lineHeight.side * (sizes.tosafot.length - 4)
  }

  // Note: Exception handling is now done earlier in the function
  // This ensures proper spacer allocation based on available content
  
  // Check for old break detection method
  if (options.useOldSpacerCalculation) {
    console.log('🔧 Using old break detection method');
    return calculateOldBreakDetection(lines, breaks, sizes, parsedOptions, spacerHeights, dummy);
  }
  
  // Check for proportional spacing method
  if (options.useProportionalSpacing) {
    console.log('🔧 Using proportional spacing method');
    return calculateProportionalSpacing(lines, totalInnerHeight, totalOuterHeight, mainHeight, spacerHeights);
  }
  
  // NEW APPROACH: Calculate spacers directly from actual text heights
  // This fixes the "stairs case" spacer calculation issue
  
  console.log("🔄 NEW: Calculating spacers from actual text heights...");
  
  // The key insight: in line break mode with accurate line distribution,
  // we can calculate spacers directly from measured text heights
  const mainTextHeight = mainHeight;
  
  console.log("📏 Measured heights:", {
    mainText: mainTextHeight,
    totalInner: totalInnerHeight,
    totalOuter: totalOuterHeight,
    startSpacer: spacerHeights.start
  });
  
  // Determine layout pattern from commentary content relative to start spacer
  const hasSubstantialInner = totalInnerHeight > spacerHeights.start * 1.5;
  const hasSubstantialOuter = totalOuterHeight > spacerHeights.start * 1.5;
  
  console.log("🎯 Layout pattern analysis:", {
    hasSubstantialInner,
    hasSubstantialOuter,
    innerRatio: totalInnerHeight / spacerHeights.start,
    outerRatio: totalOuterHeight / spacerHeights.start
  });
  
  if (!hasSubstantialInner && !hasSubstantialOuter) {
    // Both commentaries are minimal - use their actual heights
    spacerHeights.inner = Math.max(totalInnerHeight, 0);
    spacerHeights.outer = Math.max(totalOuterHeight, 0);
    console.log("📐 Pattern: Minimal commentaries");
  } else if (!hasSubstantialInner) {
    // Outer commentary dominates - classic "stairs" pattern
    // Inner gets minimal space, outer extends to accommodate main text
    spacerHeights.inner = Math.max(totalInnerHeight, 0);
    spacerHeights.outer = Math.max(mainTextHeight, totalOuterHeight);
    console.log("📐 Pattern: Outer dominant (stairs) - main height:", mainTextHeight);
  } else if (!hasSubstantialOuter) {
    // Inner commentary dominates - reverse stairs
    spacerHeights.outer = Math.max(totalOuterHeight, 0);
    spacerHeights.inner = Math.max(mainTextHeight, totalInnerHeight);
    console.log("📐 Pattern: Inner dominant (stairs) - main height:", mainTextHeight);
  } else {
    // Both commentaries are substantial - distribute space proportionally
    // Each commentary gets at least its content height or proportional main height
    const proportionalHeight = mainTextHeight * 0.6; // 60% of main height minimum
    
    // Add safety margin to account for DOM vs calculated height differences
    const safetyMargin = parsedOptions.lineHeight.side * 2; // 2 line heights buffer
    spacerHeights.inner = Math.max(totalInnerHeight + safetyMargin, proportionalHeight);
    spacerHeights.outer = Math.max(totalOuterHeight + safetyMargin, proportionalHeight);
    console.log("📐 Pattern: Double commentary - proportional allocation with safety margin");
  }
  
  console.log("📊 New spacer calculation results:", {
    mainTextHeight,
    totalInnerHeight,
    totalOuterHeight,
    calculatedSpacers: {
      start: spacerHeights.start,
      inner: spacerHeights.inner,
      outer: spacerHeights.outer
    },
    improvements: {
      oldInnerWouldBe: afterBreak.inner,
      oldOuterWouldBe: afterBreak.outer,
      innerIncrease: spacerHeights.inner - afterBreak.inner,
      outerIncrease: spacerHeights.outer - afterBreak.outer
    }
  });
  
  // ADVANCED: Analyze line distribution to detect layout issues
  // This could inform font/width adjustments needed for proper line breaks
  if (options.analyzeLineDistribution && typeof window !== 'undefined') {
    console.log("🔍 Analyzing line distribution for layout optimization...");
    
    // Create temporary elements to measure line distributions
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.visibility = 'hidden';
    tempContainer.style.width = options.contentWidth || '600px';
    tempContainer.style.fontFamily = parsedOptions.fontFamily.main;
    tempContainer.style.fontSize = parsedOptions.fontSize.main;
    tempContainer.style.lineHeight = parsedOptions.lineHeight.main + 'px';
    document.body.appendChild(tempContainer);
    
    // Analyze main text line distribution
    const mainLines = lines.main;
    let shortLines = 0, mediumLines = 0, longLines = 0;
    
    mainLines.forEach(line => {
      tempContainer.innerHTML = line.trim();
      const lineWidth = tempContainer.getBoundingClientRect().width;
      const containerWidth = parseFloat(options.contentWidth || '600px');
      const mainWidthPercent = parseFloat(options.mainWidth || '50%') / 100;
      const mainSectionWidth = containerWidth * mainWidthPercent;
      const commentaryWidth = containerWidth * (1 - mainWidthPercent) / 2;
      
      if (lineWidth <= mainSectionWidth * 1.1) {
        shortLines++;
      } else if (lineWidth <= (mainSectionWidth + commentaryWidth) * 1.1) {
        mediumLines++;
      } else {
        longLines++;
      }
    });
    
    document.body.removeChild(tempContainer);
    
    const lineDistribution = { shortLines, mediumLines, longLines, total: mainLines.length };
    console.log("📏 Main text line distribution:", lineDistribution);
    
    // Store distribution for potential font/width adjustments
    spacerHeights.lineDistribution = lineDistribution;
    
    // Flag potential issues
    if (shortLines / mainLines.length > 0.8) {
      spacerHeights.layoutIssue = "font_too_large";
      console.log("⚠️ Layout issue: Font may be too large (too many short lines)");
    } else if (longLines / mainLines.length > 0.6) {
      spacerHeights.layoutIssue = "font_too_small";
      console.log("⚠️ Layout issue: Font may be too small (too many long lines)");
    }
  } 
  // Exception cases are now handled earlier and return immediately
  
  // Apply font-size aware minimum spacer heights
  const minSpacerMain = sizes.main[0]?.minSpacerHeight || parsedOptions.lineHeight.main;
  const minSpacerSide = sizes.rashi[0]?.minSpacerHeight || parsedOptions.lineHeight.side;
  
  // Ensure spacers are never smaller than one line height
  spacerHeights.inner = Math.max(spacerHeights.inner, minSpacerSide);
  spacerHeights.outer = Math.max(spacerHeights.outer, minSpacerSide);
  
  // Detect and resolve overlaps if enabled
  console.log('🎯 Checking for overlap detection...', {
    detectOverlaps: options.detectOverlaps,
    autoResolveOverlaps: options.autoResolveOverlaps
  });
  
  if (options.detectOverlaps) {
    console.log('✅ Starting overlap detection...');
    const overlaps = detectOverlaps(spacerHeights, null, sizes);
    
    if (overlaps.length > 0) {
      console.warn('Text overlaps detected:', overlaps);
      
      if (options.autoResolveOverlaps !== false) {
        spacerHeights = resolveOverlaps(spacerHeights, overlaps, sizes, parsedOptions);
        console.log('Overlaps resolved, new spacer heights:', spacerHeights);
      }
      
      // Store overlap data for visualization
      spacerHeights.overlaps = overlaps;
    } else {
      console.log('✅ No overlaps detected');
    }
  } else {
    console.log('❌ Overlap detection disabled');
  }
  
  return spacerHeights;
}

// Old break detection method (before height-based improvements)
function calculateOldBreakDetection(lines, breaks, sizes, parsedOptions, spacerHeights, dummy) {
  console.log("🔄 OLD: Using original break detection algorithm...");
  
  const accumulateMain = heightAccumulator(parsedOptions.fontFamily.main, parsedOptions.fontSize.main, parsedOptions.lineHeight.main, dummy);
  const accumulateCommentary = heightAccumulator(parsedOptions.fontFamily.inner, parsedOptions.fontSize.side, parsedOptions.lineHeight.side, dummy);
  
  // Original algorithm that calculated spacers based on line breaks
  const afterBreak = { inner: null, outer: null };
  
  ["rashi", "tosafot"].forEach(text => {
    const textBreaks = breaks[text];
    const textLines = lines[text];
    
    if (textBreaks.length > 0) {
      const afterBreakLines = textLines.slice(textBreaks[0] + 1);
      afterBreak[text === "rashi" ? "inner" : "outer"] = accumulateCommentary(afterBreakLines);
    } else {
      afterBreak[text === "rashi" ? "inner" : "outer"] = 0;
    }
  });
  
  spacerHeights.inner = afterBreak.inner;
  spacerHeights.outer = afterBreak.outer;
  
  console.log("📊 Old break detection results:", afterBreak);
  return spacerHeights;
}

// Proportional spacing method
function calculateProportionalSpacing(lines, totalInnerHeight, totalOuterHeight, mainHeight, spacerHeights) {
  console.log("🔄 PROPORTIONAL: Using proportional spacing algorithm...");
  
  const totalCommentaryHeight = totalInnerHeight + totalOuterHeight;
  const availableHeight = Math.max(mainHeight - spacerHeights.start, 0);
  
  if (totalCommentaryHeight > 0 && availableHeight > 0) {
    const innerRatio = totalInnerHeight / totalCommentaryHeight;
    const outerRatio = totalOuterHeight / totalCommentaryHeight;
    
    spacerHeights.inner = Math.max(innerRatio * availableHeight, 0);
    spacerHeights.outer = Math.max(outerRatio * availableHeight, 0);
  } else {
    spacerHeights.inner = Math.max(totalInnerHeight, 0);
    spacerHeights.outer = Math.max(totalOuterHeight, 0);
  }
  
  console.log("📊 Proportional spacing results:", {
    totalCommentaryHeight,
    availableHeight,
    innerRatio: totalInnerHeight / totalCommentaryHeight,
    outerRatio: totalOuterHeight / totalCommentaryHeight,
    inner: spacerHeights.inner,
    outer: spacerHeights.outer
  });
  
  return spacerHeights;
}
