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
  let showSpacerIndicators = true;
  let useLineBreakMode = true; // Tell daf-renderer about <br> tags
  
  // Sample texts with line breaks - using Lorem Ipsum
  let mainText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.<br>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.<br>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.<br>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.<br>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.<br>Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.<br>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.<br>Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.<br>Sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.<br>Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam.<br>Nisi ut aliquid ex ea commodi consequatur quis autem vel eum iure reprehenderit qui in ea voluptate.<br>Velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.`;
  let rashiText = `At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti.<br>Atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.<br>Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.<br>Et harum quidem rerum facilis est et expedita distinctio nam libero tempore cum soluta nobis.<br>Est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus.<br>Omnis voluptas assumenda est, omnis dolor repellendus temporibus autem quibusdam et aut officiis.<br>Debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.<br>Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias.<br>Consequatur aut perferendis doloribus asperiores repellat nam libero tempore cum soluta nobis est.`;
  let tosafotText = `Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime.<br>Placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus temporibus autem.<br>Quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae.<br>Sint et molestiae non recusandae itaque earum rerum hic tenetur a sapiente delectus ut aut reiciendis.<br>Voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat sed ut perspiciatis.<br>Unde omnis iste natus error sit voluptatem accusantium doloremque laudantium totam rem aperiam.<br>Eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.<br>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit sed quia consequuntur.<br>Magni dolores eos qui ratione voluptatem sequi nesciunt neque porro quisquam est qui dolorem ipsum.`;
  
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
  
  // Edge case examples
  const edgeCases = {
    potentialOverlap: {
      main: `Short main text.<br>Very short.`,
      rashi: `Very long Rashi commentary that should extend much further down the page. At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.<br>Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.<br>Et harum quidem rerum facilis est et expedita distinctio nam libero tempore cum soluta nobis.<br>Est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus.<br>Omnis voluptas assumenda est, omnis dolor repellendus temporibus autem quibusdam et aut officiis.<br>Debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae.<br>Non recusandae itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis.<br>Voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat.`,
      tosafot: `Very long Tosafot commentary that extends beyond the main. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est.<br>Omnis dolor repellendus temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus.<br>Saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.<br>Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores.<br>Alias consequatur aut perferendis doloribus asperiores repellat sed ut perspiciatis unde omnis.<br>Iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam eaque.<br>Ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.<br>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit sed quia.`
    },
    textOverflow: {
      main: `Short main text that ends quickly.<br>Just two lines.`,
      rashi: `Extremely long Rashi commentary that will definitely overflow beyond any reasonable spacer height. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.<br>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.<br>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.<br>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.<br>Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.<br>Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur.<br>Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.<br>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.<br>Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio.<br>Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.`,
      tosafot: `Short Tosafot.<br>Just enough to test.`
    },
    noCommentary: {
      main: `Main text with no commentary at all.<br>This should trigger the "No Commentary" error case.<br>Used to test edge case handling.`,
      rashi: '',
      tosafot: ''
    },
    shortCommentary: {
      main: `Main text with very short commentaries.<br>The commentaries are too short to fill four lines.<br>This should trigger the "Not Enough Commentary" case.`,
      rashi: `Short.<br>Very short.`,
      tosafot: `Also short.`
    },
    onlyRashi: {
      main: `Main text with only Rashi commentary.<br>Tosafot is completely missing.<br>Should use exception handling.`,
      rashi: `Detailed Rashi commentary that has enough content to work with. Lorem ipsum dolor sit amet, consectetur adipiscing elit.<br>Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.<br>Ut enim ad minim veniam, quis nostrud exercitation.<br>Duis aute irure dolor in reprehenderit in voluptate velit esse.<br>More text to ensure we have sufficient content for testing.`,
      tosafot: ''
    },
    onlyTosafot: {
      main: `Main text with only Tosafot commentary.<br>Rashi is completely missing.<br>Should use exception handling.`,
      rashi: '',
      tosafot: `Detailed Tosafot commentary that has enough content to work with. Lorem ipsum dolor sit amet, consectetur adipiscing elit.<br>Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.<br>Ut enim ad minim veniam, quis nostrud exercitation.<br>Duis aute irure dolor in reprehenderit in voluptate velit esse.<br>More text to ensure we have sufficient content for testing.`
    }
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
  
  function loadEdgeCase(caseName) {
    const edgeCase = edgeCases[caseName];
    if (edgeCase) {
      mainText = edgeCase.main;
      rashiText = edgeCase.rashi;
      tosafotText = edgeCase.tosafot;
      renderDaf();
    }
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
        useLineBreakMode ? "br" : "", // Pass "br" only if line break mode is enabled
        () => {
          renderTime = performance.now() - startTime;
          console.log('Render complete in', renderTime, 'ms');
          
          // Get the dafRoot element
          const dafRoot = container.querySelector('.dafRoot');
          console.log('dafRoot found:', !!dafRoot);
          
          if (dafRoot) {
            const computedStyle = window.getComputedStyle(dafRoot);
            spacerInfo = {
              start: computedStyle.getPropertyValue('--spacerHeights-start'),
              inner: computedStyle.getPropertyValue('--spacerHeights-inner'),
              outer: computedStyle.getPropertyValue('--spacerHeights-outer'),
              end: computedStyle.getPropertyValue('--spacerHeights-end')
            };
            console.log('spacerInfo from CSS vars:', spacerInfo);
          } else {
            console.log('dafRoot not found, using renderer spacerHeights');
            // Fallback to renderer spacerHeights if CSS vars aren't available
            if (renderer.spacerHeights) {
              spacerInfo = {
                start: renderer.spacerHeights.start + 'px',
                inner: renderer.spacerHeights.inner + 'px', 
                outer: renderer.spacerHeights.outer + 'px',
                end: renderer.spacerHeights.end + 'px'
              };
            }
          }
          
          // Access the spacerHeights directly from renderer instance
          console.log('Renderer spacerHeights:', renderer.spacerHeights);
          
          // Check for overlap indicators
          if (showOverlapIndicators && renderer.spacerHeights?.overlaps) {
            overlapInfo = renderer.spacerHeights.overlaps;
            console.log('Overlaps detected:', overlapInfo);
            visualizeOverlaps(renderer.spacerHeights.overlaps);
          }
          
          // Always run DOM-based overflow detection as a fallback
          if (showOverlapIndicators) {
            setTimeout(() => {
              const domOverlaps = detectDOMOverflows();
              if (domOverlaps.length > 0) {
                console.log('🔥 DOM-based overflows detected:', domOverlaps);
                if (!overlapInfo || overlapInfo.length === 0) {
                  overlapInfo = domOverlaps;
                  visualizeOverlaps(domOverlaps);
                }
              }
            }, 150);
          }
          
          // Show spacer indicators
          if (showSpacerIndicators) {
            setTimeout(() => visualizeSpacers(), 100); // Small delay to ensure rendering is complete
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
    
    overlaps.forEach(({ type, line, overlap, mainPos, innerPos, outerPos, mainEnd, innerEnd, outerEnd, spacerEnd, textEnd }) => {
      const indicator = document.createElement('div');
      indicator.className = 'overlap-indicator';
      
      // Different visualization for different types of issues
      let overlapStart, overlapEnd, backgroundColor, borderColor, labelColor;
      
      if (type.includes('overflow')) {
        // Text overflow beyond spacer boundaries - use orange/yellow
        backgroundColor = 'rgba(255, 165, 0, 0.3)';
        borderColor = 'orange';
        labelColor = 'orange';
        
        if (type === 'inner-overflow') {
          overlapStart = spacerEnd;
          overlapEnd = textEnd || innerEnd;
        } else if (type === 'outer-overflow') {
          overlapStart = spacerEnd;
          overlapEnd = textEnd || outerEnd;
        }
      } else {
        // Regular overlaps between sections - use red
        backgroundColor = 'rgba(255, 0, 0, 0.3)';
        borderColor = 'red';
        labelColor = 'red';
        
        if (type.includes('inner')) {
          overlapStart = innerPos || (innerPos === 0 ? 0 : mainEnd - overlap);
          overlapEnd = mainEnd;
        } else if (type.includes('outer')) {
          overlapStart = outerPos || (outerPos === 0 ? 0 : mainEnd - overlap);
          overlapEnd = mainEnd;
        } else {
          overlapStart = mainPos;
          overlapEnd = mainPos + overlap;
        }
      }
      
      indicator.style.cssText = `
        position: absolute;
        background: ${backgroundColor};
        border: 2px solid ${borderColor};
        height: ${Math.abs(overlap)}px;
        width: 100%;
        z-index: 9999;
        pointer-events: none;
        top: ${Math.min(overlapStart, overlapEnd)}px;
      `;
      
      const label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        background: ${labelColor};
        color: white;
        padding: 2px 5px;
        font-size: 10px;
        top: 0;
        left: 0;
        white-space: nowrap;
      `;
      
      const issueType = type.includes('overflow') ? 'overflow' : 'overlap';
      label.textContent = `${type} ${issueType}: ${Math.abs(overlap).toFixed(1)}px`;
      indicator.appendChild(label);
      
      container.appendChild(indicator);
    });
  }
  
  function visualizeSpacers() {
    // Remove existing spacer indicators
    container.querySelectorAll('.spacer-indicator').forEach(el => el.remove());
    
    // Find all spacers in the rendered content
    const spacers = container.querySelectorAll('.spacer');
    
    spacers.forEach((spacer, index) => {
      const rect = spacer.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      const indicator = document.createElement('div');
      indicator.className = 'spacer-indicator';
      indicator.style.cssText = `
        position: absolute;
        background: rgba(0, 255, 0, 0.2);
        border: 1px dashed green;
        height: ${rect.height}px;
        width: ${rect.width}px;
        top: ${rect.top - containerRect.top}px;
        left: ${rect.left - containerRect.left}px;
        z-index: 9998;
        pointer-events: none;
      `;
      
      const label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        background: green;
        color: white;
        padding: 1px 3px;
        font-size: 9px;
        top: 0;
        left: 0;
      `;
      const spacerClass = spacer.className.replace('spacer', '').trim();
      label.textContent = `${spacerClass} ${rect.height.toFixed(1)}px`;
      indicator.appendChild(label);
      
      container.appendChild(indicator);
    });
  }
  
  function detectDOMOverflows() {
    console.log('🕵️ Starting DOM-based overflow detection...');
    
    // Find actual spacer elements and text elements
    const spacers = container.querySelectorAll('.spacer');
    const innerText = container.querySelector('.inner .text');
    const outerText = container.querySelector('.outer .text');
    
    if (!spacers.length || (!innerText && !outerText)) {
      console.log('❌ Could not find spacers or text elements');
      return [];
    }
    
    const containerRect = container.getBoundingClientRect();
    const overlaps = [];
    
    // Get spacer boundaries
    const spacerInfo = {};
    spacers.forEach(spacer => {
      const className = spacer.className;
      const rect = spacer.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;
      const relativeBottom = rect.bottom - containerRect.top;
      
      if (className.includes('inner')) {
        spacerInfo.inner = { top: relativeTop, bottom: relativeBottom, height: rect.height };
      } else if (className.includes('outer')) {
        spacerInfo.outer = { top: relativeTop, bottom: relativeBottom, height: rect.height };
      }
    });
    
    console.log('🎯 Spacer boundaries:', spacerInfo);
    
    // Check inner text overflow
    if (innerText && spacerInfo.inner) {
      const textRect = innerText.getBoundingClientRect();
      const textTop = textRect.top - containerRect.top;
      const textBottom = textRect.bottom - containerRect.top;
      
      console.log('📏 Inner text:', { top: textTop, bottom: textBottom, height: textRect.height });
      console.log('📦 Inner spacer:', spacerInfo.inner);
      
      if (textBottom > spacerInfo.inner.bottom) {
        const overflowAmount = textBottom - spacerInfo.inner.bottom;
        console.log('🔥 Inner overflow detected:', overflowAmount);
        overlaps.push({
          type: 'inner-overflow',
          overlap: overflowAmount,
          textEnd: textBottom,
          spacerEnd: spacerInfo.inner.bottom,
          innerPos: textTop,
          innerEnd: textBottom
        });
      }
    }
    
    // Check outer text overflow
    if (outerText && spacerInfo.outer) {
      const textRect = outerText.getBoundingClientRect();
      const textTop = textRect.top - containerRect.top;
      const textBottom = textRect.bottom - containerRect.top;
      
      console.log('📏 Outer text:', { top: textTop, bottom: textBottom, height: textRect.height });
      console.log('📦 Outer spacer:', spacerInfo.outer);
      
      if (textBottom > spacerInfo.outer.bottom) {
        const overflowAmount = textBottom - spacerInfo.outer.bottom;
        console.log('🔥 Outer overflow detected:', overflowAmount);
        overlaps.push({
          type: 'outer-overflow',
          overlap: overflowAmount,
          textEnd: textBottom,
          spacerEnd: spacerInfo.outer.bottom,
          outerPos: textTop,
          outerEnd: textBottom
        });
      }
    }
    
    return overlaps;
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
  
  .edge-cases {
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
  
  :global(.spacer-indicator) {
    box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
  }
  
  /* Ensure text uses full width */
  .render-container :global(.text) {
    width: 100% !important;
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
          <input type="checkbox" bind:checked={useLineBreakMode}>
          Line Break Mode (notify renderer of &lt;br&gt; tags)
        </label>
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
        <label>
          <input type="checkbox" bind:checked={showSpacerIndicators}>
          Show Spacer Indicators
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
      <label>Edge Cases</label>
      <div class="edge-cases">
        <button on:click={() => loadEdgeCase('potentialOverlap')}>Potential Overlap</button>
        <button on:click={() => loadEdgeCase('textOverflow')}>Text Overflow</button>
        <button on:click={() => loadEdgeCase('noCommentary')}>No Commentary</button>
        <button on:click={() => loadEdgeCase('shortCommentary')}>Short Commentary</button>
        <button on:click={() => loadEdgeCase('onlyRashi')}>Only Rashi</button>
        <button on:click={() => loadEdgeCase('onlyTosafot')}>Only Tosafot</button>
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
  
  {#if showDebugInfo}
    <div class="debug-info">
      <h3>Debug Information</h3>
      <div class="debug-row">Render time: {renderTime.toFixed(2)}ms</div>
      {#if spacerInfo}
        <div class="debug-row">Spacer heights:</div>
        <div class="debug-row">  - Start: {spacerInfo.start}</div>
        <div class="debug-row">  - Inner: {spacerInfo.inner}</div>
        <div class="debug-row">  - Outer: {spacerInfo.outer}</div>
        <div class="debug-row">  - End: {spacerInfo.end}</div>
      {:else}
        <div class="debug-row">Spacer heights: Not available</div>
      {/if}
      
      {#if overlapInfo && overlapInfo.length > 0}
        <div class="debug-row" style="margin-top: 10px; color: red;">
          Overlaps detected: {overlapInfo.length}
          {#each overlapInfo as overlap}
            <div class="debug-row">
              - {overlap.type} at line {overlap.line}: {overlap.overlap.toFixed(1)}px
            </div>
          {/each}
        </div>
      {:else}
        <div class="debug-row" style="margin-top: 10px; color: green;">
          No overlaps detected
        </div>
      {/if}
    </div>
  {/if}
</div>