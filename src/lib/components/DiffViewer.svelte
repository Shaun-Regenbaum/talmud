<script>
  export let diffs = [];
  export let stats = null;
  export let title = '';
  export let showStats = true;
  
  function getPercentage(value, total) {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  }
</script>

<div class="diff-viewer">
  {#if title}
    <h4 class="text-lg font-semibold mb-3">{title}</h4>
  {/if}
  
  {#if showStats && stats}
    <div class="mb-4 p-3 bg-gray-100 rounded-lg">
      <div class="grid grid-cols-3 gap-4 text-sm">
        <div class="text-center">
          <div class="text-green-600 font-bold">{getPercentage(stats.agreements, stats.totalChars)}%</div>
          <div class="text-gray-600">Agreement</div>
          <div class="text-xs text-gray-500">{stats.agreements} chars</div>
        </div>
        <div class="text-center">
          <div class="text-blue-600 font-bold">{getPercentage(stats.additions, stats.totalChars)}%</div>
          <div class="text-gray-600">HebrewBooks Only</div>
          <div class="text-xs text-gray-500">{stats.additions} chars</div>
        </div>
        <div class="text-center">
          <div class="text-red-600 font-bold">{getPercentage(stats.removals, stats.totalChars)}%</div>
          <div class="text-gray-600">Sefaria Only</div>
          <div class="text-xs text-gray-500">{stats.removals} chars</div>
        </div>
      </div>
    </div>
  {/if}
  
  <div class="diff-content p-4 bg-white border border-gray-200 rounded-lg overflow-x-auto" dir="rtl">
    <div class="font-hebrew text-lg leading-relaxed">
      {#each diffs as diff}
        {#if diff.added}
          <span class="bg-blue-100 text-blue-900 px-0.5" title="HebrewBooks only">{diff.value}</span>
        {:else if diff.removed}
          <span class="bg-red-100 text-red-900 px-0.5" title="Sefaria only">{diff.value}</span>
        {:else}
          <span class="text-gray-900">{diff.value}</span>
        {/if}
      {/each}
    </div>
  </div>
  
  <div class="mt-2 flex items-center gap-4 text-xs text-gray-600">
    <div class="flex items-center gap-1">
      <span class="inline-block w-3 h-3 bg-gray-100 border border-gray-300"></span>
      <span>Both sources agree</span>
    </div>
    <div class="flex items-center gap-1">
      <span class="inline-block w-3 h-3 bg-blue-100 border border-blue-300"></span>
      <span>HebrewBooks only</span>
    </div>
    <div class="flex items-center gap-1">
      <span class="inline-block w-3 h-3 bg-red-100 border border-red-300"></span>
      <span>Sefaria only</span>
    </div>
  </div>
</div>

<style>
  .font-hebrew {
    font-family: 'Times New Roman', serif;
  }
</style>