<script>
  import { onMount, onDestroy } from 'svelte';
  import { getCommentaryLinks } from '$lib/sefaria-links';
  
  export let dafContainer = null;
  export let sefariaData = null;
  export let tractate = '';
  export let dafRef = '';
  
  let overlayContainer = null;
  let hoveredMainSegment = null;
  let highlightedCommentary = { rashi: [], tosafot: [] };
  
  // Track main text segments and their positions
  let mainTextSegments = [];
  let rashiSegments = [];
  let tosafotSegments = [];
  
  // Sefaria Links API data
  let sefariaLinksData = { rashi: {}, tosafot: {} };
  
  onMount(async () => {
    if (dafContainer && sefariaData && tractate && dafRef) {
      await loadSefariaLinksData();
      setupHoverHandlers();
    }
  });
  
  // Load Sefaria Links API data
  async function loadSefariaLinksData() {
    try {
      console.log('🔗 Loading Sefaria Links data for', tractate, dafRef);
      sefariaLinksData = await getCommentaryLinks(tractate, dafRef);
      console.log('✅ Sefaria Links data loaded:', sefariaLinksData);
    } catch (error) {
      console.warn('⚠️ Failed to load Sefaria Links data, will use fallback:', error);
      sefariaLinksData = { rashi: {}, tosafot: {} };
    }
  }
  
  onDestroy(() => {
    cleanupHoverHandlers();
  });
  
  // Fallback linking functions for when Sefaria data is unreliable
  function getFallbackCommentaryLinks(mainIndex, commentaryCount, commentaryType) {
    if (commentaryCount === 0) return [];
    
    // Simple proportional mapping: distribute commentary evenly across main text
    const mainTextCount = mainTextSegments.length;
    const ratio = commentaryCount / mainTextCount;
    
    // Calculate which commentary segment(s) this main text maps to
    const commentaryStart = Math.floor(mainIndex * ratio);
    const commentaryEnd = Math.floor((mainIndex + 1) * ratio);
    
    // Return 1-2 commentary segments around the calculated position
    const linked = [];
    for (let i = commentaryStart; i <= Math.min(commentaryEnd, commentaryCount - 1); i++) {
      linked.push(i);
    }
    
    // Ensure we always return at least one segment if commentary exists
    if (linked.length === 0 && commentaryCount > 0) {
      const fallbackIndex = Math.min(mainIndex, commentaryCount - 1);
      linked.push(fallbackIndex);
    }
    
    console.log(`📍 Fallback ${commentaryType} linking: main ${mainIndex} → commentary [${linked.join(', ')}]`);
    return linked;
  }
  
  function getFallbackMainTextLinks(commentaryIndex, mainTextCount, commentaryType) {
    if (mainTextCount === 0) return [];
    
    // Reverse mapping: find which main text segment(s) this commentary relates to
    const commentaryCount = commentaryType === 'rashi' ? rashiSegments.length : tosafotSegments.length;
    const ratio = mainTextCount / commentaryCount;
    
    // Calculate which main text segment(s) this commentary maps to
    const mainStart = Math.floor(commentaryIndex * ratio);
    const mainEnd = Math.floor((commentaryIndex + 1) * ratio);
    
    // Return 1-2 main text segments around the calculated position
    const linked = [];
    for (let i = mainStart; i <= Math.min(mainEnd, mainTextCount - 1); i++) {
      linked.push(i);
    }
    
    // Ensure we always return at least one segment if main text exists
    if (linked.length === 0 && mainTextCount > 0) {
      const fallbackIndex = Math.min(commentaryIndex, mainTextCount - 1);
      linked.push(fallbackIndex);
    }
    
    console.log(`📍 Fallback main linking: ${commentaryType} ${commentaryIndex} → main [${linked.join(', ')}]`);
    return linked;
  }
  
  function setupHoverHandlers() {
    if (!dafContainer || !sefariaData) return;
    
    // SIMPLIFIED APPROACH: Use any available DOM elements from daf-renderer
    // Map Sefaria segments to visual spans created by daf-renderer
    
    // Get all text spans from daf-renderer output (these are the actual visual elements)
    const mainSpans = Array.from(dafContainer.querySelectorAll('.main .text span'));
    const rashiSpans = Array.from(dafContainer.querySelectorAll('.inner .text span'));
    const tosafotSpans = Array.from(dafContainer.querySelectorAll('.outer .text span'));
    
    console.log('📍 Found daf-renderer spans:', {
      mainSpans: mainSpans.length,
      rashiSpans: rashiSpans.length, 
      tosafotSpans: tosafotSpans.length
    });
    
    // Get Sefaria data lengths
    const sefariaMainLength = sefariaData?.mainText?.length || 0;
    const sefariaRashiLength = sefariaData?.rashi?.length || 0;
    const sefariaTosafotLength = sefariaData?.tosafot?.length || 0;
    
    console.log('📊 Sefaria data lengths:', {
      mainText: sefariaMainLength,
      rashi: sefariaRashiLength,
      tosafot: sefariaTosafotLength
    });
    
    // Create mapping function: map Sefaria segment indices to DOM elements
    const createSegmentMapping = (sefariaLength, domElements) => {
      if (!sefariaLength || !domElements.length) return [];
      
      const mapping = [];
      for (let i = 0; i < sefariaLength; i++) {
        // Proportional mapping: distribute Sefaria segments across DOM elements
        const domIndex = Math.floor((i / sefariaLength) * domElements.length);
        const element = domElements[domIndex] || domElements[domElements.length - 1];
        mapping.push(element);
      }
      return mapping;
    };
    
    // Create the mappings
    const mainSegmentToDOM = createSegmentMapping(sefariaMainLength, mainSpans);
    const rashiSegmentToDOM = createSegmentMapping(sefariaRashiLength, rashiSpans);
    const tosafotSegmentToDOM = createSegmentMapping(sefariaTosafotLength, tosafotSpans);
    
    console.log('✅ Created segment mappings:', {
      main: mainSegmentToDOM.length,
      rashi: rashiSegmentToDOM.length,
      tosafot: tosafotSegmentToDOM.length
    });
    
    // Store references for highlighting
    mainTextSegments = mainSegmentToDOM;
    rashiSegments = rashiSegmentToDOM;  
    tosafotSegments = tosafotSegmentToDOM;
    
    // If no main spans found, there might be a timing issue
    if (mainSpans.length === 0) {
      console.log('No main spans found, daf might not be fully rendered yet');
      return;
    }
    
    // Add hover listeners to main text spans (map to Sefaria segment indices)
    mainSegmentToDOM.forEach((element, sefariaIndex) => {
      if (element) {
        element.addEventListener('mouseenter', () => handleMainTextHover(sefariaIndex));
        element.addEventListener('mouseleave', handleMainTextLeave);
        element.style.cursor = 'pointer';
        element.dataset.sefariaIndex = sefariaIndex;
        
        // Add visual indicator
        element.style.transition = 'background-color 0.2s';
      }
    });
    
    // Add hover listeners to Rashi segments (map to Sefaria segment indices)
    rashiSegmentToDOM.forEach((element, sefariaIndex) => {
      if (element) {
        element.addEventListener('mouseenter', () => handleCommentaryHover('rashi', sefariaIndex));
        element.addEventListener('mouseleave', handleCommentaryLeave);
        element.style.cursor = 'pointer';
        element.dataset.sefariaIndex = sefariaIndex;
        element.style.transition = 'background-color 0.2s';
      }
    });
    
    // Add hover listeners to Tosafot segments (map to Sefaria segment indices)
    tosafotSegmentToDOM.forEach((element, sefariaIndex) => {
      if (element) {
        element.addEventListener('mouseenter', () => handleCommentaryHover('tosafot', sefariaIndex));
        element.addEventListener('mouseleave', handleCommentaryLeave);
        element.style.cursor = 'pointer';
        element.dataset.sefariaIndex = sefariaIndex;
        element.style.transition = 'background-color 0.2s';
      }
    });
    
    console.log('🎯 Hover handlers setup complete!', {
      mainHandlers: mainSegmentToDOM.length,
      rashiHandlers: rashiSegmentToDOM.length,
      tosafotHandlers: tosafotSegmentToDOM.length
    });
  }
  
  function cleanupHoverHandlers() {
    // Remove event listeners from main text
    mainTextSegments.forEach(element => {
      element.removeEventListener('mouseenter', handleMainTextHover);
      element.removeEventListener('mouseleave', handleMainTextLeave);
      element.style.cursor = '';
      delete element.dataset.segmentIndex;
    });
    
    // Remove event listeners from commentary
    rashiSegments.forEach(element => {
      element.removeEventListener('mouseenter', handleCommentaryHover);
      element.removeEventListener('mouseleave', handleCommentaryLeave);
      element.style.cursor = '';
      delete element.dataset.segmentIndex;
    });
    
    tosafotSegments.forEach(element => {
      element.removeEventListener('mouseenter', handleCommentaryHover);
      element.removeEventListener('mouseleave', handleCommentaryLeave);
      element.style.cursor = '';
      delete element.dataset.segmentIndex;
    });
    
    // Clear highlighting
    clearHighlighting();
  }
  
  function handleMainTextHover(segmentIndex) {
    hoveredMainSegment = segmentIndex;
    
    const baseRef = `${tractate} ${dafRef}`; // e.g., "Berakhot 3a"
    
    // Try Sefaria Links API first (new primary source)
    let linkedRashiIndexes = sefariaLinksData?.rashi?.[segmentIndex] || [];
    let linkedTosafotIndexes = sefariaLinksData?.tosafot?.[segmentIndex] || [];
    
    // Fallback to original Sefaria linking if Links API didn't provide data
    if (linkedRashiIndexes.length === 0 && sefariaData?.linking?.rashi?.[baseRef]?.[segmentIndex]) {
      linkedRashiIndexes = sefariaData.linking.rashi[baseRef][segmentIndex];
    }
    
    if (linkedTosafotIndexes.length === 0 && sefariaData?.linking?.tosafot?.[baseRef]?.[segmentIndex]) {
      linkedTosafotIndexes = sefariaData.linking.tosafot[baseRef][segmentIndex];
    }
    
    // Final fallback: Use proximity-based linking if no data available
    if (linkedRashiIndexes.length === 0 && rashiSegments.length > 0) {
      linkedRashiIndexes = getFallbackCommentaryLinks(segmentIndex, rashiSegments.length, 'rashi');
    }
    
    if (linkedTosafotIndexes.length === 0 && tosafotSegments.length > 0) {
      linkedTosafotIndexes = getFallbackCommentaryLinks(segmentIndex, tosafotSegments.length, 'tosafot');
    }
    
    highlightedCommentary = {
      rashi: linkedRashiIndexes,
      tosafot: linkedTosafotIndexes
    };
    
    // Apply visual highlighting using both approaches
    applyHighlighting();
    
    console.log('Hovering main segment:', segmentIndex, 'Linked:', {
      rashi: linkedRashiIndexes,
      tosafot: linkedTosafotIndexes,
      source: sefariaLinksData?.rashi?.[segmentIndex] ? 'Links API' : 
              sefariaData?.linking?.rashi?.[baseRef]?.[segmentIndex] ? 'Original Sefaria' : 'Fallback',
      sefariaMainTextLength: sefariaData?.mainText?.length,
      foundMainSegments: mainTextSegments.length
    });
  }
  
  function handleMainTextLeave() {
    hoveredMainSegment = null;
    highlightedCommentary = { rashi: [], tosafot: [] };
    clearHighlighting();
  }
  
  function handleCommentaryHover(commentaryType, commentaryIndex) {
    const baseRef = `${tractate} ${dafRef}`;
    
    // Try Sefaria Links API first (reverse lookup)
    let linkedMainSegments = [];
    
    // Check Links API data for reverse mapping
    if (sefariaLinksData?.[commentaryType]) {
      Object.entries(sefariaLinksData[commentaryType]).forEach(([mainIndex, commentaryIndexes]) => {
        if (commentaryIndexes.includes(commentaryIndex)) {
          linkedMainSegments.push(parseInt(mainIndex));
        }
      });
    }
    
    // Fallback to original Sefaria linking if Links API didn't provide data
    if (linkedMainSegments.length === 0) {
      const linkingData = sefariaData?.linking?.[commentaryType]?.[baseRef];
      if (linkingData) {
        Object.entries(linkingData).forEach(([mainIndex, commentaryIndexes]) => {
          if (commentaryIndexes.includes(commentaryIndex)) {
            linkedMainSegments.push(parseInt(mainIndex));
          }
        });
      }
    }
    
    // Final fallback: Use proximity-based linking if no data available
    if (linkedMainSegments.length === 0 && mainTextSegments.length > 0) {
      linkedMainSegments = getFallbackMainTextLinks(commentaryIndex, mainTextSegments.length, commentaryType);
    }
    
    // Highlight the linked main text segments
    linkedMainSegments.forEach(mainIndex => {
      if (mainTextSegments[mainIndex]) {
        mainTextSegments[mainIndex].classList.add('main-hovered');
      }
    });
    
    // Highlight the hovered commentary segment
    if (commentaryType === 'rashi' && rashiSegments[commentaryIndex]) {
      rashiSegments[commentaryIndex].classList.add('rashi-highlighted');
    } else if (commentaryType === 'tosafot' && tosafotSegments[commentaryIndex]) {
      tosafotSegments[commentaryIndex].classList.add('tosafot-highlighted');
    }
    
    console.log(`Hovering ${commentaryType} segment:`, commentaryIndex, 'Linked main segments:', linkedMainSegments, {
      source: sefariaLinksData?.[commentaryType] && Object.keys(sefariaLinksData[commentaryType]).length > 0 ? 'Links API' : 
              sefariaData?.linking?.[commentaryType]?.[baseRef] ? 'Original Sefaria' : 'Fallback'
    });
  }
  
  function handleCommentaryLeave() {
    clearHighlighting();
  }
  
  function applyHighlighting() {
    // Clear previous highlighting
    clearHighlighting();
    
    // Highlight main text segment
    if (hoveredMainSegment !== null && mainTextSegments[hoveredMainSegment]) {
      mainTextSegments[hoveredMainSegment].classList.add('main-hovered');
    }
    
    // Highlight linked Rashi segments
    console.log('Trying to highlight Rashi segments:', highlightedCommentary.rashi, 'Available segments:', rashiSegments.length);
    highlightedCommentary.rashi.forEach(index => {
      if (rashiSegments[index]) {
        console.log('Highlighting Rashi segment', index);
        rashiSegments[index].classList.add('rashi-highlighted');
      } else {
        console.log('Rashi segment', index, 'not found in array of', rashiSegments.length);
      }
    });
    
    // Highlight linked Tosafot segments
    console.log('Trying to highlight Tosafot segments:', highlightedCommentary.tosafot, 'Available segments:', tosafotSegments.length);
    highlightedCommentary.tosafot.forEach(index => {
      if (tosafotSegments[index]) {
        console.log('Highlighting Tosafot segment', index);
        tosafotSegments[index].classList.add('tosafot-highlighted');
      } else {
        console.log('Tosafot segment', index, 'not found in array of', tosafotSegments.length);
      }
    });
  }
  
  function clearHighlighting() {
    // Remove all highlighting classes
    mainTextSegments.forEach(element => {
      element.classList.remove('main-hovered');
    });
    
    rashiSegments.forEach(element => {
      element.classList.remove('rashi-highlighted');
    });
    
    tosafotSegments.forEach(element => {
      element.classList.remove('tosafot-highlighted');
    });
  }
  
  // Re-setup when data changes
  $: if (dafContainer && sefariaData) {
    cleanupHoverHandlers();
    // Much longer delay to ensure setupInteractivity has created the commentary sentence spans
    setTimeout(async () => {
      console.log('Setting up hover handlers with delay...', { sefariaData });
      await loadSefariaLinksData();
      setupHoverHandlers();
    }, 1500); // Even longer delay to wait for setupInteractivity
  }
</script>

<!-- Debug info -->
{#if sefariaData}
  <div class="fixed top-4 right-4 bg-black bg-opacity-75 text-white p-3 rounded text-xs max-w-xs z-50">
    <div><strong>Interactive Linking Active</strong></div>
    <div>Sefaria segments: {sefariaData.mainText?.length || 0} main, {sefariaData.rashi?.length || 0} rashi, {sefariaData.tosafot?.length || 0} tosafot</div>
    <div>Sefaria Links API: {Object.keys(sefariaLinksData?.rashi || {}).length} rashi, {Object.keys(sefariaLinksData?.tosafot || {}).length} tosafot</div>
    <div>Original linking: {Object.keys(sefariaData.linking?.rashi || {}).length} rashi, {Object.keys(sefariaData.linking?.tosafot || {}).length} tosafot</div>
    {#if hoveredMainSegment !== null}
      <div>Hovering: Segment {hoveredMainSegment}</div>
      <div>Highlighting: {highlightedCommentary.rashi.length} rashi, {highlightedCommentary.tosafot.length} tosafot</div>
    {/if}
    {#if Object.keys(sefariaLinksData?.rashi || {}).length > 0 || Object.keys(sefariaLinksData?.tosafot || {}).length > 0}
      <div class="text-green-300">✅ Sefaria Links API data available</div>
    {:else if Object.keys(sefariaData.linking?.rashi || {}).length === 0 && Object.keys(sefariaData.linking?.tosafot || {}).length === 0}
      <div class="text-yellow-300">⚠️ No linking data - using proximity fallback</div>
    {:else}
      <div class="text-blue-300">📊 Using original Sefaria linking data</div>
      {#if Object.keys(sefariaData.linking?.rashi || {}).length > 0 && Object.keys(sefariaData.linking?.tosafot || {}).length === 0}
        <div class="text-yellow-300">⚠️ Only Rashi linking available - Tosafot uses fallback</div>
      {/if}
      {#if Object.keys(sefariaData.linking?.rashi || {}).length === 0 && Object.keys(sefariaData.linking?.tosafot || {}).length > 0}
        <div class="text-yellow-300">⚠️ Only Tosafot linking available - Rashi uses fallback</div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* Highlighting styles */
  :global(.main-hovered) {
    background-color: #FEF3C7 !important;
    border-radius: 2px;
    padding: 1px 2px;
  }
  
  :global(.rashi-highlighted) {
    background-color: #DBEAFE !important;
    border-radius: 2px;
    padding: 1px 2px;
    border: 1px solid #3B82F6;
  }
  
  :global(.tosafot-highlighted) {
    background-color: #D1FAE5 !important;
    border-radius: 2px;
    padding: 1px 2px;
    border: 1px solid #10B981;
  }
</style>