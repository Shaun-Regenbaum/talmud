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

// Overlap detection functions
function detectOverlaps(spacerHeights, lineHeights, sizes) {
  const overlaps = [];
  
  // Track cumulative positions for each column
  let positions = {
    main: { start: spacerHeights.start, current: spacerHeights.start },
    inner: { start: spacerHeights.start + spacerHeights.inner, current: spacerHeights.start + spacerHeights.inner },
    outer: { start: spacerHeights.start + spacerHeights.outer, current: spacerHeights.start + spacerHeights.outer }
  };
  
  // Check line by line for overlaps
  const maxLines = Math.max(sizes.main.length, sizes.rashi.length, sizes.tosafot.length);
  
  for (let i = 0; i < maxLines; i++) {
    const mainHeight = sizes.main[i]?.height || 0;
    const innerHeight = sizes.rashi[i]?.height || 0;
    const outerHeight = sizes.tosafot[i]?.height || 0;
    
    const mainBottom = positions.main.current + mainHeight;
    const innerBottom = positions.inner.current + innerHeight;
    const outerBottom = positions.outer.current + outerHeight;
    
    // Check main-inner overlap
    if (innerHeight > 0 && mainHeight > 0) {
      if (positions.inner.current < mainBottom && innerBottom > positions.main.current) {
        const overlapAmount = Math.min(mainBottom, innerBottom) - Math.max(positions.main.current, positions.inner.current);
        if (overlapAmount > 0) {
          overlaps.push({
            type: 'main-inner',
            line: i,
            overlap: overlapAmount,
            mainPos: positions.main.current,
            innerPos: positions.inner.current
          });
        }
      }
    }
    
    // Check main-outer overlap
    if (outerHeight > 0 && mainHeight > 0) {
      if (positions.outer.current < mainBottom && outerBottom > positions.main.current) {
        const overlapAmount = Math.min(mainBottom, outerBottom) - Math.max(positions.main.current, positions.outer.current);
        if (overlapAmount > 0) {
          overlaps.push({
            type: 'main-outer',
            line: i,
            overlap: overlapAmount,
            mainPos: positions.main.current,
            outerPos: positions.outer.current
          });
        }
      }
    }
    
    // Update positions
    positions.main.current = mainBottom;
    positions.inner.current = innerBottom;
    positions.outer.current = outerBottom;
  }
  
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
    }
  });
  
  return resolved;
}

export function calculateSpacersBreaks(mainArray, rashiArray, tosafotArray, options, dummy) {
  const lines = {
    main: mainArray,
    rashi: rashiArray,
    tosafot: tosafotArray
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
  

  const spacerHeights = {
    start: 4.4 * parsedOptions.lineHeight.side,
    inner: null,
    outer: null,
    end: 0,
    exception: 0
  };

  const mainHeight = accumulateMain(lines.main);
  const mainHeightOld = (sizes.main.length) * parsedOptions.lineHeight.main;
  let afterBreak = {
    inner: accumulateCommentary(lines.rashi.slice(4)),
    outer: accumulateCommentary(lines.tosafot.slice(4))
  }

  let afterBreakOld = {
    inner: parsedOptions.lineHeight.side * (sizes.rashi.length - 4),
    outer: parsedOptions.lineHeight.side * (sizes.tosafot.length - 4)
  }

  if (breaks.rashi.length < 1 || breaks.tosafot.length < 1) {
    console.log("Dealing with Exceptions")
    if (breaks.rashi.length < 1) {
      afterBreak.inner = parsedOptions.lineHeight.side * (sizes.rashi.length + 1)
      spacerHeights.exception = 2
    }
    if (breaks.tosafot.length < 1) {
      afterBreak.outer = parsedOptions.lineHeight.side * (sizes.tosafot.length + 1)
      spacerHeights.exception = 2
    }
}
  switch (breaks.main.length) {
    case 0:
      spacerHeights.inner = mainHeight;
      spacerHeights.outer = mainHeight;
      if (breaks.rashi.length == 2) {
        spacerHeights.end = accumulateCommentary(lines.rashi.slice(breaks.rashi[1]))
      } else {
        spacerHeights.end = accumulateCommentary(lines.tosafot.slice(breaks.tosafot[1]))
      }
      console.log("Double wrap")
      break;
    case 1:
      if (breaks.rashi.length != breaks.tosafot.length) {
        if (breaks.tosafot.length == 0) {
          spacerHeights.outer = 0;
          spacerHeights.inner = afterBreak.inner;
          break;
        }
        if (breaks.rashi.length == 0) {
          spacerHeights.inner = 0;
          spacerHeights.outer = afterBreak.outer;
          break;
        }
        let stair;
        let nonstair;
        if (breaks.rashi.length == 1) {
          stair = "outer";
          nonstair = "inner";
        } else {
          stair = "inner";
          nonstair = "outer";
        }
        spacerHeights[nonstair] = afterBreak[nonstair];
        spacerHeights[stair] = mainHeight;
        console.log("Stairs")
        break;
      }
    case 2:
      spacerHeights.inner = afterBreak.inner;
      spacerHeights.outer = afterBreak.outer;
      console.log("Double Extend")
      break;
    default:
      spacerHeights.inner = afterBreak.inner;
      spacerHeights.outer = afterBreak.outer;
      console.log("No Case Exception")
      break;
  }
  
  // Apply font-size aware minimum spacer heights
  const minSpacerMain = sizes.main[0]?.minSpacerHeight || parsedOptions.lineHeight.main;
  const minSpacerSide = sizes.rashi[0]?.minSpacerHeight || parsedOptions.lineHeight.side;
  
  // Ensure spacers are never smaller than one line height
  spacerHeights.inner = Math.max(spacerHeights.inner, minSpacerSide);
  spacerHeights.outer = Math.max(spacerHeights.outer, minSpacerSide);
  
  // Detect and resolve overlaps if enabled
  if (options.detectOverlaps) {
    const overlaps = detectOverlaps(spacerHeights, null, sizes);
    
    if (overlaps.length > 0) {
      console.warn('Text overlaps detected:', overlaps);
      
      if (options.autoResolveOverlaps !== false) {
        spacerHeights = resolveOverlaps(spacerHeights, overlaps, sizes, parsedOptions);
        console.log('Overlaps resolved, new spacer heights:', spacerHeights);
      }
      
      // Store overlap data for visualization
      spacerHeights.overlaps = overlaps;
    }
  }
  
  return spacerHeights;
}
