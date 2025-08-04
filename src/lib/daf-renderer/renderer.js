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
        // Store original text for resize handler
        const originalMain = main;
        const originalInner = inner;
        const originalOuter = outer;
        
        // Add/remove linebreak-mode class based on whether we're using line breaks
        if (linebreak) {
          containers.el.classList.add('linebreak-mode');
        } else {
          containers.el.classList.remove('linebreak-mode');
        }
        
        // Handle <br> and <wbr> tags based on mode
        if (!linebreak) {
          // Strip <br> and <wbr> tags when not in line break mode - both replaced with space
          main = main.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, ' ');
          inner = inner.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, ' ');
          outer = outer.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, ' ');
        } else {
          // Convert <br> and <wbr> to soft break opportunities (zero-width space + word break opportunity)
          main = convertBrToSoftBreaks(main);
          inner = convertBrToSoftBreaks(inner);
          outer = convertBrToSoftBreaks(outer);
        }
        
        // Calculate spacers with processed text (after <wbr> handling)
        this.spacerHeights = calculateSpacers(main, inner, outer, clonedOptions, containers.dummy);
        if (this.spacerHeights instanceof Error) {
          throw this.spacerHeights;
        }
        Object.assign(rendererObject.spacerHeights, this.spacerHeights);
        
        const resizeHandler = () => {
          // Process text the same way for resize calculations
          let resizeMain = originalMain;
          let resizeInner = originalInner;
          let resizeOuter = originalOuter;
          
          if (!linebreak) {
            // Both <br> and <wbr> get replaced with space
            resizeMain = resizeMain.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, ' ');
            resizeInner = resizeInner.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, ' ');
            resizeOuter = resizeOuter.replace(/<br\s*\/?>/gi, ' ').replace(/<wbr\s*\/?>/gi, ' ');
          } else {
            resizeMain = convertBrToSoftBreaks(resizeMain);
            resizeInner = convertBrToSoftBreaks(resizeInner);
            resizeOuter = convertBrToSoftBreaks(resizeOuter);
          }
          
          this.spacerHeights = calculateSpacers(resizeMain, resizeInner, resizeOuter, clonedOptions, containers.dummy);
          if (!(this.spacerHeights instanceof Error)) {
            Object.assign(rendererObject.spacerHeights, this.spacerHeights);
            styleManager.updateSpacersVars(this.spacerHeights);
          }
          if (resizeCallback)
            resizeCallback();
        };
        resizeEvent = debounce(resizeHandler, RESIZE_DEBOUNCE_DELAY);
        window.addEventListener("resize", resizeEvent);
        
        styleManager.updateSpacersVars(this.spacerHeights);
        styleManager.manageExceptions(this.spacerHeights);
        Object.assign(rendererObject.spacerHeights, this.spacerHeights);
      
      // Convert <br> tags to soft break opportunities that allow natural text flow
      function convertBrToSoftBreaks(text) {
        // Replace <br> with a space + word break opportunity
        // This provides both spacing and break opportunity
        let converted = text.replace(/<br\s*\/?>/gi, ' <wbr>');
        
        // For existing <wbr> tags, check if they need a space before them
        // If there's no space before the <wbr>, add one to prevent words from joining
        converted = converted.replace(/([^\s>])<wbr>/gi, '$1 <wbr>');
        
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
      
      textSpans.main.innerHTML = main;
      textSpans.inner.innerHTML = processCommentaryHTML(inner);
      textSpans.outer.innerHTML = processCommentaryHTML(outer);



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

