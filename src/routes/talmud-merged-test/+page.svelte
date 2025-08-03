<script>
  import { onMount } from 'svelte';
  
  let loading = false;
  let results = null;
  let error = null;
  let mesechta = '1';
  let daf = '2';
  
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
    const pageNum = Math.floor((dafNum + 1) / 2);
    const amud = dafNum % 2 === 0 ? 'a' : 'b';
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
          dafDisplay,
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

<div class="container">
  <h1>Talmud Merged API Test</h1>
  
  <div class="controls">
    <div class="basic-controls">
      <label>
        Mesechta: 
        <select bind:value={mesechta}>
          <option value="1">Berakhot</option>
          <option value="2">Shabbat</option>
          <option value="3">Eruvin</option>
          <option value="4">Pesachim</option>
          <option value="5">Shekalim</option>
          <option value="6">Yoma</option>
          <option value="7">Sukkah</option>
          <option value="8">Beitzah</option>
        </select>
      </label>
      
      <label>
        Daf: 
        <input type="text" bind:value={daf} placeholder="2" />
      </label>
      
      <button on:click={fetchMergedData} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch Merged Data'}
      </button>
    </div>
    
    <div class="options-section">
      <h3>Daf-Supplier Options</h3>
      <div class="option-checkboxes">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={useBrTags} />
          Use &lt;br&gt; tags (convert newlines to HTML breaks)
        </label>
        
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={bypassCache} />
          Bypass cache (fetch fresh data)
        </label>
        
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={debugMode} />
          Debug mode (extra logging)
        </label>
      </div>
    </div>
  </div>
  
  {#if error}
    <div class="error">
      <h2>Error</h2>
      <p>{error}</p>
    </div>
  {/if}
  
  <!-- Sefaria API Testing Section -->
  <div class="sefaria-section">
    <h2>Sefaria API Testing</h2>
    
    <button 
      class="toggle-button" 
      on:click={() => showSefariaTest = !showSefariaTest}
    >
      {showSefariaTest ? 'Hide' : 'Show'} Sefaria Direct API Test
    </button>
    
    {#if showSefariaTest}
      <div class="sefaria-controls">
        <div class="control-group">
          <label>
            Language:
            <select bind:value={sefariaLang}>
              <option value="he">Hebrew</option>
              <option value="en">English</option>
              <option value="both">Both</option>
            </select>
          </label>
          
          <label>
            Version:
            <select bind:value={sefariaVersion}>
              <option value="primary">Primary/Default</option>
              <option value="William_Davidson_Edition_-_Aramaic">William Davidson (Aramaic)</option>
              <option value="Wikisource_Talmud_Bavli">Wikisource Talmud Bavli</option>
              <option value="William Davidson Edition - English">William Davidson (English)</option>
            </select>
          </label>
          
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={includeCommentary} />
            Include Rashi & Tosafot
          </label>
          
          <button on:click={fetchSefariaDirectly} disabled={sefariaLoading}>
            {sefariaLoading ? 'Loading...' : 'Test Sefaria API'}
          </button>
        </div>
        
        {#if sefariaError}
          <div class="error">
            <h3>Sefaria Error</h3>
            <p>{sefariaError}</p>
          </div>
        {/if}
        
        {#if sefariaResults}
          <div class="sefaria-results">
            <h3>Sefaria API Results - {sefariaResults.ref}</h3>
            
            <div class="text-comparison">
              <div class="text-column">
                <h4>Main Text</h4>
                {#if sefariaResults.main}
                  <p>Hebrew: {sefariaResults.main.he?.length || 0} segments</p>
                  <p>English: {sefariaResults.main.text?.length || 0} segments</p>
                  <div class="hebrew-text">
                    {(sefariaResults.main.he || []).slice(0, 3).join(' ')}...
                  </div>
                {:else}
                  <p>Not available</p>
                {/if}
              </div>
              
              {#if includeCommentary}
                <div class="text-column">
                  <h4>Rashi</h4>
                  {#if sefariaResults.rashi}
                    <p>Hebrew: {sefariaResults.rashi.he?.length || 0} segments</p>
                    <div class="hebrew-text">
                      {(sefariaResults.rashi.he || []).slice(0, 2).join(' ')}...
                    </div>
                  {:else}
                    <p>Not available</p>
                  {/if}
                </div>
                
                <div class="text-column">
                  <h4>Tosafot</h4>
                  {#if sefariaResults.tosafot}
                    <p>Hebrew: {sefariaResults.tosafot.he?.length || 0} segments</p>
                    <div class="hebrew-text">
                      {(sefariaResults.tosafot.he || []).slice(0, 2).join(' ')}...
                    </div>
                  {:else}
                    <p>Not available</p>
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
    <div class="results">
      <h2>Results for {results.tractate} {results.dafDisplay}{results.amud}</h2>
      <p><strong>Method:</strong> {results.method}</p>
      <p><strong>Timestamp:</strong> {new Date(results.timestamp).toLocaleString()}</p>
      
      <!-- Section 1: Daf-Supplier (HebrewBooks) Data -->
      <div class="source-display-section">
        <h3>1. Daf-Supplier (HebrewBooks) Data</h3>
        <div class="source-grid">
          <div class="source-card">
            <h4>Main Text</h4>
            {#if results.sources.hebrewBooks.mainText}
              <div class="hebrew-text">
                {@html results.sources.hebrewBooks.mainText.substring(0, 400)}...
              </div>
              <p class="text-info">Length: {results.sources.hebrewBooks.mainText.length} characters</p>
            {:else}
              <p class="no-data">No data available</p>
            {/if}
          </div>
          
          <div class="source-card">
            <h4>Rashi</h4>
            {#if results.sources.hebrewBooks.rashi}
              <div class="hebrew-text">
                {@html results.sources.hebrewBooks.rashi.substring(0, 300)}...
              </div>
              <p class="text-info">Length: {results.sources.hebrewBooks.rashi.length} characters</p>
            {:else}
              <p class="no-data">No data available</p>
            {/if}
          </div>
          
          <div class="source-card">
            <h4>Tosafot</h4>
            {#if results.sources.hebrewBooks.tosafot}
              <div class="hebrew-text">
                {@html results.sources.hebrewBooks.tosafot.substring(0, 300)}...
              </div>
              <p class="text-info">Length: {results.sources.hebrewBooks.tosafot.length} characters</p>
            {:else}
              <p class="no-data">No data available</p>
            {/if}
          </div>
        </div>
      </div>
      
      <!-- Section 2: Sefaria API Data -->
      <div class="source-display-section">
        <h3>2. Sefaria API Data</h3>
        <div class="source-grid">
          <div class="source-card">
            <h4>Main Text</h4>
            {#if results.sources.sefaria.mainText?.length > 0}
              <div class="hebrew-text">
                {results.sources.sefaria.mainText.slice(0, 3).join(' ')}...
              </div>
              <p class="text-info">{results.sources.sefaria.mainText.length} segments</p>
            {:else}
              <p class="no-data">No data available</p>
            {/if}
          </div>
          
          <div class="source-card">
            <h4>Rashi</h4>
            {#if results.sources.sefaria.rashi?.length > 0}
              <div class="hebrew-text">
                {results.sources.sefaria.rashi.slice(0, 2).join(' ')}...
              </div>
              <p class="text-info">{results.sources.sefaria.rashi.length} segments</p>
            {:else}
              <p class="no-data">No data available</p>
            {/if}
          </div>
          
          <div class="source-card">
            <h4>Tosafot</h4>
            {#if results.sources.sefaria.tosafot?.length > 0}
              <div class="hebrew-text">
                {results.sources.sefaria.tosafot.slice(0, 2).join(' ')}...
              </div>
              <p class="text-info">{results.sources.sefaria.tosafot.length} segments</p>
            {:else}
              <p class="no-data">No data available</p>
            {/if}
          </div>
        </div>
      </div>
      
      <!-- Section 3: Merged Result -->
      <div class="merged-section">
        <h3>3. Merged Result (Using Diff Algorithm)</h3>
        <div class="analysis">
          <h4>Data Source Summary</h4>
          <div class="sources">
            <div class="source-section">
              <h5>Sefaria Data Available:</h5>
              <ul>
                <li>Main Text: {results.sources.sefaria.mainText?.length || 0} segments</li>
                <li>Rashi: {results.sources.sefaria.rashi?.length || 0} segments</li>
                <li>Tosafot: {results.sources.sefaria.tosafot?.length || 0} segments</li>
              </ul>
            </div>
            
            <div class="source-section">
              <h5>HebrewBooks Data:</h5>
              <ul>
                <li>Main Text: {results.sources.hebrewBooks.mainText ? 'Available' : 'Not Available'}</li>
                <li>Rashi: {results.sources.hebrewBooks.rashi ? 'Available' : 'Not Available'}</li>
                <li>Tosafot: {results.sources.hebrewBooks.tosafot ? 'Available' : 'Not Available'}</li>
              </ul>
            </div>
          </div>
        </div>
      
        <div class="content-preview">
          <h4>Final Merged Content</h4>
        
        <div class="text-section">
          <h4>Main Text (first 500 chars)</h4>
          <div class="hebrew-text">
            {results.mainText ? results.mainText.substring(0, 500) + '...' : 'No content'}
          </div>
        </div>
        
        <div class="text-section">
          <h4>Rashi (first 300 chars)</h4>
          <div class="hebrew-text">
            {results.rashi ? results.rashi.substring(0, 300) + '...' : 'No content'}
          </div>
        </div>
        
        <div class="text-section">
          <h4>Tosafot (first 300 chars)</h4>
          <div class="hebrew-text">
            {results.tosafot ? results.tosafot.substring(0, 300) + '...' : 'No content'}
          </div>
        </div>
      </div>
      
      <!-- Source Comparison View -->
      {#if sefariaResults && results}
        <div class="comparison-section">
          <h3>Source Comparison</h3>
          
          <div class="comparison-grid">
            <div class="comparison-column">
              <h4>Text Type</h4>
              <div class="comparison-row header">Main Text</div>
              <div class="comparison-row header">Rashi</div>
              <div class="comparison-row header">Tosafot</div>
            </div>
            
            <div class="comparison-column">
              <h4>Sefaria</h4>
              <div class="comparison-row">
                {sefariaResults.main?.he?.length || 0} segments
              </div>
              <div class="comparison-row">
                {sefariaResults.rashi?.he?.length || 0} segments
              </div>
              <div class="comparison-row">
                {sefariaResults.tosafot?.he?.length || 0} segments
              </div>
            </div>
            
            <div class="comparison-column">
              <h4>HebrewBooks</h4>
              <div class="comparison-row">
                {results.sources.hebrewBooks.mainText ? '✓ Available' : '✗ Not Available'}
              </div>
              <div class="comparison-row">
                {results.sources.hebrewBooks.rashi ? '✓ Available' : '✗ Not Available'}
              </div>
              <div class="comparison-row">
                {results.sources.hebrewBooks.tosafot ? '✓ Available' : '✗ Not Available'}
              </div>
            </div>
            
            <div class="comparison-column">
              <h4>Merged Result</h4>
              <div class="comparison-row">
                {results.mainText ? '✓ Merged' : '✗ Empty'}
              </div>
              <div class="comparison-row">
                {results.rashi ? '✓ Merged' : '✗ Empty'}
              </div>
              <div class="comparison-row">
                {results.tosafot ? '✓ Merged' : '✗ Empty'}
              </div>
            </div>
          </div>
        </div>
      {/if}
      
      <details class="raw-data">
        <summary>Raw Data (JSON)</summary>
        <pre>{JSON.stringify(results, null, 2)}</pre>
      </details>
    </div>
  {/if}
  
  <!-- Debug Information -->
  {#if debugInfo.apiCalls.length > 0}
    <div class="debug-section">
      <h2>Debug Information</h2>
      
      <div class="debug-timings">
        <h3>Response Times</h3>
        <ul>
          {#each Object.entries(debugInfo.timings) as [key, time]}
            <li>{key}: {time}ms</li>
          {/each}
        </ul>
      </div>
      
      <div class="debug-calls">
        <h3>API Calls Made</h3>
        <ul class="api-calls-list">
          {#each debugInfo.apiCalls as call}
            <li>
              <strong>{call.type}:</strong>
              <code>{call.url}</code>
              <span class="timestamp">{call.timestamp}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
  
  <!-- Quick Reference Documentation -->
  <div class="reference-section">
    <h2>Quick Reference</h2>
    
    <details class="reference-details">
      <summary>Sefaria API Endpoints</summary>
      <div class="reference-content">
        <h4>Text Retrieval</h4>
        <ul>
          <li><code>GET /api/v3/texts/{'<tref>'}</code> - Latest text API</li>
          <li><code>GET /api/texts/{'<tref>'}</code> - Legacy API with version params</li>
          <li><code>GET /api/related/{'<tref>'}</code> - Get related texts/commentaries</li>
        </ul>
        
        <h4>Common Version Parameters</h4>
        <ul>
          <li><code>?vhe=William_Davidson_Edition_-_Aramaic</code> - Hebrew version</li>
          <li><code>?ven=William Davidson Edition - English</code> - English version</li>
        </ul>
        
        <h4>Text References (tref)</h4>
        <ul>
          <li>Format: <code>{'<Tractate>.<Daf><Amud>'}</code></li>
          <li>Example: <code>Berakhot.2a</code>, <code>Shabbat.31b</code></li>
          <li>Multi-word: <code>Bava_Metzia.85a</code> (use underscore)</li>
        </ul>
      </div>
    </details>
    
    <details class="reference-details">
      <summary>Tractate Name Mappings</summary>
      <div class="reference-content">
        <div class="mapping-grid">
          <div><strong>1:</strong> Berakhot</div>
          <div><strong>2:</strong> Shabbat</div>
          <div><strong>3:</strong> Eruvin</div>
          <div><strong>4:</strong> Pesachim</div>
          <div><strong>5:</strong> Shekalim</div>
          <div><strong>6:</strong> Yoma</div>
          <div><strong>7:</strong> Sukkah</div>
          <div><strong>8:</strong> Beitzah</div>
          <div><strong>9:</strong> Rosh Hashanah</div>
          <div><strong>10:</strong> Taanit</div>
          <div><strong>11:</strong> Megillah</div>
          <div><strong>12:</strong> Moed Katan</div>
        </div>
        <p class="reference-note">Full list in <code>/docs/Sefaria.md</code></p>
      </div>
    </details>
    
    <details class="reference-details">
      <summary>Daf-Supplier Options</summary>
      <div class="reference-content">
        <ul>
          <li><code>br=true</code> - Convert newlines to {'<br>'} tags</li>
          <li><code>nocache=true</code> - Bypass cache for fresh data</li>
          <li><code>debug=true</code> - Enable debug logging</li>
          <li><code>format=json</code> - Response format (default: json)</li>
        </ul>
      </div>
    </details>
  </div>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: system-ui, sans-serif;
  }
  
  .controls {
    margin-bottom: 20px;
    padding: 20px;
    background: #f5f5f5;
    border-radius: 8px;
  }
  
  .basic-controls {
    display: flex;
    gap: 15px;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .options-section {
    border-top: 1px solid #ddd;
    padding-top: 15px;
  }
  
  .options-section h3 {
    margin: 0 0 10px 0;
    color: #333;
    font-size: 16px;
  }
  
  .option-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #555;
  }
  
  .checkbox-label input[type="checkbox"] {
    margin: 0;
  }
  
  .controls label {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  
  .controls select, .controls input {
    padding: 5px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  .controls button {
    padding: 8px 16px;
    background: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .controls button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .error {
    background: #ffe6e6;
    border: 1px solid #ffcccc;
    padding: 15px;
    border-radius: 8px;
    color: #cc0000;
  }
  
  .results {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 20px;
  }
  
  .analysis {
    margin: 20px 0;
    padding: 15px;
    background: #f9f9f9;
    border-radius: 8px;
  }
  
  .sources {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  
  .source-section h4 {
    margin: 0 0 10px 0;
    color: #333;
  }
  
  .source-section ul {
    margin: 0;
    padding-left: 20px;
  }
  
  .content-preview {
    margin: 20px 0;
  }
  
  .text-section {
    margin: 15px 0;
    padding: 15px;
    background: #fafafa;
    border-radius: 8px;
  }
  
  .text-section h4 {
    margin: 0 0 10px 0;
    color: #555;
  }
  
  .hebrew-text {
    font-family: 'Times New Roman', serif;
    font-size: 14px;
    line-height: 1.6;
    direction: rtl;
    text-align: right;
    background: white;
    padding: 10px;
    border: 1px solid #eee;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .raw-data {
    margin-top: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  
  .raw-data summary {
    padding: 10px;
    background: #f5f5f5;
    cursor: pointer;
    border-radius: 8px 8px 0 0;
  }
  
  .raw-data pre {
    margin: 0;
    padding: 15px;
    background: #f8f8f8;
    font-size: 12px;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }
  
  h1 {
    color: #333;
    margin-bottom: 20px;
  }
  
  h2 {
    color: #555;
    margin: 20px 0 10px 0;
  }
  
  h3 {
    color: #666;
    margin: 15px 0 10px 0;
  }
  
  /* Source Display Sections */
  .source-display-section {
    margin: 30px 0;
    padding: 20px;
    background: #f9f9f9;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }
  
  .source-display-section h3 {
    color: #333;
    margin-bottom: 20px;
    font-size: 20px;
  }
  
  .source-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
  }
  
  .source-card {
    background: white;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #ddd;
  }
  
  .source-card h4 {
    margin: 0 0 10px 0;
    color: #444;
    border-bottom: 2px solid #007acc;
    padding-bottom: 5px;
  }
  
  .text-info {
    margin-top: 10px;
    font-size: 12px;
    color: #666;
  }
  
  .no-data {
    color: #999;
    font-style: italic;
  }
  
  .merged-section {
    margin-top: 30px;
    padding: 20px;
    background: #fff;
    border-radius: 8px;
    border: 2px solid #007acc;
  }
  
  .merged-section h3 {
    color: #007acc;
    margin-bottom: 20px;
  }
  
  /* Sefaria Testing Section */
  .sefaria-section {
    margin: 30px 0;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }
  
  .toggle-button {
    padding: 10px 20px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 15px;
  }
  
  .toggle-button:hover {
    background: #218838;
  }
  
  .sefaria-controls {
    margin-top: 15px;
  }
  
  .control-group {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 15px;
  }
  
  .sefaria-results {
    margin-top: 20px;
    padding: 15px;
    background: white;
    border-radius: 8px;
    border: 1px solid #ddd;
  }
  
  .text-comparison {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 15px;
  }
  
  .text-column {
    padding: 15px;
    background: #fafafa;
    border-radius: 8px;
    border: 1px solid #eee;
  }
  
  .text-column h4 {
    margin: 0 0 10px 0;
    color: #333;
    border-bottom: 1px solid #ddd;
    padding-bottom: 5px;
  }
  
  /* Debug Section */
  .debug-section {
    margin-top: 30px;
    padding: 20px;
    background: #f0f0f0;
    border-radius: 8px;
    border: 1px solid #ccc;
  }
  
  .debug-section h2 {
    color: #444;
    margin-bottom: 15px;
  }
  
  .debug-timings, .debug-calls {
    margin: 15px 0;
    padding: 15px;
    background: white;
    border-radius: 6px;
  }
  
  .debug-timings h3, .debug-calls h3 {
    margin: 0 0 10px 0;
    color: #555;
  }
  
  .api-calls-list {
    list-style: none;
    padding: 0;
  }
  
  .api-calls-list li {
    margin: 8px 0;
    padding: 8px;
    background: #f8f8f8;
    border-left: 3px solid #007acc;
    font-size: 13px;
  }
  
  .api-calls-list code {
    display: block;
    margin: 5px 0;
    padding: 5px;
    background: #e8e8e8;
    border-radius: 3px;
    font-size: 12px;
    overflow-x: auto;
  }
  
  .timestamp {
    display: block;
    color: #666;
    font-size: 11px;
    margin-top: 3px;
  }
  
  /* Comparison Section */
  .comparison-section {
    margin-top: 30px;
    padding: 20px;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #ddd;
  }
  
  .comparison-grid {
    display: grid;
    grid-template-columns: 150px repeat(3, 1fr);
    gap: 0;
    margin-top: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .comparison-column {
    background: #f8f8f8;
  }
  
  .comparison-column:first-child {
    background: #f0f0f0;
  }
  
  .comparison-column h4 {
    margin: 0;
    padding: 10px;
    background: #333;
    color: white;
    font-size: 14px;
    text-align: center;
    border-bottom: 2px solid #ddd;
  }
  
  .comparison-column:first-child h4 {
    background: #555;
  }
  
  .comparison-row {
    padding: 12px;
    border-bottom: 1px solid #ddd;
    font-size: 13px;
    text-align: center;
  }
  
  .comparison-row.header {
    font-weight: bold;
    background: #e8e8e8;
    text-align: left;
  }
  
  .comparison-row:last-child {
    border-bottom: none;
  }
  
  /* Reference Section */
  .reference-section {
    margin-top: 30px;
    padding: 20px;
    background: #f5f5f5;
    border-radius: 8px;
    border: 1px solid #ddd;
  }
  
  .reference-section h2 {
    color: #333;
    margin-bottom: 15px;
  }
  
  .reference-details {
    margin: 10px 0;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
  }
  
  .reference-details summary {
    padding: 12px 15px;
    background: #f8f8f8;
    cursor: pointer;
    font-weight: 500;
    border-radius: 6px 6px 0 0;
  }
  
  .reference-details[open] summary {
    border-bottom: 1px solid #ddd;
  }
  
  .reference-content {
    padding: 15px;
  }
  
  .reference-content h4 {
    margin: 0 0 10px 0;
    color: #444;
    font-size: 14px;
  }
  
  .reference-content ul {
    margin: 0 0 15px 0;
    padding-left: 20px;
  }
  
  .reference-content li {
    margin: 5px 0;
    font-size: 13px;
  }
  
  .reference-content code {
    background: #e8e8e8;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
  }
  
  .mapping-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }
  
  .mapping-grid div {
    padding: 5px 10px;
    background: #f8f8f8;
    border-radius: 4px;
    font-size: 13px;
  }
  
  .reference-note {
    font-size: 12px;
    color: #666;
    margin-top: 10px;
    font-style: italic;
  }
</style>