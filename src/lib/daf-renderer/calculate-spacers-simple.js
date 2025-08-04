/**
 * Simple spacer calculation based on line counts
 * Just like in test/lines - count lines per block and multiply by line height
 */
export function calculateSpacersSimple(mainLines, rashiLines, tosafotLines, options) {
  const lineHeightSide = parseFloat(options.lineHeight.side);
  const lineHeightMain = parseFloat(options.lineHeight.main);
  
  // Group lines into blocks by type
  const getBlocks = (lines) => {
    const blocks = [];
    let currentBlock = null;
    
    lines.forEach((line, index) => {
      const isStart = index < 4;
      const category = isStart ? 'start' : 'content';
      
      if (!currentBlock || currentBlock.category !== category) {
        currentBlock = {
          category,
          count: 1
        };
        blocks.push(currentBlock);
      } else {
        currentBlock.count++;
      }
    });
    
    return blocks;
  };
  
  const rashiBlocks = getBlocks(rashiLines);
  const tosafotBlocks = getBlocks(tosafotLines);
  
  // Simple calculation:
  // - Start spacer = 4 lines (or actual start block size)
  // - Inner spacer = remaining rashi lines after start
  // - Outer spacer = remaining tosafot lines after start
  
  const rashiStartLines = rashiBlocks[0]?.category === 'start' ? rashiBlocks[0].count : 0;
  const tosafotStartLines = tosafotBlocks[0]?.category === 'start' ? tosafotBlocks[0].count : 0;
  
  const startLines = Math.max(rashiStartLines, tosafotStartLines, 4); // At least 4 lines
  
  const rashiContentLines = rashiLines.length - rashiStartLines;
  const tosafotContentLines = tosafotLines.length - tosafotStartLines;
  
  return {
    start: startLines * lineHeightSide,
    inner: rashiContentLines * lineHeightSide,
    outer: tosafotContentLines * lineHeightSide,
    end: 0, // No end spacer in simple line-based layout
    exception: 0
  };
}