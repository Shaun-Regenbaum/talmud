<script>
  export let segmentedMainText = ''; // Can be string or array
  export let segmentedRashi = '';
  export let segmentedTosafot = '';
  export let rashiLinking = {};
  export let tosafotLinking = {};
  export let tractate = 'Berakhot';
  export let dafRef = '3a';
  
  // Convert array to segmented HTML if needed
  function convertToSegmentedHTML(textData) {
    if (Array.isArray(textData)) {
      // Convert Sefaria segments array to HTML with sentence divisions
      return textData.map((segment, index) => 
        `<span class="sentence-main" data-sentence-index="${index}">${segment}</span>`
      ).join(' ');
    }
    // Already HTML string from API
    return textData || '';
  }
  
  $: processedMainText = convertToSegmentedHTML(segmentedMainText);
  
  let hoveredMainSegment = null;
  let hoveredCommentaryType = null;
  let hoveredCommentaryIndex = null;
  
  // Handle hover events for dynamically rendered HTML segments
  function setupEventListeners() {
    // Main text segments
    const mainSegments = document.querySelectorAll('.sentence-main');
    mainSegments.forEach((element, index) => {
      const segmentIndex = parseInt(element.dataset.sentenceIndex || index);
      
      element.addEventListener('mouseenter', () => {
        hoveredMainSegment = segmentIndex;
        highlightLinkedCommentary(segmentIndex);
      });
      
      element.addEventListener('mouseleave', () => {
        hoveredMainSegment = null;
        clearCommentaryHighlight();
      });
    });
    
    // Rashi segments
    const rashiSegments = document.querySelectorAll('.sentence-rashi');
    rashiSegments.forEach((element, index) => {
      const commentaryIndex = parseInt(element.dataset.commentaryIndex || index);
      
      element.addEventListener('mouseenter', () => {
        hoveredCommentaryType = 'rashi';
        hoveredCommentaryIndex = commentaryIndex;
        highlightLinkedMainText(commentaryIndex, 'rashi');
      });
      
      element.addEventListener('mouseleave', () => {
        hoveredCommentaryType = null;
        hoveredCommentaryIndex = null;
        clearMainTextHighlight();
      });
    });
    
    // Tosafot segments
    const tosafotSegments = document.querySelectorAll('.sentence-tosafot');
    tosafotSegments.forEach((element, index) => {
      const commentaryIndex = parseInt(element.dataset.commentaryIndex || index);
      
      element.addEventListener('mouseenter', () => {
        hoveredCommentaryType = 'tosafot';
        hoveredCommentaryIndex = commentaryIndex;
        highlightLinkedMainText(commentaryIndex, 'tosafot');
      });
      
      element.addEventListener('mouseleave', () => {
        hoveredCommentaryType = null;
        hoveredCommentaryIndex = null;
        clearMainTextHighlight();
      });
    });
  }
  
  function highlightLinkedCommentary(mainSegmentIndex) {
    const baseRef = `${tractate} ${dafRef}`;
    
    // Clear previous highlights
    clearCommentaryHighlight();
    
    // Highlight linked Rashi
    const linkedRashiIndexes = rashiLinking[baseRef]?.[mainSegmentIndex] || [];
    linkedRashiIndexes.forEach(index => {
      const element = document.querySelector(`.sentence-rashi[data-commentary-index="${index}"]`);
      if (element) element.classList.add('highlighted-commentary');
    });
    
    // Highlight linked Tosafot
    const linkedTosafotIndexes = tosafotLinking[baseRef]?.[mainSegmentIndex] || [];
    linkedTosafotIndexes.forEach(index => {
      const element = document.querySelector(`.sentence-tosafot[data-commentary-index="${index}"]`);
      if (element) element.classList.add('highlighted-commentary');
    });
  }
  
  function highlightLinkedMainText(commentaryIndex, type) {
    const baseRef = `${tractate} ${dafRef}`;
    const linking = type === 'rashi' ? rashiLinking : tosafotLinking;
    
    // Clear previous highlights
    clearMainTextHighlight();
    
    // Find main text segments linked to this commentary
    const linkedMainSegments = [];
    Object.entries(linking[baseRef] || {}).forEach(([mainSegmentIndex, commentaryIndexes]) => {
      if (Array.isArray(commentaryIndexes) && commentaryIndexes.includes(commentaryIndex)) {
        linkedMainSegments.push(parseInt(mainSegmentIndex));
      }
    });
    
    // Highlight linked main text segments
    linkedMainSegments.forEach(segmentIndex => {
      const element = document.querySelector(`.sentence-main[data-sentence-index="${segmentIndex}"]`);
      if (element) {
        element.classList.add('highlighted-main');
        
        // Auto-scroll to first segment if out of view
        if (segmentIndex === linkedMainSegments[0]) {
          const rect = element.getBoundingClientRect();
          const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
          if (rect.top < 0 || rect.bottom - viewHeight >= 0) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    });
  }
  
  function clearCommentaryHighlight() {
    document.querySelectorAll('.highlighted-commentary').forEach(el => {
      el.classList.remove('highlighted-commentary');
    });
  }
  
  function clearMainTextHighlight() {
    document.querySelectorAll('.highlighted-main').forEach(el => {
      el.classList.remove('highlighted-main');
    });
  }
  
  // Set up event listeners after component mounts and when content changes
  $: if (segmentedMainText || segmentedRashi || segmentedTosafot) {
    setTimeout(setupEventListeners, 100);
  }
</script>

<div class="segmented-text-viewer">
  <h3 class="text-lg font-semibold mb-4">Interactive Segmented HTML</h3>
  <p class="text-sm text-gray-600 mb-4">
    Hover over segments to see bidirectional linking with auto-scroll. 
    Main text uses Sefaria sentence divisions, commentary is filtered to linked segments only.
  </p>
  
  <div class="space-y-6">
    <div>
      <h4 class="text-lg font-semibold mb-2">Main Text (with Sefaria sentence divisions)</h4>
      <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right max-h-96 overflow-y-auto" dir="rtl">
        <div class="text-sm">{@html processedMainText || 'No segmented main text available'}</div>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        Each colored segment corresponds to a Sefaria sentence division that can be linked to commentary.
      </p>
    </div>
    
    <div>
      <h4 class="text-lg font-semibold mb-2">Rashi (linked segments only)</h4>
      <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right max-h-96 overflow-y-auto" dir="rtl">
        <div class="text-sm">{@html segmentedRashi || 'No linked Rashi segments'}</div>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        Only Rashi segments that are linked to main text sentences are shown.
      </p>
    </div>
    
    <div>
      <h4 class="text-lg font-semibold mb-2">Tosafot (linked segments only)</h4>
      <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right max-h-96 overflow-y-auto" dir="rtl">
        <div class="text-sm">{@html segmentedTosafot || 'No linked Tosafot segments'}</div>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        Only Tosafot segments that are linked to main text sentences are shown.
      </p>
    </div>
  </div>
</div>

<style>
  /* Enhanced highlighting for bidirectional interaction */
  :global(.sentence-main) {
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  :global(.sentence-main:hover) {
    background-color: #BFDBFE !important;
    border-color: #93C5FD !important;
    transform: scale(1.02);
  }
  
  :global(.sentence-main.highlighted-main) {
    background-color: #FCD34D !important;
    border-color: #F59E0B !important;
    box-shadow: 0 0 0 2px #F59E0B !important;
  }
  
  :global(.sentence-rashi) {
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  :global(.sentence-rashi:hover) {
    background-color: #FECACA !important;
    border-color: #FCA5A5 !important;
    transform: scale(1.02);
  }
  
  :global(.sentence-rashi.highlighted-commentary) {
    background-color: #3B82F6 !important;
    border-color: #1D4ED8 !important;
    color: white !important;
    box-shadow: 0 0 0 2px #1D4ED8 !important;
  }
  
  :global(.sentence-tosafot) {
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  :global(.sentence-tosafot:hover) {
    background-color: #A7F3D0 !important;
    border-color: #6EE7B7 !important;
    transform: scale(1.02);
  }
  
  :global(.sentence-tosafot.highlighted-commentary) {
    background-color: #059669 !important;
    border-color: #047857 !important;
    color: white !important;
    box-shadow: 0 0 0 2px #047857 !important;
  }
</style>