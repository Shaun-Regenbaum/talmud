<script>
  import { onMount } from 'svelte';
  import DiffViewer from '$lib/components/DiffViewer.svelte';
  
  let loading = false;
  let results = null;
  let error = null;
  let mesechta = '1';
  let daf = '3'; // Start at 2a which has content in both sources
  
  // Daf-supplier options
  let useBrTags = false;
  let bypassCache = false;
  let debugMode = false;
  
  // Sefaria API testing
  let showSefariaTest = false;
  let sefariaLoading = false;
  let sefariaResults = null;
  let sefariaError = null;
  let sefariaVersion = 'primary';
  let sefariaLang = 'he';
  let includeCommentary = true;
  
  // View options
  let showDiffView = true;
  let showRawMerged = false;
  
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
    '8': 'Beitzah'
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
  
  async function fetchSefariaDirectly() {
    sefariaLoading = true;
    sefariaError = null;
    sefariaResults = null;
    
    const startTime = Date.now();
    const tractate = TRACTATE_MAPPING[mesechta];
    
    if (!tractate) {
      sefariaError = `Unknown mesechta: ${mesechta}`;
      sefariaLoading = false;
      return;
    }
    
    // Convert daf number to Sefaria format
    // HebrewBooks: 2 = 2a, 3 = 2b, 4 = 3a, 5 = 3b, etc.
    const dafNum = parseInt(daf);
    const pageNum = Math.ceil(dafNum / 2);
    const amud = dafNum % 2 === 0 ? 'b' : 'a';
    const sefariaRef = `${pageNum}${amud}`;
    
    try {
      // Build API URLs
      const mainUrl = `https://www.sefaria.org/api/texts/${tractate}.${sefariaRef}`;
      const urls = {
        main: mainUrl,
        rashi: includeCommentary ? `https://www.sefaria.org/api/texts/Rashi_on_${tractate}.${sefariaRef}` : null,
        tosafot: includeCommentary ? `https://www.sefaria.org/api/texts/Tosafot_on_${tractate}.${sefariaRef}` : null
      };
      
      // Add language/version parameters
      const params = new URLSearchParams();
      if (sefariaLang === 'he' && sefariaVersion !== 'primary') {
        params.set('vhe', sefariaVersion);
      } else if (sefariaLang === 'en' && sefariaVersion !== 'primary') {
        params.set('ven', sefariaVersion);
      }
      
      // Fetch all texts
      const fetchPromises = Object.entries(urls).map(async ([key, url]) => {
        if (!url) return null;
        
        const fullUrl = url + (params.toString() ? '?' + params.toString() : '');
        debugInfo.apiCalls.push({ type: `sefaria-${key}`, url: fullUrl, timestamp: new Date().toISOString() });
        
        try {
          const response = await fetch(fullUrl);
          if (!response.ok) return null;
          return await response.json();
        } catch (e) {
          console.error(`Failed to fetch ${key}:`, e);
          return null;
        }
      });
      
      const [main, rashi, tosafot] = await Promise.all(fetchPromises);
      debugInfo.timings.sefaria = Date.now() - startTime;
      
      sefariaResults = {
        tractate,
        ref: `${tractate} ${sefariaRef}`,
        main,
        rashi,
        tosafot,
        metadata: {
          dafNum,
          pageNum,
          amud,
          timestamp: Date.now()
        }
      };
      
    } catch (err) {
      sefariaError = err.message;
      console.error('Sefaria fetch error:', err);
    } finally {
      sefariaLoading = false;
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
  
  <div class="bg-gray-50 rounded-lg p-6 mb-6">
    <div class="flex flex-wrap gap-4 items-end mb-6">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Mesechta
        </label>
        <select bind:value={mesechta} class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="1">Berakhot</option>
          <option value="2">Shabbat</option>
          <option value="3">Eruvin</option>
          <option value="4">Pesachim</option>
          <option value="5">Shekalim</option>
          <option value="6">Yoma</option>
          <option value="7">Sukkah</option>
          <option value="8">Beitzah</option>
        </select>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Daf
        </label>
        <input 
          type="text" 
          bind:value={daf} 
          placeholder="2" 
          class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      <button 
        on:click={fetchMergedData} 
        disabled={loading}
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Loading...' : 'Fetch Merged Data'}
      </button>
    </div>
    
    <div class="border-t pt-4">
      <h3 class="text-sm font-medium text-gray-700 mb-2">Daf-Supplier Options</h3>
      <div class="space-y-2">
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={useBrTags} class="rounded border-gray-300" />
          <span class="text-sm text-gray-600">Use &lt;br&gt; tags (convert newlines to HTML breaks)</span>
        </label>
        
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={bypassCache} class="rounded border-gray-300" />
          <span class="text-sm text-gray-600">Bypass cache (fetch fresh data)</span>
        </label>
        
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={debugMode} class="rounded border-gray-300" />
          <span class="text-sm text-gray-600">Debug mode (extra logging)</span>
        </label>
      </div>
    </div>
  </div>
  
  {#if error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <h2 class="text-lg font-semibold text-red-800 mb-1">Error</h2>
      <p class="text-red-700">{error}</p>
    </div>
  {/if}
  
  <!-- Sefaria API Testing Section -->
  <div class="bg-gray-50 rounded-lg p-6 mb-6">
    <h2 class="text-xl font-semibold text-gray-800 mb-4">Sefaria API Testing</h2>
    
    <button 
      class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 mb-4"
      on:click={() => showSefariaTest = !showSefariaTest}
    >
      {showSefariaTest ? 'Hide' : 'Show'} Sefaria Direct API Test
    </button>
    
    {#if showSefariaTest}
      <div class="bg-white rounded-lg p-4">
        <div class="flex flex-wrap gap-4 items-end mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select bind:value={sefariaLang} class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="he">Hebrew</option>
              <option value="en">English</option>
              <option value="both">Both</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Version</label>
            <select bind:value={sefariaVersion} class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="primary">Primary/Default</option>
              <option value="William_Davidson_Edition_-_Aramaic">William Davidson (Aramaic)</option>
              <option value="Wikisource_Talmud_Bavli">Wikisource Talmud Bavli</option>
              <option value="William Davidson Edition - English">William Davidson (English)</option>
            </select>
          </div>
          
          <label class="flex items-center gap-2">
            <input type="checkbox" bind:checked={includeCommentary} class="rounded border-gray-300" />
            <span class="text-sm text-gray-600">Include Rashi & Tosafot</span>
          </label>
          
          <button 
            on:click={fetchSefariaDirectly} 
            disabled={sefariaLoading}
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sefariaLoading ? 'Loading...' : 'Test Sefaria API'}
          </button>
        </div>
        
        {#if sefariaError}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 class="font-semibold text-red-800">Sefaria Error</h3>
            <p class="text-red-700">{sefariaError}</p>
          </div>
        {/if}
        
        {#if sefariaResults}
          <div class="mt-4">
            <h3 class="text-lg font-semibold mb-3">Sefaria API Results - {sefariaResults.ref}</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="bg-gray-50 rounded-lg p-4">
                <h4 class="font-semibold mb-2">Main Text</h4>
                {#if sefariaResults.main}
                  <p class="text-sm text-gray-600">Hebrew: {sefariaResults.main.he?.length || 0} segments | {sefariaResults.main.he ? sefariaResults.main.he.join(' ').length : 0} chars</p>
                  <p class="text-sm text-gray-600">English: {sefariaResults.main.text?.length || 0} segments | {sefariaResults.main.text ? sefariaResults.main.text.join(' ').length : 0} chars</p>
                  <div class="mt-2 p-2 bg-white rounded border border-gray-200 max-h-40 overflow-y-auto text-right" dir="rtl">
                    <p class="text-sm">{(sefariaResults.main.he || []).slice(0, 3).join(' ')}...</p>
                  </div>
                {:else}
                  <p class="text-gray-500">Not available</p>
                {/if}
              </div>
              
              {#if includeCommentary}
                <div class="bg-gray-50 rounded-lg p-4">
                  <h4 class="font-semibold mb-2">Rashi</h4>
                  {#if sefariaResults.rashi}
                    <p class="text-sm text-gray-600">Hebrew: {sefariaResults.rashi.he?.length || 0} segments | {sefariaResults.rashi.he ? sefariaResults.rashi.he.join(' ').length : 0} chars</p>
                    <div class="mt-2 p-2 bg-white rounded border border-gray-200 max-h-40 overflow-y-auto text-right" dir="rtl">
                      <p class="text-sm">{(sefariaResults.rashi.he || []).slice(0, 2).join(' ')}...</p>
                    </div>
                  {:else}
                    <p class="text-gray-500">Not available</p>
                  {/if}
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4">
                  <h4 class="font-semibold mb-2">Tosafot</h4>
                  {#if sefariaResults.tosafot}
                    <p class="text-sm text-gray-600">Hebrew: {sefariaResults.tosafot.he?.length || 0} segments | {sefariaResults.tosafot.he ? sefariaResults.tosafot.he.join(' ').length : 0} chars</p>
                    <div class="mt-2 p-2 bg-white rounded border border-gray-200 max-h-40 overflow-y-auto text-right" dir="rtl">
                      <p class="text-sm">{(sefariaResults.tosafot.he || []).slice(0, 2).join(' ')}...</p>
                    </div>
                  {:else}
                    <p class="text-gray-500">Not available</p>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  
  {#if results}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 class="text-2xl font-semibold mb-4">Results for {results.tractate} {results.dafDisplay}{results.amud}</h2>
      <p class="text-sm text-gray-600 mb-4"><strong>Method:</strong> {results.method}</p>
      
      <!-- View Toggle -->
      <div class="flex gap-4 mb-6">
        <button 
          on:click={() => { showDiffView = true; showRawMerged = false; }}
          class="px-4 py-2 rounded-md {showDiffView ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}"
        >
          Diff View
        </button>
        <button 
          on:click={() => { showDiffView = false; showRawMerged = true; }}
          class="px-4 py-2 rounded-md {showRawMerged ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}"
        >
          Merged Result
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
              <p>{results.mainText ? results.mainText.substring(0, 500) + '...' : 'No content'}</p>
            </div>
          </div>
          
          <div>
            <h4 class="text-lg font-semibold mb-2">Rashi (merged)</h4>
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right" dir="rtl">
              <p>{results.rashi ? results.rashi.substring(0, 300) + '...' : 'No content'}</p>
            </div>
          </div>
          
          <div>
            <h4 class="text-lg font-semibold mb-2">Tosafot (merged)</h4>
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-right" dir="rtl">
              <p>{results.tosafot ? results.tosafot.substring(0, 300) + '...' : 'No content'}</p>
            </div>
          </div>
        </div>
      {/if}
      
      <!-- Data Sources Summary -->
      <div class="mt-8 bg-gray-50 rounded-lg p-6">
        <h4 class="text-lg font-semibold mb-4">Data Source Summary</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h5 class="font-medium mb-2">Sefaria Data Available:</h5>
            <ul class="space-y-1 text-sm text-gray-600">
              <li>Main Text: {results.sources.sefaria.mainText?.length || 0} segments ({results.sources.sefaria.mainText ? results.sources.sefaria.mainText.join(' ').length : 0} chars)</li>
              <li>Rashi: {results.sources.sefaria.rashi?.length || 0} segments ({results.sources.sefaria.rashi ? results.sources.sefaria.rashi.join(' ').length : 0} chars)</li>
              <li>Tosafot: {results.sources.sefaria.tosafot?.length || 0} segments ({results.sources.sefaria.tosafot ? results.sources.sefaria.tosafot.join(' ').length : 0} chars)</li>
            </ul>
          </div>
          
          <div>
            <h5 class="font-medium mb-2">HebrewBooks Data:</h5>
            <ul class="space-y-1 text-sm text-gray-600">
              <li>Main Text: {results.sources.hebrewBooks.mainText ? `Available (${results.sources.hebrewBooks.mainText.length} chars)` : 'Not Available'}</li>
              <li>Rashi: {results.sources.hebrewBooks.rashi ? `Available (${results.sources.hebrewBooks.rashi.length} chars)` : 'Not Available'}</li>
              <li>Tosafot: {results.sources.hebrewBooks.tosafot ? `Available (${results.sources.hebrewBooks.tosafot.length} chars)` : 'Not Available'}</li>
            </ul>
          </div>
        </div>
      </div>
      
      <!-- Source Comparison Table -->
      {#if sefariaResults && results}
        <div class="mt-8">
          <h3 class="text-lg font-semibold mb-4">Source Comparison</h3>
          
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-gray-100">
                  <th class="border border-gray-300 px-4 py-2 text-left">Text Type</th>
                  <th class="border border-gray-300 px-4 py-2 text-center">Sefaria</th>
                  <th class="border border-gray-300 px-4 py-2 text-center">HebrewBooks</th>
                  <th class="border border-gray-300 px-4 py-2 text-center">Merged Result</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="border border-gray-300 px-4 py-2 font-medium">Main Text</td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {sefariaResults.main?.he?.length || 0} segments<br/>
                    <small class="text-gray-600">{sefariaResults.main?.he ? sefariaResults.main.he.join(' ').length : 0} chars</small>
                  </td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {results.sources.hebrewBooks.mainText ? '✓ Available' : '✗ Not Available'}<br/>
                    <small class="text-gray-600">{results.sources.hebrewBooks.mainText ? `${results.sources.hebrewBooks.mainText.length} chars` : '-'}</small>
                  </td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {results.mainText ? '✓ Merged' : '✗ Empty'}
                  </td>
                </tr>
                <tr>
                  <td class="border border-gray-300 px-4 py-2 font-medium">Rashi</td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {sefariaResults.rashi?.he?.length || 0} segments<br/>
                    <small class="text-gray-600">{sefariaResults.rashi?.he ? sefariaResults.rashi.he.join(' ').length : 0} chars</small>
                  </td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {results.sources.hebrewBooks.rashi ? '✓ Available' : '✗ Not Available'}<br/>
                    <small class="text-gray-600">{results.sources.hebrewBooks.rashi ? `${results.sources.hebrewBooks.rashi.length} chars` : '-'}</small>
                  </td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {results.rashi ? '✓ Merged' : '✗ Empty'}
                  </td>
                </tr>
                <tr>
                  <td class="border border-gray-300 px-4 py-2 font-medium">Tosafot</td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {sefariaResults.tosafot?.he?.length || 0} segments<br/>
                    <small class="text-gray-600">{sefariaResults.tosafot?.he ? sefariaResults.tosafot.he.join(' ').length : 0} chars</small>
                  </td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {results.sources.hebrewBooks.tosafot ? '✓ Available' : '✗ Not Available'}<br/>
                    <small class="text-gray-600">{results.sources.hebrewBooks.tosafot ? `${results.sources.hebrewBooks.tosafot.length} chars` : '-'}</small>
                  </td>
                  <td class="border border-gray-300 px-4 py-2 text-center">
                    {results.tosafot ? '✓ Merged' : '✗ Empty'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}
      
      <details class="mt-8 border border-gray-200 rounded-lg">
        <summary class="px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 rounded-t-lg">Raw Data (JSON)</summary>
        <pre class="p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto rounded-b-lg">{JSON.stringify(results, null, 2)}</pre>
      </details>
    </div>
  {/if}
  
  <!-- Debug Information -->
  {#if debugInfo.apiCalls.length > 0}
    <div class="mt-8 bg-gray-100 rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Debug Information</h2>
      
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
  {/if}
</div>