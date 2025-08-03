<script>
  import { onMount } from 'svelte';
  import dafRenderer from '$lib/daf-renderer/renderer';
  
  let container;
  let renderer;
  let loading = false;
  let error = null;
  let fetchingText = false;
  
  // Test configuration
  let fontSize = {
    main: 20,
    inner: 13.5,
    outer: 13.5
  };
  
  // Layout configuration
  let contentWidth = 650;
  let mainWidth = 55; // percentage
  let padding = {
    horizontal: 12,
    vertical: 8
  };
  
  // Font configuration
  let fontFamily = {
    main: "Vilna",
    inner: "Rashi", 
    outer: "Vilna"
  };
  
  let detectOverlaps = true;
  let autoResolveOverlaps = true;
  let showDebugInfo = true;
  let showOverlapIndicators = true;
  
  // Sample texts with line breaks
  let mainText = `גמרא line 1<br>גמרא line 2 עם טקסט ארוך יותר<br>גמרא line 3<br>גמרא line 4 קצר<br>גמרא line 5 עם עוד טקסט`;
  let rashiText = `רש״י commentary 1<br>רש״י commentary 2 עם הסבר מפורט<br>רש״י commentary 3`;
  let tosafotText = `תוספות commentary line 1<br>תוספות line 2<br>תוספות line 3 עם הרחבה<br>תוספות line 4`;
  
  let spacerInfo = null;
  let overlapInfo = null;
  let renderTime = 0;
  
  // Daf-supplier configuration
  let mesechta = '27'; // Nedarim
  let daf = '46';
  
  
  // Real Talmud examples from HebrewBooks
  const realExamples = {
    stairs: { mesechta: '27', daf: '46', name: 'Nedarim 46 (Stairs)' },
    doubleWrap: { mesechta: '27', daf: '76', name: 'Nedarim 76 (Double Wrap)' },
    doubleExtend: { mesechta: '27', daf: '8', name: 'Nedarim 8b (Double Extend)' }
  };
  
  async function fetchFromDafSupplier() {
    fetchingText = true;
    error = null;
    
    try {
      // Use the talmud-merged API which combines HebrewBooks and Sefaria
      const response = await fetch(`/api/talmud-merged?mesechta=${mesechta}&daf=${daf}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // The API returns mainText, rashi, tosafot
      mainText = data.mainText || '';
      rashiText = data.rashi || '';
      tosafotText = data.tosafot || '';
      
      // Convert to line breaks if they don't already have them
      if (mainText && !mainText.includes('<br>')) {
        mainText = mainText.split('\n').join('<br>');
      }
      if (rashiText && !rashiText.includes('<br>')) {
        rashiText = rashiText.split('\n').join('<br>');
      }
      if (tosafotText && !tosafotText.includes('<br>')) {
        tosafotText = tosafotText.split('\n').join('<br>');
      }
      
      console.log('Fetched texts:', {
        main: mainText.substring(0, 100) + '...',
        rashi: rashiText.substring(0, 100) + '...',
        tosafot: tosafotText.substring(0, 100) + '...'
      });
      
      fetchingText = false;
      renderDaf();
    } catch (e) {
      error = e.message;
      fetchingText = false;
    }
  }
  
  function loadRealExample(example) {
    mesechta = example.mesechta;
    daf = example.daf;
    fetchFromDafSupplier();
  }
  
  
  async function renderDaf() {
    loading = true;
    error = null;
    spacerInfo = null;
    overlapInfo = null;
    
    const startTime = performance.now();
    
    try {
      const options = {
        contentWidth: contentWidth + "px",
        mainWidth: mainWidth + "%",
        fontFamily: fontFamily,
        fontSize: {
          main: fontSize.main + "px",
          side: fontSize.inner + "px"
        },
        lineHeight: {
          main: Math.round(fontSize.main * 1.4) + "px",
          side: Math.round(fontSize.inner * 1.4) + "px"
        },
        padding: {
          horizontal: padding.horizontal + "px",
          vertical: padding.vertical + "px"
        },
        detectOverlaps: detectOverlaps,
        autoResolveOverlaps: autoResolveOverlaps
      };
      
      // Clear container for fresh render
      container.innerHTML = '';
      
      // Create new renderer instance
      renderer = dafRenderer(container, options);
      
      // Debug: log what we're rendering
      console.log('Rendering with texts:', {
        main: mainText.substring(0, 50) + '...',
        rashi: rashiText.substring(0, 50) + '...',
        tosafot: tosafotText.substring(0, 50) + '...'
      });
      
      renderer.render(
        mainText,
        rashiText,
        tosafotText,
        "a",
        "br", // Use line break mode
        () => {
          renderTime = performance.now() - startTime;
          console.log('Render complete in', renderTime, 'ms');
          
          // Get the dafRoot element
          const dafRoot = container.querySelector('.dafRoot');
          if (dafRoot) {
            const computedStyle = window.getComputedStyle(dafRoot);
            spacerInfo = {
              start: computedStyle.getPropertyValue('--spacerHeights-start'),
              inner: computedStyle.getPropertyValue('--spacerHeights-inner'),
              outer: computedStyle.getPropertyValue('--spacerHeights-outer'),
              end: computedStyle.getPropertyValue('--spacerHeights-end')
            };
          }
          
          // Check for overlap indicators
          if (showOverlapIndicators && renderer.spacerHeights?.overlaps) {
            overlapInfo = renderer.spacerHeights.overlaps;
            visualizeOverlaps(renderer.spacerHeights.overlaps);
          }
          
          loading = false;
        },
        () => {} // onResized callback
      );
      
    } catch (e) {
      console.error('Render error:', e);
      error = e.message || e.toString();
      loading = false;
    }
  }
  
  function visualizeOverlaps(overlaps) {
    if (!overlaps || overlaps.length === 0) return;
    
    // Remove existing overlap indicators
    container.querySelectorAll('.overlap-indicator').forEach(el => el.remove());
    
    overlaps.forEach(({ type, line, overlap, mainPos, innerPos, outerPos }) => {
      const indicator = document.createElement('div');
      indicator.className = 'overlap-indicator';
      indicator.style.cssText = `
        position: absolute;
        background: rgba(255, 0, 0, 0.3);
        border: 2px solid red;
        height: ${overlap}px;
        width: 100%;
        z-index: 9999;
        pointer-events: none;
        top: ${type.includes('inner') ? innerPos : outerPos}px;
      `;
      
      const label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        background: red;
        color: white;
        padding: 2px 5px;
        font-size: 10px;
        top: 0;
        left: 0;
      `;
      label.textContent = `${type} overlap: ${overlap.toFixed(1)}px (line ${line})`;
      indicator.appendChild(label);
      
      container.appendChild(indicator);
    });
  }
  
  onMount(() => {
    renderDaf();
  });
  
  // Re-render when settings change
  $: if (container) {
    renderDaf();
  }
</script>

<style>
  @import '$lib/assets/fonts.css';
  
  .test-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }
  
  .controls {
    background: #f5f5f5;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 30px;
  }
  
  .control-group {
    margin-bottom: 15px;
  }
  
  .control-group > label {
    display: block;
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .control-row {
    display: flex;
    gap: 20px;
    align-items: center;
    margin-bottom: 10px;
  }
  
  .slider-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  input[type="range"] {
    width: 200px;
  }
  
  .checkbox-group {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }
  
  .real-examples {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  
  .daf-input {
    display: flex;
    gap: 15px;
    align-items: center;
  }
  
  .daf-input label {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  
  .daf-input input {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  select {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
  }
  
  .control-row label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: normal;
  }
  
  button {
    padding: 8px 16px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  button:hover {
    background: #0056b3;
  }
  
  .text-inputs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  
  textarea {
    width: 100%;
    height: 100px;
    font-family: monospace;
    font-size: 12px;
  }
  
  .render-container {
    border: 2px solid #ddd;
    border-radius: 8px;
    padding: 20px;
    background: white;
    position: relative;
    min-height: 400px;
  }
  
  /* Ensure daf-renderer content is visible */
  .render-container :global(.dafRoot) {
    position: relative;
    margin: 0 auto;
  }
  
  .render-container :global(.text) {
    pointer-events: auto !important;
    color: black;
  }
  
  .render-container :global(.main .text) {
    font-size: var(--fontSize-main);
  }
  
  .render-container :global(.inner .text),
  .render-container :global(.outer .text) {
    font-size: var(--fontSize-side);
  }
  
  .debug-info {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 15px;
    margin-top: 20px;
    font-family: monospace;
    font-size: 12px;
  }
  
  .debug-row {
    margin-bottom: 5px;
  }
  
  .error {
    background: #fee;
    color: #c00;
    padding: 10px;
    border-radius: 4px;
    margin-top: 10px;
  }
  
  .loading {
    text-align: center;
    padding: 40px;
    color: #666;
  }
  
  :global(.overlap-indicator) {
    box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
  }
  
  h1 {
    margin-bottom: 10px;
  }
  
  .subtitle {
    color: #666;
    margin-bottom: 30px;
  }
</style>

<div class="test-container">
  <h1>Daf Renderer Test Page</h1>
  <p class="subtitle">Test font-aware spacing, overlap detection, and modern CSS improvements</p>
  
  <div class="controls">
    <div class="control-group">
      <label>Layout Configuration</label>
      <div class="control-row">
        <div class="slider-group">
          <span>Content Width: {contentWidth}px</span>
          <input type="range" bind:value={contentWidth} min="400" max="1200" step="10">
        </div>
        <div class="slider-group">
          <span>Main Width: {mainWidth}%</span>
          <input type="range" bind:value={mainWidth} min="40" max="70" step="1">
        </div>
      </div>
      <div class="control-row">
        <div class="slider-group">
          <span>H-Padding: {padding.horizontal}px</span>
          <input type="range" bind:value={padding.horizontal} min="0" max="30" step="1">
        </div>
        <div class="slider-group">
          <span>V-Padding: {padding.vertical}px</span>
          <input type="range" bind:value={padding.vertical} min="0" max="20" step="1">
        </div>
      </div>
    </div>
    
    <div class="control-group">
      <label>Font Configuration</label>
      <div class="control-row">
        <div class="slider-group">
          <span>Main: {fontSize.main}px</span>
          <input type="range" bind:value={fontSize.main} min="12" max="30" step="1">
        </div>
        <div class="slider-group">
          <span>Commentaries: {fontSize.inner}px</span>
          <input type="range" bind:value={fontSize.inner} min="10" max="20" step="0.5">
        </div>
      </div>
      <div class="control-row">
        <label>
          Main Font:
          <select bind:value={fontFamily.main}>
            <option value="Vilna">Vilna</option>
            <option value="Rashi">Rashi</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
        </label>
        <label>
          Inner Font:
          <select bind:value={fontFamily.inner}>
            <option value="Rashi">Rashi</option>
            <option value="Vilna">Vilna</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
        </label>
        <label>
          Outer Font:
          <select bind:value={fontFamily.outer}>
            <option value="Vilna">Vilna</option>
            <option value="Rashi">Rashi</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
        </label>
      </div>
    </div>
    
    <div class="control-group">
      <label>Debug Options</label>
      <div class="checkbox-group">
        <label>
          <input type="checkbox" bind:checked={detectOverlaps}>
          Detect Overlaps
        </label>
        <label>
          <input type="checkbox" bind:checked={autoResolveOverlaps}>
          Auto-resolve Overlaps
        </label>
        <label>
          <input type="checkbox" bind:checked={showDebugInfo}>
          Show Debug Info
        </label>
        <label>
          <input type="checkbox" bind:checked={showOverlapIndicators}>
          Show Overlap Indicators
        </label>
      </div>
    </div>
    
    <div class="control-group">
      <label>Real Talmud Examples (from HebrewBooks)</label>
      <div class="real-examples">
        {#each Object.entries(realExamples) as [key, example]}
          <button on:click={() => loadRealExample(example)}>{example.name}</button>
        {/each}
      </div>
      <div class="daf-input" style="margin-top: 10px;">
        <label>
          Mesechta: 
          <input type="text" bind:value={mesechta} style="width: 50px;">
        </label>
        <label>
          Daf: 
          <input type="text" bind:value={daf} style="width: 50px;">
        </label>
        <button on:click={fetchFromDafSupplier} disabled={fetchingText}>
          {fetchingText ? 'Fetching...' : 'Fetch from HebrewBooks'}
        </button>
      </div>
    </div>
    
    <div class="control-group">
      <label>Custom Text (with &lt;br&gt; tags)</label>
      <div class="text-inputs">
        <div>
          <label>Main Text (Gemara)</label>
          <textarea bind:value={mainText}></textarea>
        </div>
        <div>
          <label>Rashi</label>
          <textarea bind:value={rashiText}></textarea>
        </div>
        <div>
          <label>Tosafot</label>
          <textarea bind:value={tosafotText}></textarea>
        </div>
      </div>
      <button on:click={renderDaf} style="margin-top: 10px;">Re-render</button>
    </div>
  </div>
  
  <div class="render-container" bind:this={container}>
    {#if loading}
      <div class="loading">Rendering...</div>
    {/if}
    {#if error}
      <div class="error">Error: {error}</div>
    {/if}
  </div>
  
  {#if showDebugInfo && spacerInfo}
    <div class="debug-info">
      <h3>Debug Information</h3>
      <div class="debug-row">Render time: {renderTime.toFixed(2)}ms</div>
      <div class="debug-row">Spacer heights:</div>
      <div class="debug-row">  - Start: {spacerInfo.start}</div>
      <div class="debug-row">  - Inner: {spacerInfo.inner}</div>
      <div class="debug-row">  - Outer: {spacerInfo.outer}</div>
      <div class="debug-row">  - End: {spacerInfo.end}</div>
      
      {#if overlapInfo && overlapInfo.length > 0}
        <div class="debug-row" style="margin-top: 10px; color: red;">
          Overlaps detected: {overlapInfo.length}
          {#each overlapInfo as overlap}
            <div class="debug-row">
              - {overlap.type} at line {overlap.line}: {overlap.overlap.toFixed(1)}px
            </div>
          {/each}
        </div>
      {:else if detectOverlaps}
        <div class="debug-row" style="margin-top: 10px; color: green;">
          No overlaps detected
        </div>
      {/if}
    </div>
  {/if}
</div>