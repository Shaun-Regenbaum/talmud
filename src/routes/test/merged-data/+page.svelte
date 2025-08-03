<script>
  import { onMount } from 'svelte';
  import DiffViewer from '$lib/components/DiffViewer.svelte';
  import LinkedTextViewer from '$lib/components/LinkedTextViewer.svelte';
  
  let loading = false;
  let results = null;
  let error = null;
  let mesechta = '1';
  let daf = '3'; // Start at 2a which has content in both sources
  
  // Daf-supplier options
  let useBrTags = false;
  let bypassCache = false;
  let debugMode = false;
  
  // Sefaria API options
  let sefariaVersion = 'primary';
  let sefariaLang = 'he';
  let includeCommentary = true;
  
  // View options
  let showDiffView = true;
  let showRawMerged = false;
  let showLinkedView = false;
  
  // Collapsible sections
  let showDafSupplierSettings = false;
  let showSefariaSettings = false;
  let showDafSupplierData = false;
  let showSefariaData = false;
  let showDafSupplierRaw = false;
  let showSefariaRaw = false;
  
  // Debug info
  let debugInfo = {
    apiCalls: [],
    timings: {}
  };
  
  // Tractate name mapping
  const TRACTATE_MAPPING = {
    '1': 'Berakhot',
    '2': 'Shabbat',
    '3': 'Eruvin',
    '4': 'Pesachim',
    '5': 'Shekalim',
    '6': 'Yoma',
    '7': 'Sukkah',
    '8': 'Beitzah',
    '9': 'Rosh Hashanah',
    '10': 'Taanit',
    '11': 'Megillah',
    '12': 'Moed Katan'
  };
  
  async function fetchMergedData() {
    loading = true;
    error = null;
    debugInfo = { apiCalls: [], timings: {} };
    
    const startTime = Date.now();
    
    try {
      const searchParams = new URLSearchParams({
        mesechta,
        daf
      });
      
      // Add daf-supplier options if enabled
      if (useBrTags) searchParams.set('br', 'true');
      if (bypassCache) searchParams.set('nocache', 'true'); 
      if (debugMode) searchParams.set('debug', 'true');
      
      const apiUrl = `/api/talmud-merged?${searchParams.toString()}`;
      debugInfo.apiCalls.push({ type: 'merged', url: apiUrl, timestamp: new Date().toISOString() });
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      debugInfo.timings.merged = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch');
      }
      
      results = data;
      console.log('Merged results:', data);
    } catch (err) {
      error = err.message;
      console.error('Error:', err);
    } finally {
      loading = false;
    }
  }
  
  onMount(() => {
    fetchMergedData();
  });
</script>

<svelte:head>
  <title>Talmud Merged API Test</title>
</svelte:head>

<div class="max-w-7xl mx-auto p-6">
  <h1 class="text-3xl font-bold text-gray-800 mb-6">Talmud Merged API Test</h1>
  
  <!-- Main Controls -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <h2 class="text-lg font-semibold text-gray-800 mb-4">Select Daf</h2>
    <div class="flex flex-wrap gap-4 items-end">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Masechet
        </label>
        <select bind:value={mesechta} class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          {#each Object.entries(TRACTATE_MAPPING) as [value, name]}
            <option value={value}>{name}</option>
          {/each}
        </select>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Daf
        </label>
        <input 
          type="text" 
          bind:value={daf} 
          placeholder="3" 
          class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-20"
        />
      </div>
      
      <button 
        on:click={fetchMergedData} 
        disabled={loading}
        class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Loading...' : 'Fetch Data'}
      </button>
    </div>
  </div>
  
  {#if error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <h2 class="text-lg font-semibold text-red-800 mb-1">Error</h2>
      <p class="text-red-700">{error}</p>
    </div>
  {/if}
  
  <!-- Daf-Supplier Settings -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
    <button 
      class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      on:click={() => showDafSupplierSettings = !showDafSupplierSettings}
    >
      <h3 class="text-lg font-semibold text-gray-800">Daf-Supplier Settings</h3>
      <svg class="w-5 h-5 text-gray-500 transform transition-transform {showDafSupplierSettings ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </button>
    
    {#if showDafSupplierSettings}
      <div class="px-6 pb-4 border-t border-gray-200">
        <div class="space-y-3 mt-4">
          <label class="flex items-center gap-3">
            <input type="checkbox" bind:checked={useBrTags} class="rounded border-gray-300" />
            <span class="text-sm text-gray-700">Use &lt;br&gt; tags (convert newlines to HTML breaks)</span>
          </label>
          
          <label class="flex items-center gap-3">
            <input type="checkbox" bind:checked={bypassCache} class="rounded border-gray-300" />
            <span class="text-sm text-gray-700">Bypass cache (fetch fresh data)</span>
          </label>
          
          <label class="flex items-center gap-3">
            <input type="checkbox" bind:checked={debugMode} class="rounded border-gray-300" />
            <span class="text-sm text-gray-700">Debug mode (extra logging)</span>
          </label>
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Sefaria API Settings -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
    <button 
      class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      on:click={() => showSefariaSettings = !showSefariaSettings}
    >
      <h3 class="text-lg font-semibold text-gray-800">Sefaria API Settings</h3>
      <svg class="w-5 h-5 text-gray-500 transform transition-transform {showSefariaSettings ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </button>
    
    {#if showSefariaSettings}
      <div class="px-6 pb-4 border-t border-gray-200">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select bind:value={sefariaLang} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="he">Hebrew</option>
              <option value="en">English</option>
              <option value="both">Both</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Version</label>
            <select bind:value={sefariaVersion} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="primary">Primary/Default</option>
              <option value="William_Davidson_Edition_-_Aramaic">William Davidson (Aramaic)</option>
              <option value="Wikisource_Talmud_Bavli">Wikisource Talmud Bavli</option>
              <option value="William Davidson Edition - English">William Davidson (English)</option>
            </select>
          </div>
        </div>
        
        <label class="flex items-center gap-3 mt-4">
          <input type="checkbox" bind:checked={includeCommentary} class="rounded border-gray-300" />
          <span class="text-sm text-gray-700">Include Rashi & Tosafot</span>
        </label>
      </div>
    {/if}
  </div>
  
  {#if results}
    <!-- Daf-Supplier Data -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <button 
        class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        on:click={() => showDafSupplierData = !showDafSupplierData}
      >
        <h3 class="text-lg font-semibold text-gray-800">Daf-Supplier Data (HebrewBooks)</h3>
        <svg class="w-5 h-5 text-gray-500 transform transition-transform {showDafSupplierData ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>
      
      {#if showDafSupplierData}
        <div class="px-6 pb-6 border-t border-gray-200">
          <div class="mt-4 space-y-4">
            <!-- Summary -->
            <div class="bg-gray-50 rounded-lg p-4">
              <h4 class="font-medium text-gray-700 mb-2">Data Summary</h4>
              <ul class="space-y-1 text-sm text-gray-600">
                <li>Main Text: {results.sources.hebrewBooks.mainText ? `✓ Available (${results.sources.hebrewBooks.mainText.length} chars)` : '✗ Not Available'}</li>
                <li>Rashi: {results.sources.hebrewBooks.rashi ? `✓ Available (${results.sources.hebrewBooks.rashi.length} chars)` : '✗ Not Available'}</li>
                <li>Tosafot: {results.sources.hebrewBooks.tosafot ? `✓ Available (${results.sources.hebrewBooks.tosafot.length} chars)` : '✗ Not Available'}</li>
              </ul>
            </div>
            
            <!-- Content Preview -->
            <div class="space-y-4">
              {#if results.sources.hebrewBooks.mainText}
                <div>
                  <h5 class="font-medium text-gray-700 mb-2">Main Text Preview</h5>
                  <div class="p-3 bg-gray-50 rounded border border-gray-200 text-right max-h-40 overflow-y-auto" dir="rtl">
                    <p class="text-sm">{@html results.sources.hebrewBooks.mainText.substring(0, 400)}...</p>
                  </div>
                </div>
              {/if}
              
              {#if results.sources.hebrewBooks.rashi}
                <div>
                  <h5 class="font-medium text-gray-700 mb-2">Rashi Preview</h5>
                  <div class="p-3 bg-gray-50 rounded border border-gray-200 text-right max-h-40 overflow-y-auto" dir="rtl">
                    <p class="text-sm">{@html results.sources.hebrewBooks.rashi.substring(0, 300)}...</p>
                  </div>
                </div>
              {/if}
              
              {#if results.sources.hebrewBooks.tosafot}
                <div>
                  <h5 class="font-medium text-gray-700 mb-2">Tosafot Preview</h5>
                  <div class="p-3 bg-gray-50 rounded border border-gray-200 text-right max-h-40 overflow-y-auto" dir="rtl">
                    <p class="text-sm">{@html results.sources.hebrewBooks.tosafot.substring(0, 300)}...</p>
                  </div>
                </div>
              {/if}
            </div>
            
            <!-- Raw JSON Toggle -->
            <button 
              class="text-sm text-blue-600 hover:text-blue-700"
              on:click={() => showDafSupplierRaw = !showDafSupplierRaw}
            >
              {showDafSupplierRaw ? 'Hide' : 'Show'} Raw JSON
            </button>
            
            {#if showDafSupplierRaw}
              <pre class="p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto rounded-lg max-h-96">{JSON.stringify(results.sources.hebrewBooks, null, 2)}</pre>
            {/if}
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Sefaria Data -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <button 
        class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        on:click={() => showSefariaData = !showSefariaData}
      >
        <h3 class="text-lg font-semibold text-gray-800">Sefaria API Data</h3>
        <svg class="w-5 h-5 text-gray-500 transform transition-transform {showSefariaData ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>
      
      {#if showSefariaData}
        <div class="px-6 pb-6 border-t border-gray-200">
          <div class="mt-4 space-y-4">
            <!-- Summary -->
            <div class="bg-gray-50 rounded-lg p-4">
              <h4 class="font-medium text-gray-700 mb-2">Data Summary</h4>
              <ul class="space-y-1 text-sm text-gray-600">
                <li>Main Text: {results.sources.sefaria.mainText?.length || 0} segments ({results.sources.sefaria.mainText ? results.sources.sefaria.mainText.join(' ').length : 0} chars)</li>
                <li>Rashi: {results.sources.sefaria.rashi?.length || 0} segments ({results.sources.sefaria.rashi ? results.sources.sefaria.rashi.join(' ').length : 0} chars)</li>
                <li>Tosafot: {results.sources.sefaria.tosafot?.length || 0} segments ({results.sources.sefaria.tosafot ? results.sources.sefaria.tosafot.join(' ').length : 0} chars)</li>
              </ul>
            </div>
            
            <!-- Content Preview -->
            <div class="space-y-4">
              {#if results.sources.sefaria.mainText?.length > 0}
                <div>
                  <h5 class="font-medium text-gray-700 mb-2">Main Text Preview</h5>
                  <div class="p-3 bg-gray-50 rounded border border-gray-200 text-right max-h-40 overflow-y-auto" dir="rtl">
                    <p class="text-sm">{results.sources.sefaria.mainText.slice(0, 3).join(' ')}...</p>
                  </div>
                </div>
              {/if}
              
              {#if results.sources.sefaria.rashi?.length > 0}
                <div>
                  <h5 class="font-medium text-gray-700 mb-2">Rashi Preview</h5>
                  <div class="p-3 bg-gray-50 rounded border border-gray-200 text-right max-h-40 overflow-y-auto" dir="rtl">
                    <p class="text-sm">{results.sources.sefaria.rashi.slice(0, 2).join(' ')}...</p>
                  </div>
                </div>
              {/if}
              
              {#if results.sources.sefaria.tosafot?.length > 0}
                <div>
                  <h5 class="font-medium text-gray-700 mb-2">Tosafot Preview</h5>
                  <div class="p-3 bg-gray-50 rounded border border-gray-200 text-right max-h-40 overflow-y-auto" dir="rtl">
                    <p class="text-sm">{results.sources.sefaria.tosafot.slice(0, 2).join(' ')}...</p>
                  </div>
                </div>
              {/if}
            </div>
            
            <!-- Raw JSON Toggle -->
            <button 
              class="text-sm text-blue-600 hover:text-blue-700"
              on:click={() => showSefariaRaw = !showSefariaRaw}
            >
              {showSefariaRaw ? 'Hide' : 'Show'} Raw JSON
            </button>
            
            {#if showSefariaRaw}
              <pre class="p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto rounded-lg max-h-96">{JSON.stringify(results.sources.sefaria, null, 2)}</pre>
            {/if}
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Merged Results -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 class="text-xl font-semibold mb-4">Merged Results</h2>
      <p class="text-sm text-gray-600 mb-4">
        <strong>Reference:</strong> {results.tractate} {results.dafDisplay}{results.amud} | 
        <strong>Method:</strong> {results.method}
      </p>
      
      <!-- View Toggle -->
      <div class="flex gap-2 mb-6">
        <button 
          on:click={() => { showDiffView = true; showRawMerged = false; showLinkedView = false; }}
          class="px-4 py-2 rounded-md transition-colors {showDiffView ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}"
        >
          Diff View
        </button>
        <button 
          on:click={() => { showDiffView = false; showRawMerged = true; showLinkedView = false; }}
          class="px-4 py-2 rounded-md transition-colors {showRawMerged ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}"
        >
          Merged Text
        </button>
        <button 
          on:click={() => { showDiffView = false; showRawMerged = false; showLinkedView = true; }}
          class="px-4 py-2 rounded-md transition-colors {showLinkedView ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}"
        >
          Interactive Links
        </button>
      </div>
      
      <!-- Diff View -->
      {#if showDiffView && results.diffs}
        <div class="space-y-8">
          <DiffViewer 
            title="Main Text Comparison" 
            diffs={results.diffs.main || []} 
            stats={results.mergeStats?.main}
          />
          
          <DiffViewer 
            title="Rashi Comparison" 
            diffs={results.diffs.rashi || []} 
            stats={results.mergeStats?.rashi}
          />
          
          <DiffViewer 
            title="Tosafot Comparison" 
            diffs={results.diffs.tosafot || []} 
            stats={results.mergeStats?.tosafot}
          />
        </div>
      {/if}
      
      <!-- Merged Result View -->
      {#if showRawMerged}
        <div class="space-y-6">
          <div>
            <h4 class="text-lg font-semibold mb-2">Main Text (merged)</h4>
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right" dir="rtl">
              <p class="whitespace-pre-wrap">{results.mainText ? results.mainText.substring(0, 800) + '...' : 'No content'}</p>
            </div>
          </div>
          
          <div>
            <h4 class="text-lg font-semibold mb-2">Rashi (merged)</h4>
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right" dir="rtl">
              <p class="whitespace-pre-wrap">{results.rashi ? results.rashi.substring(0, 600) + '...' : 'No content'}</p>
            </div>
          </div>
          
          <div>
            <h4 class="text-lg font-semibold mb-2">Tosafot (merged)</h4>
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right" dir="rtl">
              <p class="whitespace-pre-wrap">{results.tosafot ? results.tosafot.substring(0, 600) + '...' : 'No content'}</p>
            </div>
          </div>
        </div>
      {/if}
      
      <!-- Interactive Links View -->
      {#if showLinkedView}
        <LinkedTextViewer 
          mainText={results.sources.sefaria.mainText || []}
          rashi={results.sources.sefaria.rashi || []}
          tosafot={results.sources.sefaria.tosafot || []}
          rashiLinking={results.sources.sefaria.linking?.rashi || {}}
          tosafotLinking={results.sources.sefaria.linking?.tosafot || {}}
          tractate={results.tractate}
          dafRef={`${results.dafDisplay}${results.amud}`}
        />
      {/if}
    </div>
  {/if}
  
  <!-- Debug Information -->
  {#if debugInfo.apiCalls.length > 0}
    <details class="mt-8 bg-gray-100 rounded-lg">
      <summary class="px-6 py-4 cursor-pointer hover:bg-gray-200 rounded-lg font-medium">Debug Information</summary>
      <div class="px-6 pb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 class="font-medium mb-2">Response Times</h3>
            <ul class="space-y-1 text-sm">
              {#each Object.entries(debugInfo.timings) as [key, time]}
                <li><span class="font-mono">{key}:</span> {time}ms</li>
              {/each}
            </ul>
          </div>
          
          <div>
            <h3 class="font-medium mb-2">API Calls Made</h3>
            <ul class="space-y-2 text-sm">
              {#each debugInfo.apiCalls as call}
                <li class="bg-white p-2 rounded border border-gray-200">
                  <strong>{call.type}:</strong>
                  <code class="block mt-1 text-xs bg-gray-50 p-1 rounded overflow-x-auto">{call.url}</code>
                  <span class="text-xs text-gray-500">{call.timestamp}</span>
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
    </details>
  {/if}
</div>