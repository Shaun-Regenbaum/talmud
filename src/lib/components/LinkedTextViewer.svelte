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
</script>

<div class="linked-text-viewer">
  <h3 class="text-lg font-semibold mb-4">Interactive Text Linking</h3>
  <p class="text-sm text-gray-600 mb-4">
    Hover over segments in the main text to see connected Rashi and Tosafot highlighted.
  </p>
  
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Main Text -->
    <div class="space-y-2">
      <h4 class="font-medium text-gray-800">Main Text</h4>
      <div class="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-y-auto" dir="rtl">
        {#if mainText && mainText.length > 0}
          {#each mainText as segment, index}
            <span 
              class="segment cursor-pointer p-1 rounded transition-colors {hoveredSegment === index ? 'bg-yellow-200' : 'hover:bg-yellow-100'}"
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
    
    <!-- Rashi -->
    <div class="space-y-2">
      <h4 class="font-medium text-gray-800">Rashi</h4>
      <div class="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-y-auto" dir="rtl">
        {#if rashi && rashi.length > 0}
          {#each rashi as segment, index}
            <div 
              class="rashi-segment p-2 mb-2 rounded transition-colors {highlightedCommentary.rashi.includes(index) ? 'bg-blue-200 border-blue-400 border-2' : 'bg-white border border-gray-200'}"
              data-segment={index}
            >
              <span class="text-sm">{segment}</span>
            </div>
          {/each}
        {:else}
          <p class="text-gray-500">No Rashi segments available</p>
        {/if}
      </div>
    </div>
    
    <!-- Tosafot -->
    <div class="space-y-2">
      <h4 class="font-medium text-gray-800">Tosafot</h4>
      <div class="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-y-auto" dir="rtl">
        {#if tosafot && tosafot.length > 0}
          {#each tosafot as segment, index}
            <div 
              class="tosafot-segment p-2 mb-2 rounded transition-colors {highlightedCommentary.tosafot.includes(index) ? 'bg-green-200 border-green-400 border-2' : 'bg-white border border-gray-200'}"
              data-segment={index}
            >
              <span class="text-sm">{segment}</span>
            </div>
          {/each}
        {:else}
          <p class="text-gray-500">No Tosafot segments available</p>
        {/if}
      </div>
    </div>
  </div>
  
  <!-- Debug Info -->
  <div class="mt-4 p-3 bg-gray-100 rounded-lg text-xs space-y-2">
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