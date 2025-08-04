/**
 * Ensures text lines actually fit within their designated width
 * by measuring and adjusting font size or adding proper line breaks
 */

/**
 * Measure how many characters fit on one line at given settings
 */
function measureCharsPerLine(font, fontSize, width, dummy) {
  const testDiv = document.createElement('div');
  testDiv.style.cssText = `
    position: absolute;
    visibility: hidden;
    font: ${fontSize}px ${font};
    width: ${width}px;
    white-space: nowrap;
  `;
  
  // Test with Hebrew characters (they're wider than Latin)
  const testChar = 'א';
  let testString = '';
  
  // Binary search to find max chars that fit
  let low = 1, high = 200;
  let maxFit = 1;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    testString = testChar.repeat(mid);
    testDiv.textContent = testString;
    dummy.appendChild(testDiv);
    
    if (testDiv.scrollWidth <= width) {
      maxFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
    
    testDiv.remove();
  }
  
  // Account for variable character widths - use 80% as safe estimate
  return Math.floor(maxFit * 0.8);
}

/**
 * Calculate optimal font size for given text and width
 */
function calculateOptimalFontSize(text, font, baseFontSize, width, lineHeight, dummy) {
  const testDiv = document.createElement('div');
  let fontSize = baseFontSize;
  
  // Strip HTML and get longest line
  const temp = document.createElement('div');
  temp.innerHTML = text;
  const plainText = temp.textContent || '';
  const lines = plainText.split(/\n|<br>/);
  const longestLine = lines.reduce((max, line) => 
    line.length > max.length ? line : max, '');
  
  // Test if longest line fits
  testDiv.style.cssText = `
    position: absolute;
    visibility: hidden;
    font: ${fontSize}px ${font};
    width: ${width}px;
    white-space: nowrap;
  `;
  testDiv.textContent = longestLine;
  dummy.appendChild(testDiv);
  
  // Reduce font size until it fits
  while (testDiv.scrollWidth > width && fontSize > baseFontSize * 0.7) {
    fontSize -= 0.5;
    testDiv.style.fontSize = fontSize + 'px';
  }
  
  testDiv.remove();
  return fontSize;
}

/**
 * Ensure all lines in text fit within width
 */
export function ensureLinesFit(text, font, fontSize, width, lineHeight, dummy) {
  if (!text) return { text, fontSize };
  
  // Calculate how many characters safely fit per line
  const charsPerLine = measureCharsPerLine(font, fontSize, width, dummy);
  
  // Process text to ensure lines don't exceed width
  const processedLines = [];
  const lines = text.split(/<br>/gi);
  
  lines.forEach(line => {
    // Strip HTML tags for measurement
    const temp = document.createElement('div');
    temp.innerHTML = line;
    const plainText = temp.textContent || '';
    
    if (plainText.length <= charsPerLine) {
      // Line fits as-is
      processedLines.push(line);
    } else {
      // Need to break this line
      const words = plainText.split(/\s+/);
      let currentLine = '';
      let currentLength = 0;
      
      words.forEach(word => {
        if (currentLength + word.length + 1 <= charsPerLine) {
          currentLine += (currentLine ? ' ' : '') + word;
          currentLength += word.length + 1;
        } else {
          // Start new line
          if (currentLine) processedLines.push(currentLine);
          currentLine = word;
          currentLength = word.length;
        }
      });
      
      if (currentLine) processedLines.push(currentLine);
    }
  });
  
  const processedText = processedLines.join('<br>');
  
  // Check if we need to adjust font size for the processed text
  const optimalFontSize = calculateOptimalFontSize(
    processedText, font, fontSize, width, lineHeight, dummy
  );
  
  return {
    text: processedText,
    fontSize: optimalFontSize,
    linesModified: lines.length !== processedLines.length,
    originalLines: lines.length,
    newLines: processedLines.length
  };
}

/**
 * Pre-process all text sections to ensure proper fit
 */
export function preprocessTextForFit(mainText, innerText, outerText, options, dummy) {
  const parsedOptions = {
    width: parseFloat(options.contentWidth),
    mainWidth: 0.01 * parseFloat(options.mainWidth),
    fontSize: {
      main: parseFloat(options.fontSize.main),
      side: parseFloat(options.fontSize.side)
    },
    lineHeight: {
      main: parseFloat(options.lineHeight.main),
      side: parseFloat(options.lineHeight.side)
    },
    fontFamily: options.fontFamily
  };
  
  const midWidth = parsedOptions.width * parsedOptions.mainWidth;
  const sideWidth = parsedOptions.width * (1 - parsedOptions.mainWidth) / 2;
  
  // Process each section
  const mainResult = ensureLinesFit(
    mainText,
    parsedOptions.fontFamily.main,
    parsedOptions.fontSize.main,
    midWidth,
    parsedOptions.lineHeight.main,
    dummy
  );
  
  const innerResult = ensureLinesFit(
    innerText,
    parsedOptions.fontFamily.inner,
    parsedOptions.fontSize.side,
    sideWidth,
    parsedOptions.lineHeight.side,
    dummy
  );
  
  const outerResult = ensureLinesFit(
    outerText,
    parsedOptions.fontFamily.outer,
    parsedOptions.fontSize.side,
    sideWidth,
    parsedOptions.lineHeight.side,
    dummy
  );
  
  console.log('📏 Line fit adjustments:', {
    main: { 
      fontReduction: parsedOptions.fontSize.main - mainResult.fontSize,
      linesAdded: mainResult.newLines - mainResult.originalLines
    },
    inner: {
      fontReduction: parsedOptions.fontSize.side - innerResult.fontSize,
      linesAdded: innerResult.newLines - innerResult.originalLines
    },
    outer: {
      fontReduction: parsedOptions.fontSize.side - outerResult.fontSize,
      linesAdded: outerResult.newLines - outerResult.originalLines
    }
  });
  
  return {
    main: mainResult,
    inner: innerResult,
    outer: outerResult
  };
}