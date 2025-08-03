<script>
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { talmudStore, currentPage, isLoading, pageError } from '$lib/stores/talmud';
  import { rendererStore } from '$lib/stores/renderer';
  import dafRenderer from '$lib/daf-renderer/renderer';

  // DOM reference
  let container;
  
  // State management with Svelte 5 reactivity
  let state = $state({
    lineBreakMode: false,
    selectedTractate: 'Berakhot',
    selectedPage: '2',
    selectedAmud: 'a',
    selectedTestCase: 'berakhot2a',
    useCustomGemara: false,
    showLineAnalysis: true,
    lineAnalysis: null
  });

  // Prevent URL update loops
  let isInitializing = true;
  let isUpdatingUrl = false;

  // Test cases configuration
  const TEST_CASES = {
    'berakhot2a': { 
      tractate: 'Berakhot', 
      page: '2', 
      amud: 'a', 
      name: 'Berakhot 2a (Outer Dominant)' 
    },
    'bavametzia17a': { 
      tractate: 'Bava Metzia', 
      page: '17', 
      amud: 'a', 
      name: 'Bava Metzia 17a (Inner Dominant)' 
    },
    'nedarim46a': { 
      tractate: 'Nedarim', 
      page: '46', 
      amud: 'a', 
      name: 'Nedarim 46a (Double Commentary)' 
    }
  };

  // Tractate options for custom selection
  const TRACTATE_OPTIONS = [
    { value: 'Berakhot', label: 'ברכות' },
    { value: 'Shabbat', label: 'שבת' },
    { value: 'Eruvin', label: 'עירובין' },
    { value: 'Pesachim', label: 'פסחים' },
    { value: 'Yoma', label: 'יומא' },
    { value: 'Sukkah', label: 'סוכה' },
    { value: 'Beitzah', label: 'ביצה' },
    { value: 'Rosh Hashanah', label: 'ראש השנה' },
    { value: 'Taanit', label: 'תענית' },
    { value: 'Megillah', label: 'מגילה' },
    { value: 'Moed Katan', label: 'מועד קטן' },
    { value: 'Chagigah', label: 'חגיגה' },
    { value: 'Yevamot', label: 'יבמות' },
    { value: 'Ketubot', label: 'כתובות' },
    { value: 'Nedarim', label: 'נדרים' },
    { value: 'Nazir', label: 'נזיר' },
    { value: 'Sotah', label: 'סוטה' },
    { value: 'Gittin', label: 'גיטין' },
    { value: 'Kiddushin', label: 'קידושין' },
    { value: 'Bava Kamma', label: 'בבא קמא' },
    { value: 'Bava Metzia', label: 'בבא מציעא' },
    { value: 'Bava Batra', label: 'בבא בתרא' },
    { value: 'Sanhedrin', label: 'סנהדרין' },
    { value: 'Makkot', label: 'מכות' },
    { value: 'Shevuot', label: 'שבועות' },
    { value: 'Avodah Zarah', label: 'עבודה זרה' },
    { value: 'Horayot', label: 'הוריות' },
    { value: 'Zevachim', label: 'זבחים' },
    { value: 'Menachot', label: 'מנחות' },
    { value: 'Chullin', label: 'חולין' },
    { value: 'Bechorot', label: 'בכורות' },
    { value: 'Arachin', label: 'ערכין' },
    { value: 'Temurah', label: 'תמורה' },
    { value: 'Keritot', label: 'כריתות' },
    { value: 'Meilah', label: 'מעילה' },
    { value: 'Tamid', label: 'תמיד' },
    { value: 'Niddah', label: 'נידה' }
  ];

  // Initialize from URL parameters
  function initializeFromUrl() {
    const params = $page.url.searchParams;
    
    state.lineBreakMode = params.get('lineBreaks') === 'true';
    
    // Check if we have custom tractate/page params
    if (params.has('tractate') && params.has('page') && params.has('amud')) {
      state.useCustomGemara = true;
      state.selectedTractate = params.get('tractate');
      state.selectedPage = params.get('page');
      state.selectedAmud = params.get('amud');
    } else {
      // Use test case
      state.useCustomGemara = false;
      const testCase = params.get('testCase') || 'berakhot2a';
      state.selectedTestCase = testCase;
      
      const caseData = TEST_CASES[testCase] || TEST_CASES['berakhot2a'];
      state.selectedTractate = caseData.tractate;
      state.selectedPage = caseData.page;
      state.selectedAmud = caseData.amud;
    }
    
    console.log('📍 Initialized from URL:', {
      lineBreakMode: state.lineBreakMode,
      testCase: state.selectedTestCase,
      tractate: state.selectedTractate,
      page: state.selectedPage,
      amud: state.selectedAmud,
      useCustom: state.useCustomGemara
    });
  }

  // Update URL based on current state
  function updateUrl() {
    if (isUpdatingUrl) return;
    isUpdatingUrl = true;
    
    const params = new URLSearchParams();
    params.set('lineBreaks', state.lineBreakMode.toString());
    
    if (state.useCustomGemara) {
      params.set('tractate', state.selectedTractate);
      params.set('page', state.selectedPage);
      params.set('amud', state.selectedAmud);
    } else {
      params.set('testCase', state.selectedTestCase);
    }
    
    goto(`?${params.toString()}`, { replaceState: true });
    
    setTimeout(() => { isUpdatingUrl = false; }, 100);
  }

  // Load page data via store
  async function loadPageData() {
    console.log(`📚 Loading ${state.selectedTractate} ${state.selectedPage}${state.selectedAmud} (lineBreaks: ${state.lineBreakMode})`);
    await talmudStore.loadPage(
      state.selectedTractate, 
      state.selectedPage, 
      state.selectedAmud, 
      { lineBreakMode: state.lineBreakMode }
    );
  }

  // Analyze text for line distribution
  function analyzeLines(mainText, rashiText, tosafotText) {
    if (!mainText || !rashiText || !tosafotText) return null;
    
    // Split by line breaks or newlines
    const splitLines = (text) => text.split(/<br\s*\/?>|\n/).filter(line => line.trim());
    
    const mainLines = splitLines(mainText);
    const rashiLines = splitLines(rashiText);
    const tosafotLines = splitLines(tosafotText);
    
    // Categorize lines
    const categorizeMainLine = (line) => {
      const len = line.replace(/<[^>]*>/g, '').length;
      if (len < 30) return 'regular';
      if (len < 60) return 'medium';
      return 'large';
    };
    
    const categorizeCommentaryLine = (line, index) => {
      if (index < 4) return 'specialCase';
      const len = line.replace(/<[^>]*>/g, '').length;
      if (len < 20) return 'small';
      if (len < 40) return 'medium';
      return 'large';
    };
    
    // Analyze each section
    const analyzeSection = (lines, isCommentary) => {
      const types = isCommentary 
        ? { specialCase: 0, small: 0, medium: 0, large: 0 }
        : { regular: 0, medium: 0, large: 0 };
      
      const detailed = lines.map((line, index) => {
        const type = isCommentary 
          ? categorizeCommentaryLine(line, index)
          : categorizeMainLine(line);
        types[type]++;
        return {
          text: line.replace(/<[^>]*>/g, '').trim(),
          classification: type,
          length: line.length
        };
      });
      
      return { types, detailed };
    };
    
    const mainAnalysis = analyzeSection(mainLines, false);
    const rashiAnalysis = analyzeSection(rashiLines, true);
    const tosafotAnalysis = analyzeSection(tosafotLines, true);
    
    return {
      main: mainAnalysis.types,
      rashi: rashiAnalysis.types,
      tosafot: tosafotAnalysis.types,
      totals: {
        main: mainLines.length,
        rashi: rashiLines.length,
        tosafot: tosafotLines.length
      },
      mainLines: mainAnalysis.detailed,
      rashiLines: rashiAnalysis.detailed,
      tosafotLines: tosafotAnalysis.detailed
    };
  }

  // Renderer instance
  let renderer = null;
  
  // Render function using direct daf-renderer
  function renderPage(pageData) {
    if (!pageData || !container) return;
    
    // Check if pageData is array (from Sefaria) or object (from HebrewBooks)
    let mainText, rashiText, tosafotText;
    
    if (Array.isArray(pageData.mainText)) {
      // Sefaria format - join arrays into strings
      mainText = pageData.mainText.join(' ');
      rashiText = pageData.rashi ? pageData.rashi.join(' ') : '';
      tosafotText = pageData.tosafot ? pageData.tosafot.join(' ') : '';
    } else {
      // HebrewBooks format - already strings
      mainText = pageData.mainText || '';
      rashiText = pageData.rashi || '';
      tosafotText = pageData.tosafot || '';
    }
    
    console.log('📝 Rendering with texts:', {
      main: mainText.length,
      rashi: rashiText.length,
      tosafot: tosafotText.length,
      hasMainText: !!mainText,
      hasRashi: !!rashiText,
      hasTosafot: !!tosafotText
    });
    
    // Initialize renderer if needed
    if (!renderer) {
      console.log('🎨 Creating new renderer');
      renderer = dafRenderer(container);
    }
    
    // Create page label - handle both daf and page properties
    const pageNum = pageData.daf || pageData.page || state.selectedPage;
    const amudLetter = pageData.amud || state.selectedAmud;
    const pageLabel = `${pageNum}${amudLetter}`
      .replace('a', 'א')
      .replace('b', 'ב');
    
    // Validate we have text before rendering
    if (!mainText && !rashiText && !tosafotText) {
      console.error('❌ No text content available for rendering');
      return;
    }
    
    // Ensure we have at least some commentary
    if (!rashiText && !tosafotText) {
      console.warn('⚠️ No commentary text, adding placeholder');
      rashiText = ' '; // Add minimal content to prevent "No Commentary" error
      tosafotText = ' ';
    }
    
    // Determine amud
    const amud = pageData.amud || 'a';
    
    // Render with daf-renderer
    try {
      renderer.render(
        mainText,
        rashiText,
        tosafotText,
        amud,
        state.lineBreakMode ? '<br>' : undefined
      );
      console.log('✅ Render complete');
      
      // Analyze lines
      state.lineAnalysis = analyzeLines(mainText, rashiText, tosafotText);
    } catch (error) {
      console.error('❌ Render error:', error);
      // Try to recover by adding placeholder text
      if (error.message && error.message.includes('No Commentary')) {
        console.log('🔧 Attempting recovery with placeholder text');
        try {
          renderer.render(
            mainText || ' ',
            rashiText || ' ',
            tosafotText || ' ',
            amud,
            state.lineBreakMode ? '<br>' : undefined
          );
          state.lineAnalysis = analyzeLines(mainText || ' ', rashiText || ' ', tosafotText || ' ');
        } catch (recoveryError) {
          console.error('❌ Recovery failed:', recoveryError);
        }
      }
    }
  }
  
  // Handle store data updates
  $effect(() => {
    const pageData = $currentPage;
    const loading = $isLoading;
    
    console.log('🔍 Store update:', { 
      hasData: !!pageData, 
      hasContainer: !!container, 
      loading
    });
    
    if (pageData && container && !loading) {
      renderPage(pageData);
    }
  });

  // Handle URL state updates (but not during initialization)
  $effect(() => {
    // Only update URL after component is fully initialized
    if (!isInitializing && container) {
      updateUrl();
    }
  });

  // Toggle line break mode
  function toggleLineBreakMode() {
    state.lineBreakMode = !state.lineBreakMode;
    console.log('🔄 Toggling line break mode to:', state.lineBreakMode);
    updateUrl();
    window.location.reload();
  }

  // Load test case
  function loadTestCase(caseKey) {
    state.selectedTestCase = caseKey;
    state.useCustomGemara = false;
    
    const caseData = TEST_CASES[caseKey];
    state.selectedTractate = caseData.tractate;
    state.selectedPage = caseData.page;
    state.selectedAmud = caseData.amud;
    
    loadPageData();
  }

  // Load custom page
  function loadCustomPage() {
    state.useCustomGemara = true;
    loadPageData();
  }

  // Initialize on mount
  onMount(async () => {
    console.log('🚀 Component mounted');
    initializeFromUrl();
    
    // Wait for DOM to be ready
    await tick();
    
    console.log('📦 Container status:', !!container);
    if (!container) {
      console.error('❌ Container not bound!');
      return;
    }
    
    // Load initial data
    await loadPageData();
    
    // Mark initialization complete
    setTimeout(() => {
      isInitializing = false;
    }, 100);
    
    // Return cleanup function
    return () => {
      if (renderer) {
        console.log('🧹 Cleaning up renderer');
        renderer = null;
      }
    };
  });
</script>

<svelte:head>
  <title>Daf Renderer Test</title>
</svelte:head>

<main class="test-container">
  <h1>Daf Renderer Test Page</h1>
  <p class="subtitle">Test daf-renderer with line break analysis</p>

  <!-- Controls Section -->
  <div class="controls">
    <!-- Line Break Toggle -->
    <div class="control-group">
      <label class="toggle-switch">
        <input 
          type="checkbox" 
          checked={state.lineBreakMode}
          onchange={toggleLineBreakMode}
        >
        <span class="toggle-slider"></span>
        <span class="toggle-label">
          Line Break Mode: {state.lineBreakMode ? 'Enabled' : 'Disabled'}
        </span>
      </label>
      <small class="info">⚠️ Toggling will reload the page</small>
    </div>

    <!-- Test Cases -->
    <div class="control-group">
      <h3>Test Cases</h3>
      <div class="button-group">
        {#each Object.entries(TEST_CASES) as [key, testCase]}
          <button
            class="test-button"
            class:active={!state.useCustomGemara && state.selectedTestCase === key}
            onclick={() => loadTestCase(key)}
          >
            {testCase.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- Custom Page Selection -->
    <div class="control-group">
      <h3>Custom Page</h3>
      <div class="custom-controls">
        <select bind:value={state.selectedTractate}>
          {#each TRACTATE_OPTIONS as option}
            <option value={option.value}>{option.label} ({option.value})</option>
          {/each}
        </select>
        
        <select bind:value={state.selectedPage}>
          {#each Array.from({length: 100}, (_, i) => i + 2) as pageNum}
            <option value={pageNum.toString()}>{pageNum}</option>
          {/each}
        </select>
        
        <select bind:value={state.selectedAmud}>
          <option value="a">א (a)</option>
          <option value="b">ב (b)</option>
        </select>
        
        <button 
          class="load-button"
          onclick={loadCustomPage}
        >
          Load Page
        </button>
      </div>
    </div>

    <!-- Status -->
    {#if $isLoading}
      <div class="status loading">
        Loading...
        <button 
          class="retry-button"
          onclick={() => {
            console.log('🔄 Manual retry triggered');
            loadPageData();
          }}
        >
          Retry
        </button>
      </div>
    {/if}
    
    {#if $pageError}
      <div class="status error">
        Error: {$pageError}
        <button 
          class="retry-button"
          onclick={() => {
            console.log('🔄 Retrying after error');
            loadPageData();
          }}
        >
          Retry
        </button>
      </div>
    {/if}
  </div>

  <!-- Renderer Container -->
  <div class="renderer-container" bind:this={container}></div>

  <!-- Line Analysis -->
  <div class="analysis-section">
    <div class="analysis-header">
      <h3>Line Distribution Analysis</h3>
      <label class="toggle-switch small">
        <input type="checkbox" bind:checked={state.showLineAnalysis}>
        <span class="toggle-slider"></span>
        <span class="toggle-label">Show Analysis</span>
      </label>
    </div>

    {#if state.showLineAnalysis}
      {#if state.lineAnalysis}
        <div class="analysis-content">
          <!-- Summary -->
          <div class="summary-card">
            <h4>Summary</h4>
            <div class="summary-grid">
              <div class="summary-item">
                <strong>Main Text:</strong>
                <span>{state.lineAnalysis.totals.main} lines</span>
                <small>
                  Regular: {state.lineAnalysis.main.regular}, 
                  Medium: {state.lineAnalysis.main.medium}, 
                  Large: {state.lineAnalysis.main.large}
                </small>
              </div>
              <div class="summary-item">
                <strong>Rashi:</strong>
                <span>{state.lineAnalysis.totals.rashi} lines</span>
                <small>
                  Special: {state.lineAnalysis.rashi.specialCase}, 
                  Small: {state.lineAnalysis.rashi.small}, 
                  Medium: {state.lineAnalysis.rashi.medium}, 
                  Large: {state.lineAnalysis.rashi.large}
                </small>
              </div>
              <div class="summary-item">
                <strong>Tosafot:</strong>
                <span>{state.lineAnalysis.totals.tosafot} lines</span>
                <small>
                  Special: {state.lineAnalysis.tosafot.specialCase}, 
                  Small: {state.lineAnalysis.tosafot.small}, 
                  Medium: {state.lineAnalysis.tosafot.medium}, 
                  Large: {state.lineAnalysis.tosafot.large}
                </small>
              </div>
            </div>
          </div>

          <!-- Detailed Lines -->
          <details class="line-details">
            <summary>Detailed Line Analysis</summary>
            
            {#if state.lineAnalysis.mainLines.length > 0}
              <div class="line-section">
                <h5>Main Text Lines</h5>
                {#each state.lineAnalysis.mainLines.slice(0, 10) as line, i}
                  <div class="line-entry">
                    <span class="line-num">#{i + 1}</span>
                    <span class="line-type {line.classification}">{line.classification}</span>
                    <span class="line-text">{line.text.substring(0, 80)}{line.text.length > 80 ? '...' : ''}</span>
                  </div>
                {/each}
                {#if state.lineAnalysis.mainLines.length > 10}
                  <div class="line-more">... and {state.lineAnalysis.mainLines.length - 10} more lines</div>
                {/if}
              </div>
            {/if}

            {#if state.lineAnalysis.rashiLines.length > 0}
              <div class="line-section">
                <h5>Rashi Lines</h5>
                {#each state.lineAnalysis.rashiLines.slice(0, 10) as line, i}
                  <div class="line-entry">
                    <span class="line-num">#{i + 1}</span>
                    <span class="line-type {line.classification}">{line.classification}</span>
                    <span class="line-text">{line.text.substring(0, 80)}{line.text.length > 80 ? '...' : ''}</span>
                  </div>
                {/each}
                {#if state.lineAnalysis.rashiLines.length > 10}
                  <div class="line-more">... and {state.lineAnalysis.rashiLines.length - 10} more lines</div>
                {/if}
              </div>
            {/if}

            {#if state.lineAnalysis.tosafotLines.length > 0}
              <div class="line-section">
                <h5>Tosafot Lines</h5>
                {#each state.lineAnalysis.tosafotLines.slice(0, 10) as line, i}
                  <div class="line-entry">
                    <span class="line-num">#{i + 1}</span>
                    <span class="line-type {line.classification}">{line.classification}</span>
                    <span class="line-text">{line.text.substring(0, 80)}{line.text.length > 80 ? '...' : ''}</span>
                  </div>
                {/each}
                {#if state.lineAnalysis.tosafotLines.length > 10}
                  <div class="line-more">... and {state.lineAnalysis.tosafotLines.length - 10} more lines</div>
                {/if}
              </div>
            {/if}
          </details>
        </div>
      {:else}
        <div class="analysis-placeholder">
          <p>No analysis available. Data will appear after page loads.</p>
          {#if $currentPage}
            <button 
              class="analyze-button"
              onclick={() => {
                state.lineAnalysis = analyzeLines(
                  $currentPage.mainText,
                  $currentPage.rashi,
                  $currentPage.tosafot
                );
              }}
            >
              Analyze Current Page
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</main>

<style>
  @import '$lib/daf-renderer/styles.css';

  .test-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    color: #333;
  }

  .subtitle {
    color: #666;
    margin: 0 0 2rem 0;
  }

  /* Controls */
  .controls {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .control-group {
    margin-bottom: 1.5rem;
  }

  .control-group:last-child {
    margin-bottom: 0;
  }

  .control-group h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: #555;
  }

  /* Toggle Switch */
  .toggle-switch {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
  }

  .toggle-switch input {
    display: none;
  }

  .toggle-slider {
    width: 48px;
    height: 24px;
    background: #ccc;
    border-radius: 24px;
    margin-right: 0.75rem;
    position: relative;
    transition: background 0.3s;
  }

  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    transition: transform 0.3s;
  }

  .toggle-switch input:checked + .toggle-slider {
    background: #4CAF50;
  }

  .toggle-switch input:checked + .toggle-slider::after {
    transform: translateX(24px);
  }

  .toggle-switch.small .toggle-slider {
    width: 36px;
    height: 20px;
  }

  .toggle-switch.small .toggle-slider::after {
    width: 14px;
    height: 14px;
  }

  .toggle-switch.small input:checked + .toggle-slider::after {
    transform: translateX(16px);
  }

  .toggle-label {
    font-weight: 500;
  }

  .info {
    display: block;
    margin-top: 0.5rem;
    color: #666;
  }

  /* Buttons */
  .button-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .test-button, .load-button, .analyze-button {
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .test-button:hover, .load-button:hover, .analyze-button:hover {
    background: #f0f0f0;
    border-color: #bbb;
  }

  .test-button.active {
    background: #007bff;
    color: white;
    border-color: #007bff;
  }

  /* Custom Controls */
  .custom-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .custom-controls select {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
  }

  .load-button {
    background: #28a745;
    color: white;
    border-color: #28a745;
  }

  .load-button:hover {
    background: #218838;
    border-color: #1e7e34;
  }

  /* Status */
  .status {
    padding: 0.75rem;
    border-radius: 4px;
    margin-top: 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .status.loading {
    background: #e3f2fd;
    color: #1976d2;
  }

  .status.error {
    background: #ffebee;
    color: #c62828;
  }
  
  .retry-button {
    padding: 0.25rem 0.75rem;
    font-size: 0.875rem;
    background: white;
    border: 1px solid currentColor;
    border-radius: 3px;
    cursor: pointer;
    margin-left: 1rem;
  }
  
  .retry-button:hover {
    background: rgba(255, 255, 255, 0.8);
  }

  /* Renderer Container */
  .renderer-container {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    min-height: 600px;
    margin-bottom: 2rem;
    overflow: hidden;
  }

  /* Analysis Section */
  .analysis-section {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .analysis-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .analysis-header h3 {
    margin: 0;
    color: #333;
  }

  .analysis-content {
    background: white;
    border-radius: 6px;
    padding: 1.5rem;
    border: 1px solid #e0e0e0;
  }

  /* Summary Card */
  .summary-card {
    margin-bottom: 1.5rem;
  }

  .summary-card h4 {
    margin: 0 0 1rem 0;
    color: #555;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .summary-item {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 4px;
  }

  .summary-item strong {
    display: block;
    margin-bottom: 0.25rem;
    color: #333;
  }

  .summary-item span {
    display: block;
    font-size: 1.25rem;
    color: #007bff;
    margin-bottom: 0.5rem;
  }

  .summary-item small {
    display: block;
    color: #666;
    font-size: 0.875rem;
  }

  /* Line Details */
  .line-details {
    background: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    padding: 1rem;
  }

  .line-details summary {
    cursor: pointer;
    font-weight: 500;
    color: #555;
    padding: 0.5rem;
    user-select: none;
  }

  .line-details[open] summary {
    margin-bottom: 1rem;
  }

  .line-section {
    margin-bottom: 1.5rem;
  }

  .line-section:last-child {
    margin-bottom: 0;
  }

  .line-section h5 {
    margin: 0 0 0.75rem 0;
    color: #555;
    font-size: 1rem;
  }

  .line-entry {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    font-size: 0.875rem;
  }

  .line-num {
    color: #999;
    font-family: monospace;
    min-width: 30px;
  }

  .line-type {
    padding: 0.125rem 0.5rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .line-type.regular { background: #e3f2fd; color: #1976d2; }
  .line-type.medium { background: #fff3e0; color: #f57c00; }
  .line-type.large { background: #ffebee; color: #c62828; }
  .line-type.specialCase { background: #f3e5f5; color: #7b1fa2; }
  .line-type.small { background: #e8f5e9; color: #388e3c; }

  .line-text {
    flex: 1;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .line-more {
    margin-top: 0.5rem;
    color: #999;
    font-style: italic;
  }

  /* Placeholder */
  .analysis-placeholder {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  .analysis-placeholder p {
    margin: 0 0 1rem 0;
  }

  .analyze-button {
    background: #007bff;
    color: white;
    border-color: #007bff;
  }

  .analyze-button:hover {
    background: #0056b3;
    border-color: #004085;
  }
</style>