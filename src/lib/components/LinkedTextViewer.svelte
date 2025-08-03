<script>
  export let mainText = [];
  export let rashi = [];
  export let tosafot = [];
  export let rashiLinking = {};
  export let tosafotLinking = {};
  export let tractate = 'Berakhot';
  export let dafRef = '3a';
  
  let hoveredSegment = null;
  let highlightedCommentary = { rashi: [], tosafot: [] };
  let highlightedMainText = [];
  
  // Commentary is already filtered by the API, so just use it directly
  $: linkedRashi = rashi;
  $: linkedTosafot = tosafot;
  
  function filterLinkedCommentary(commentary, linking, tractate, dafRef) {
    if (!commentary || !linking) return [];
    
    const baseRef = `${tractate} ${dafRef}`;
    const linkedIndexes = new Set();
    
    // Get all commentary indexes that have links to main text
    Object.values(linking[baseRef] || {}).forEach(commentaryIndexes => {
      if (Array.isArray(commentaryIndexes)) {
        commentaryIndexes.forEach(index => linkedIndexes.add(index));
      }
    });
    
    console.log(`🔗 Filtering ${tractate} ${dafRef}:`, {
      totalSegments: commentary.length,
      linkedIndexes: Array.from(linkedIndexes).sort((a, b) => a - b),
      linkingStructure: linking[baseRef],
      linkingKeys: Object.keys(linking[baseRef] || {}),
      firstFewEntries: Object.entries(linking[baseRef] || {}).slice(0, 3)
    });
    
    // Return only linked segments with their original content
    const filtered = [];
    commentary.forEach((segment, index) => {
      if (linkedIndexes.has(index) && segment && segment.trim().length > 5) {
        filtered.push({
          originalIndex: index,
          content: segment
        });
      }
    });
    
    console.log(`✅ Filtered result: ${filtered.length} segments`);
    return filtered.map(item => item.content);
  }
  
  function handleMainTextHover(segmentIndex) {
    hoveredSegment = segmentIndex;
    
    // Use the new linking structure: baseRef -> sentenceIndex -> commentaryIndexes
    const baseRef = `${tractate} ${dafRef}`; // e.g., "Berakhot 3a"
    
    // Find linked segments for this main text segment index (0-based)
    const linkedRashiIndexes = rashiLinking[baseRef]?.[segmentIndex] || [];
    const linkedTosafotIndexes = tosafotLinking[baseRef]?.[segmentIndex] || [];
    
    highlightedCommentary = {
      rashi: linkedRashiIndexes,
      tosafot: linkedTosafotIndexes
    };
    
    console.log('Hovering segment:', segmentIndex, 'Base ref:', baseRef);
    console.log('Linked Rashi indexes:', linkedRashiIndexes);
    console.log('Linked Tosafot indexes:', linkedTosafotIndexes);
    console.log('Rashi array length:', rashi.length, 'Tosafot array length:', tosafot.length);
  }
  
  function handleMainTextLeave() {
    hoveredSegment = null;
    highlightedCommentary = { rashi: [], tosafot: [] };
  }
  
  function handleCommentaryHover(commentaryIndex, type) {
    // Find which main text segments this commentary is linked to
    const baseRef = `${tractate} ${dafRef}`;
    const linking = type === 'rashi' ? rashiLinking : tosafotLinking;
    const linkedMainSegments = [];
    
    // Look through the linking structure to find main text segments that link to this commentary
    Object.entries(linking[baseRef] || {}).forEach(([mainSegmentIndex, commentaryIndexes]) => {
      if (Array.isArray(commentaryIndexes) && commentaryIndexes.includes(commentaryIndex)) {
        linkedMainSegments.push(parseInt(mainSegmentIndex));
      }
    });
    
    highlightedMainText = linkedMainSegments;
    
    // Auto-scroll to the first linked main text segment if it's out of view
    if (linkedMainSegments.length > 0) {
      const firstSegmentIndex = linkedMainSegments[0];
      const element = document.querySelector(`[data-segment="${firstSegmentIndex}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
        if (rect.top < 0 || rect.bottom - viewHeight >= 0) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
    
    console.log(`Hovering ${type} segment ${commentaryIndex}, linked to main segments:`, linkedMainSegments);
  }
  
  function handleCommentaryLeave() {
    highlightedMainText = [];
  }
</script>

<div class="linked-text-viewer">
  <h3 class="text-lg font-semibold mb-4">Interactive Text Linking</h3>
  <p class="text-sm text-gray-600 mb-4">
    Hover over segments in the main text to see connected Rashi and Tosafot highlighted.
    Hover over commentary to see connected main text highlighted (with auto-scroll).
    Main text shows Sefaria's clean sentence divisions. Commentary has been pre-filtered by the API to only show linked segments.
  </p>
  
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Main Text -->
    <div class="space-y-2">
      <h4 class="font-medium text-gray-800">Main Text</h4>
      <div class="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-y-auto" dir="rtl">
        {#if mainText && mainText.length > 0}
          {#each mainText as segment, index}
            <span 
              class="segment cursor-pointer p-1 rounded transition-colors {
                hoveredSegment === index ? 'bg-yellow-200' : 
                highlightedMainText.includes(index) ? 'bg-orange-200' : 
                'hover:bg-yellow-100'
              }"
              on:mouseenter={() => handleMainTextHover(index)}
              on:mouseleave={handleMainTextLeave}
              data-segment={index}
            >
              {segment}
            </span>
            {#if index < mainText.length - 1}<span class="text-gray-400"> | </span>{/if}
          {/each}
        {:else}
          <p class="text-gray-500">No main text segments available</p>
        {/if}
      </div>
    </div>
    
    <!-- Rashi (pre-filtered by API) -->
    <div class="space-y-2">
      <h4 class="font-medium text-gray-800">Rashi <span class="text-sm text-gray-500">(pre-filtered by API)</span></h4>
      <div class="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-y-auto" dir="rtl">
        {#if linkedRashi && linkedRashi.length > 0}
          {#each linkedRashi as segment, index}
            <div 
              class="rashi-segment p-2 mb-2 rounded transition-colors cursor-pointer {highlightedCommentary.rashi.includes(index) ? 'bg-blue-200 border-blue-400 border-2' : 'bg-white border border-gray-200 hover:bg-blue-50'}"
              on:mouseenter={() => handleCommentaryHover(index, 'rashi')}
              on:mouseleave={handleCommentaryLeave}
              data-segment={index}
            >
              <span class="text-sm">{segment}</span>
            </div>
          {/each}
        {:else}
          <p class="text-gray-500">No linked Rashi segments available</p>
        {/if}
      </div>
    </div>
    
    <!-- Tosafot (pre-filtered by API) -->
    <div class="space-y-2">
      <h4 class="font-medium text-gray-800">Tosafot <span class="text-sm text-gray-500">(pre-filtered by API)</span></h4>
      <div class="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-y-auto" dir="rtl">
        {#if linkedTosafot && linkedTosafot.length > 0}
          {#each linkedTosafot as segment, index}
            <div 
              class="tosafot-segment p-2 mb-2 rounded transition-colors cursor-pointer {highlightedCommentary.tosafot.includes(index) ? 'bg-green-200 border-green-400 border-2' : 'bg-white border border-gray-200 hover:bg-green-50'}"
              on:mouseenter={() => handleCommentaryHover(index, 'tosafot')}
              on:mouseleave={handleCommentaryLeave}
              data-segment={index}
            >
              <span class="text-sm">{segment}</span>
            </div>
          {/each}
        {:else}
          <p class="text-gray-500">No linked Tosafot segments available</p>
        {/if}
      </div>
    </div>
  </div>
  
  <!-- Debug Info -->
  <div class="mt-4 p-3 bg-gray-100 rounded-lg text-xs space-y-2">
    <div><strong>API Pre-filtering:</strong> 
      Rashi: {rashi.length} segments (already filtered) | 
      Tosafot: {tosafot.length} segments (already filtered)
    </div>
    <div><strong>Available Rashi Links:</strong> {JSON.stringify(rashiLinking)}</div>
    <div><strong>Available Tosafot Links:</strong> {JSON.stringify(tosafotLinking)}</div>
    {#if hoveredSegment !== null}
      <div>
        <strong>Debug:</strong> Hovering segment {hoveredSegment} | 
        Looking for ref: "{tractate} {dafRef}:{hoveredSegment + 1}" |
        Rashi links: {highlightedCommentary.rashi.join(', ') || 'none'} | 
        Tosafot links: {highlightedCommentary.tosafot.join(', ') || 'none'}
      </div>
    {/if}
  </div>
</div>

<style>
  .segment {
    display: inline;
  }
  
  .rashi-segment, .tosafot-segment {
    transition: all 0.2s ease;
  }
</style>