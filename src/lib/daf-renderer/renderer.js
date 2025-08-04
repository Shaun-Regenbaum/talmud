import {defaultOptions, mergeAndClone} from "./options";
import calculateSpacers from "./calculate-spacers";
import styleManager from "./style-manager";
import { LAYOUT_CONSTANTS, RESIZE_DEBOUNCE_DELAY } from "./constants";
import { debounce, createDiv as div, createSpan as span } from "./utils";


export default function (el, options = defaultOptions) {
  const root = (typeof el === "string") ? document.querySelector(el) : el;
  if (!(root && root instanceof Element && root.tagName.toUpperCase() === "DIV")) {
    throw new Error("Argument must be a div element or its selector");
  }
  const outerContainer = div(root);
  const innerContainer = div(root);
  const mainContainer = div(root);
  const dummy = div(root);
  dummy.id = "dummy";
  const containers = {
    el: root,
    dummy: dummy,
    outer: {
      el: outerContainer,
      spacers: {
        start: div(outerContainer),
        mid: div(outerContainer),
        end: div(outerContainer)
      },
      text: div(outerContainer)
    },
    inner: {
      el: innerContainer,
      spacers: {
        start: div(innerContainer),
        mid: div(innerContainer),
        end: div(innerContainer)
      },
      text: div(innerContainer)
    },
    main: {
      el: mainContainer,
      spacers: {
        start: div(mainContainer),
        inner: div(mainContainer),
        outer: div(mainContainer),
      },
      text: div(mainContainer)
    }
  }

  const textSpans = {
    main: span(containers.main.text),
    inner: span(containers.inner.text),
    outer: span(containers.outer.text)
  }

  const clonedOptions = mergeAndClone(options, defaultOptions);

  styleManager.applyClasses(containers);
  styleManager.updateOptionsVars(clonedOptions);

  let resizeEvent;
  const rendererObject = {
    containers,
    spacerHeights: {
      start: 0,
      inner: 0,
      outer: 0,
      end: 0
    },
    amud: LAYOUT_CONSTANTS.DEFAULT_AMUD,
    render(main, inner, outer, amud = "a", linebreak, renderCallback, resizeCallback) {
      try {
        if (resizeEvent) {
          window.removeEventListener("resize", resizeEvent);
        }
        if (this.amud != amud) {
          this.amud = amud;
          styleManager.updateIsAmudB(amud == "b");
        }
        // Store original text with <br> tags for spacer calculation
        const originalMain = main;
        const originalInner = inner;
        const originalOuter = outer;
        
        this.spacerHeights = calculateSpacers(originalMain, originalInner, originalOuter, clonedOptions, containers.dummy);
        if (this.spacerHeights instanceof Error) {
          throw this.spacerHeights;
        }
        Object.assign(rendererObject.spacerHeights, this.spacerHeights);
        
        const resizeHandler = () => {
          this.spacerHeights = calculateSpacers(originalMain, originalInner, originalOuter, clonedOptions, containers.dummy);
          if (!(this.spacerHeights instanceof Error)) {
            Object.assign(rendererObject.spacerHeights, this.spacerHeights);
            styleManager.updateSpacersVars(this.spacerHeights);
          }
          if (resizeCallback)
            resizeCallback();
        };
        resizeEvent = debounce(resizeHandler, RESIZE_DEBOUNCE_DELAY);
        window.addEventListener("resize", resizeEvent);
      }
      
      styleManager.updateSpacersVars(this.spacerHeights);
      styleManager.manageExceptions(this.spacerHeights);
      Object.assign(rendererObject.spacerHeights, this.spacerHeights);
      
      // Add/remove linebreak-mode class based on whether we're using line breaks
      if (linebreak) {
        containers.el.classList.add('linebreak-mode');
        console.log('🎨 LINEBREAK MODE ACTIVE - CSS class added, break tags present:', {
          mainHasBr: main.includes('<br>'),
          mainHasWbr: main.includes('<wbr>'),
          innerHasBr: inner.includes('<br>'),
          innerHasWbr: inner.includes('<wbr>'),
          outerHasBr: outer.includes('<br>'),
          outerHasWbr: outer.includes('<wbr>'),
          linebreakParam: linebreak
        });
      } else {
        containers.el.classList.remove('linebreak-mode');
        console.log('🎨 Normal mode - linebreak-mode class removed');
      }
      
      // Handle <br> and <wbr> tags based on mode
      if (!linebreak) {
        // Strip <br> and <wbr> tags when not in line break mode
        main = main.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, '');
        inner = inner.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, '');
        outer = outer.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, '');
      } else {
        // Convert <br> and <wbr> to soft break opportunities (zero-width space + word break opportunity)
        main = convertBrToSoftBreaks(main);
        inner = convertBrToSoftBreaks(inner);
        outer = convertBrToSoftBreaks(outer);
      }
      
      // Convert <br> tags to soft break opportunities that allow natural text flow
      function convertBrToSoftBreaks(text) {
        // Replace <br> with a word break opportunity + zero-width space
        // This allows the browser to break at these points if needed, but doesn't force breaks
        const originalBrCount = (text.match(/<br\s*\/?>/gi) || []).length;
        const originalWbrCount = (text.match(/<wbr\s*\/?>/gi) || []).length;
        
        // Convert <br> to <wbr> + zero-width space
        let converted = text.replace(/<br\s*\/?>/gi, '<wbr>&#8203;');
        
        // Ensure existing <wbr> tags also have zero-width space for consistency
        converted = converted.replace(/<wbr\s*>/gi, '<wbr>&#8203;');
        
        const finalWbrCount = (converted.match(/<wbr>/gi) || []).length;
        
        console.log('🔄 Converting BR/WBR to soft breaks:', {
          originalBrCount,
          originalWbrCount,
          finalWbrCount,
          textSample: text.substring(0, 100),
          convertedSample: converted.substring(0, 100)
        });
        
        return converted;
      }
      
      // Helper function to convert block divs to inline elements in commentary
      function processCommentaryHTML(html) {
        // Convert divs with width:100% or margin styles to spans
        const processed = html
          // Replace div tags with spans, preserving the content
          .replace(/<div\s+style="[^"]*(?:width:\s*100%|margin-bottom)[^"]*"[^>]*>/gi, '<span>')
          .replace(/<div\s+class="[^"]*"[^>]*>/gi, '<span>')
          .replace(/<div[^>]*>/gi, '<span>')
          .replace(/<\/div>/gi, '</span> '); // Add space after closing to maintain word separation
        
        
        return processed;
      }
      
      
      // Debug final text before setting innerHTML
      if (linebreak) {
        console.log('📝 Final text before innerHTML:', {
          mainContainsWbr: main.includes('<wbr>'),
          innerContainsWbr: inner.includes('<wbr>'),
          outerContainsWbr: outer.includes('<wbr>'),
          mainSample: main.substring(0, 150),
          innerProcessed: processCommentaryHTML(inner).substring(0, 150)
        });
      }
      
      textSpans.main.innerHTML = main;
      textSpans.inner.innerHTML = processCommentaryHTML(inner);
      textSpans.outer.innerHTML = processCommentaryHTML(outer);

      // DEBUG: Check final DOM state in linebreak mode
      if (linebreak) {
        setTimeout(() => {
          const rootHasClass = containers.el.classList.contains('linebreak-mode');
          const mainDisplay = getComputedStyle(textSpans.main).display;
          const innerDisplay = getComputedStyle(textSpans.inner).display;
          console.log('🔍 FINAL DOM STATE CHECK:', {
            rootHasLinebreakClass: rootHasClass,
            mainSpanDisplay: mainDisplay,
            innerSpanDisplay: innerDisplay,
            mainHtmlSample: textSpans.main.innerHTML.substring(0, 120),
            innerHtmlSample: textSpans.inner.innerHTML.substring(0, 120),
            mainContainsBr: textSpans.main.innerHTML.includes('<br>'),
            innerContainsBr: textSpans.inner.innerHTML.includes('<br>')
          });
        }, 100);
      }



      const containerHeight = Math.max(...["main", "inner", "outer"].map(t => containers[t].el.offsetHeight));
      containers.el.style.height = `${containerHeight}px`;
      
      
      // Check for excessive spacing after render
      this.checkExcessiveSpacing();
      
      if (renderCallback)
        renderCallback();
      } catch (error) {
        console.error('Render error:', error);
        throw error;
      }
    },
    
    checkExcessiveSpacing() {
      // Get actual content heights
      const mainTextHeight = textSpans.main.offsetHeight;
      const innerTextHeight = textSpans.inner.offsetHeight;
      const outerTextHeight = textSpans.outer.offsetHeight;
      
      // Get container heights (including spacers)
      const mainContainerHeight = containers.main.el.offsetHeight;
      const innerContainerHeight = containers.inner.el.offsetHeight;
      const outerContainerHeight = containers.outer.el.offsetHeight;
      
      // Calculate spacing ratios
      const mainSpacingRatio = mainContainerHeight > 0 ? mainTextHeight / mainContainerHeight : 0;
      const innerSpacingRatio = innerContainerHeight > 0 ? innerTextHeight / innerContainerHeight : 0;
      const outerSpacingRatio = outerContainerHeight > 0 ? outerTextHeight / outerContainerHeight : 0;
      
      // Check for excessive spacing
      const excessiveThreshold = LAYOUT_CONSTANTS.EXCESSIVE_SPACING_THRESHOLD;
      const spacingIssues = [];
      
      if (mainSpacingRatio > 0 && mainSpacingRatio < excessiveThreshold) {
        spacingIssues.push({
          section: 'main',
          textHeight: mainTextHeight,
          containerHeight: mainContainerHeight,
          ratio: mainSpacingRatio,
          excessSpace: mainContainerHeight - mainTextHeight
        });
      }
      
      if (innerSpacingRatio > 0 && innerSpacingRatio < excessiveThreshold) {
        spacingIssues.push({
          section: 'inner',
          textHeight: innerTextHeight,
          containerHeight: innerContainerHeight,
          ratio: innerSpacingRatio,
          excessSpace: innerContainerHeight - innerTextHeight
        });
      }
      
      if (outerSpacingRatio > 0 && outerSpacingRatio < excessiveThreshold) {
        spacingIssues.push({
          section: 'outer',
          textHeight: outerTextHeight,
          containerHeight: outerContainerHeight,
          ratio: outerSpacingRatio,
          excessSpace: outerContainerHeight - outerTextHeight
        });
      }
      
      if (spacingIssues.length > 0) {
        // Store spacing issues for debugging
        this.spacingIssues = spacingIssues;
      } else {
        this.spacingIssues = [];
      }
    },
    
    // Cleanup method to remove event listeners and clear DOM
    destroy() {
      // Remove resize event listener
      if (resizeEvent) {
        window.removeEventListener("resize", resizeEvent);
        resizeEvent = null;
      }
      
      // Clear text content
      textSpans.main.innerHTML = '';
      textSpans.inner.innerHTML = '';
      textSpans.outer.innerHTML = '';
      
      // Clear spacer heights
      this.spacerHeights = {
        start: 0,
        inner: 0,
        outer: 0,
        end: 0
      };
      
      // Reset CSS variables
      styleManager.updateSpacersVars(this.spacerHeights);
      
      // Clear root container
      if (containers.el) {
        containers.el.innerHTML = '';
        containers.el.style.height = '';
      }
    }
  };
  
  return rendererObject;
}

