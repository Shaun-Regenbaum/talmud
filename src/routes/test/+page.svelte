<script lang="ts">
  import { onMount } from 'svelte';
  
  let loading = false;
  let response: any = null;
  let error = '';
  let rawHtml = '';
  let mesechta = '27'; // Default to Avodah Zarah
  let daf = '44'; // Default page
  
  async function fetchDafData() {
    loading = true;
    error = '';
    response = null;
    rawHtml = '';
    
    try {
      // First get the JSON response
      const jsonUrl = `https://daf-supplier.402.workers.dev?mesechta=${mesechta}&daf=${daf}&nocache=true`;
      console.log('Fetching JSON from:', jsonUrl);
      
      const jsonResponse = await fetch(jsonUrl);
      const jsonData = await jsonResponse.json();
      response = jsonData;
      
      // Now get the raw HTML directly from HebrewBooks
      const htmlUrl = `https://www.hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;
      console.log('Fetching HTML from:', htmlUrl);
      
      try {
        // Use a proxy or direct fetch - let's try direct first
        const htmlResponse = await fetch(htmlUrl, {
          mode: 'no-cors'  // This might not give us the response text, but let's try
        });
        
        if (htmlResponse.ok) {
          rawHtml = await htmlResponse.text();
        } else {
          // Fallback: get the HTML that our worker would see
          console.log('Direct fetch failed, trying via our own API...');
          const proxyResponse = await fetch(`/api/hebrewbooks-raw?mesechta=${mesechta}&daf=${daf}`);
          if (proxyResponse.ok) {
            const proxyData = await proxyResponse.json();
            rawHtml = proxyData.html || 'No HTML returned from proxy';
          } else {
            rawHtml = `Failed to fetch HTML via proxy: ${proxyResponse.status}`;
          }
        }
      } catch (fetchError) {
        console.log('HTML fetch failed, trying via our own API...');
        try {
          const proxyResponse = await fetch(`/api/hebrewbooks-raw?mesechta=${mesechta}&daf=${daf}`);
          if (proxyResponse.ok) {
            const proxyData = await proxyResponse.json();
            rawHtml = proxyData.html || 'No HTML returned from proxy';
          } else {
            rawHtml = `Failed to fetch HTML: ${fetchError.message}`;
          }
        } catch (proxyError) {
          rawHtml = `All HTML fetch methods failed: ${fetchError.message}, ${proxyError.message}`;
        }
      }
      
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error:', err);
    } finally {
      loading = false;
    }
  }
  
  onMount(() => {
    fetchDafData();
  });
</script>

<div class="p-6 max-w-6xl mx-auto">
  <h1 class="text-3xl font-bold mb-6">Daf Supplier Test Page</h1>
  
  <div class="mb-6 flex gap-4 items-end">
    <div>
      <label for="mesechta" class="block text-sm font-medium mb-1">Mesechta ID:</label>
      <input 
        id="mesechta"
        bind:value={mesechta} 
        type="number" 
        class="border rounded px-3 py-2 w-20"
        min="1" 
        max="37"
      />
    </div>
    <div>
      <label for="daf" class="block text-sm font-medium mb-1">Daf:</label>
      <input 
        id="daf"
        bind:value={daf} 
        type="text" 
        class="border rounded px-3 py-2 w-20"
        placeholder="44"
      />
    </div>
    <button 
      on:click={fetchDafData}
      disabled={loading}
      class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
    >
      {loading ? 'Loading...' : 'Fetch Data'}
    </button>
  </div>
  
  {#if error}
    <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
      <strong>Error:</strong> {error}
    </div>
  {/if}
  
  {#if response}
    <div class="space-y-6">
      <!-- JSON Response Summary -->
      <div class="bg-gray-50 p-4 rounded">
        <h2 class="text-xl font-semibold mb-3">Daf Supplier Response Summary</h2>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div><strong>Tractate:</strong> {response.tractate}</div>
          <div><strong>Daf:</strong> {response.dafDisplay}{response.amud}</div>
          <div><strong>Cache:</strong> {response.debug?.extractionMethod || 'unknown'}</div>
          <div><strong>Browser Available:</strong> {response.debug?.browserAvailable ? 'Yes' : 'No'}</div>
          <div><strong>Main Text Length:</strong> {response.mainText?.length || 0} chars</div>
          <div><strong>Rashi Length:</strong> {response.rashi?.length || 0} chars</div>
          <div><strong>Tosafot Length:</strong> {response.tosafot?.length || 0} chars</div>
          <div><strong>Timestamp:</strong> {new Date(response.timestamp).toLocaleString()}</div>
        </div>
      </div>
      
      <!-- Extracted Text Content -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-blue-50 p-4 rounded">
          <h3 class="font-semibold mb-2">Main Text (Gemara) - {response.mainText?.length || 0} chars</h3>
          <div class="text-sm bg-white p-3 rounded border max-h-60 overflow-y-auto" style="direction: rtl;">
            {response.mainText || 'No content'}
          </div>
        </div>
        
        <div class="bg-green-50 p-4 rounded">
          <h3 class="font-semibold mb-2">Rashi - {response.rashi?.length || 0} chars</h3>
          <div class="text-sm bg-white p-3 rounded border max-h-60 overflow-y-auto" style="direction: rtl;">
            {response.rashi || 'No content'}
          </div>
        </div>
        
        <div class="bg-yellow-50 p-4 rounded">
          <h3 class="font-semibold mb-2">Tosafot - {response.tosafot?.length || 0} chars</h3>
          <div class="text-sm bg-white p-3 rounded border max-h-60 overflow-y-auto" style="direction: rtl;">
            {response.tosafot || 'No content'}
          </div>
        </div>
      </div>
      
      <!-- Full JSON Response -->
      <details class="bg-gray-50 p-4 rounded">
        <summary class="font-semibold cursor-pointer">Full JSON Response</summary>
        <pre class="mt-3 text-xs bg-white p-3 rounded border overflow-x-auto">{JSON.stringify(response, null, 2)}</pre>
      </details>
      
      <!-- Raw HTML Response -->
      <details class="bg-gray-50 p-4 rounded">
        <summary class="font-semibold cursor-pointer">Raw HTML from HebrewBooks.org</summary>
        <div class="mt-3">
          <p class="text-sm text-gray-600 mb-2">HTML Length: {rawHtml.length} characters</p>
          
          <!-- Search for shastext elements and other structures in HTML -->
          <div class="mb-4 p-3 bg-blue-50 rounded">
            <h4 class="font-medium mb-2">HTML Structure Analysis:</h4>
            <div class="text-sm space-y-1 grid grid-cols-2 gap-4">
              <div>
                <strong>Shastext Elements:</strong>
                <div>shastext2: {rawHtml.includes('shastext2') ? '✅ Found' : '❌ Not found'}</div>
                <div>shastext3: {rawHtml.includes('shastext3') ? '✅ Found' : '❌ Not found'}</div>
                <div>shastext4: {rawHtml.includes('shastext4') ? '✅ Found' : '❌ Not found'}</div>
                <div>class="shastext: {(rawHtml.match(/class="shastext/g) || []).length} occurrences</div>
              </div>
              <div>
                <strong>Other Elements:</strong>
                <div>fieldset: {(rawHtml.match(/<fieldset/g) || []).length} found</div>
                <div>iframe: {(rawHtml.match(/<iframe/g) || []).length} found</div>
                <div>div: {(rawHtml.match(/<div/g) || []).length} found</div>
                <div>Hebrew text: {rawHtml.match(/[\u0590-\u05FF]/) ? '✅ Found' : '❌ Not found'}</div>
              </div>
            </div>
            
            <!-- Show first few shastext class occurrences -->
            {#if rawHtml.includes('shastext')}
              <details class="mt-3">
                <summary class="font-medium cursor-pointer">Shastext Occurrences (first 10)</summary>
                <pre class="mt-2 text-xs bg-white p-2 rounded border max-h-40 overflow-auto">{
                  [...rawHtml.matchAll(/class="shastext[^"]*"/g)]
                    .slice(0, 10)
                    .map(match => match[0])
                    .join('\n')
                }</pre>
              </details>
            {/if}
          </div>
          
          <pre class="text-xs bg-white p-3 rounded border max-h-96 overflow-auto">{rawHtml}</pre>
        </div>
      </details>
    </div>
  {/if}
</div>

<style>
  /* Ensure Hebrew text displays properly */
  [style*="direction: rtl"] {
    font-family: 'Tahoma', 'Arial Hebrew', 'David', sans-serif;
    line-height: 1.6;
  }
</style>