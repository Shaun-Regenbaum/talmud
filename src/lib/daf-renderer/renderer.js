import {defaultOptions, mergeAndClone} from "./options";
import calculateSpacers from "./calculate-spacers";
import styleManager from "./style-manager";
import {
  calculateSpacersBreaks,
  onlyOneCommentary
} from "./calculate-spacers-breaks";

function el(tag, parent) {
  const newEl = document.createElement(tag);
  if (parent) parent.append(newEl);
  return newEl;
}

function div(parent) {
  return el("div", parent);
}

function span(parent) {
  return el("span", parent);
}


export default function (el, options = defaultOptions) {
  const root = (typeof el === "string") ? document.querySelector(el) : el;
  if (!(root && root instanceof Element && root.tagName.toUpperCase() === "DIV")) {
    throw "Argument must be a div element or its selector"
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
  return {
    containers,
    spacerHeights: {
      start: 0,
      inner: 0,
      outer: 0,
      end: 0
    },
    amud: "a",
    render(main, inner, outer, amud = "a", linebreak, renderCallback, resizeCallback) {
      if (resizeEvent) {
        window.removeEventListener("resize", resizeEvent);
      }
      if (this.amud != amud) {
        this.amud = amud;
        styleManager.updateIsAmudB(amud == "b");
      }
      if (!linebreak) {
        this.spacerHeights = calculateSpacers(main, inner, outer, clonedOptions, containers.dummy);
        resizeEvent = () => {
          this.spacerHeights = calculateSpacers(main, inner, outer, clonedOptions, containers.dummy);
          styleManager.updateSpacersVars(this.spacerHeights);
          console.log("resizing");
          if (resizeCallback)
            resizeCallback();
        }
        window.addEventListener("resize", resizeEvent);
      }
      else {
        let [mainSplit, innerSplit, outerSplit] = [main, inner, outer].map( text => {
          containers.dummy.innerHTML = text;
          const divRanges = Array.from(containers.dummy.querySelectorAll("div")).map(div => {
            const range = document.createRange();
            range.selectNode(div);
            return range;
          })

          const brs = containers.dummy.querySelectorAll(linebreak);
          const splitFragments = []
          brs.forEach((node, index) => {
            const range = document.createRange();
            range.setEndBefore(node);
            if (index == 0) {
              range.setStart(containers.dummy, 0);
            } else {
              const prev = brs[index - 1];
              range.setStartAfter(prev);
            }
            divRanges.forEach( (divRange, i) => {
              const inBetween = range.compareBoundaryPoints(Range.START_TO_START, divRange) < 0 && range.compareBoundaryPoints(Range.END_TO_END, divRange) > 0;
              if (inBetween) {
                splitFragments.push(divRange.extractContents());
                divRanges.splice(i, 1);
              }
            });

            splitFragments.push(range.extractContents());
          })

          return splitFragments.map(fragment => {
            const el = document.createElement("div");
            el.append(fragment);
            return el.innerHTML;
          })
        });

        containers.dummy.innerHTML = "";

        const hasInner = innerSplit.length != 0;
        const hasOuter = outerSplit.length != 0;

        if (hasInner != hasOuter) {
          const withText = hasInner ? innerSplit : outerSplit;
          const fixed = onlyOneCommentary(withText, clonedOptions, dummy);
          if (fixed) {
            if (amud == "a") {
              innerSplit = fixed[0];
              outerSplit = fixed[1];
            } else {
              innerSplit = fixed[1];
              outerSplit = fixed[0];
            }
            inner = innerSplit.join('<br>');
            outer = outerSplit.join('<br>');
          }
        }

        this.spacerHeights = calculateSpacersBreaks(mainSplit, innerSplit, outerSplit, clonedOptions, containers.dummy);
        resizeEvent = () => {
          this.spacerHeights = calculateSpacersBreaks(mainSplit, innerSplit, outerSplit, clonedOptions, containers.dummy);
          styleManager.updateSpacersVars(this.spacerHeights);
          if (resizeCallback)
            resizeCallback();
          console.log("resizing")
        }
        window.addEventListener('resize', resizeEvent)
      }
      
      // Clear previous content first
      textSpans.main.innerHTML = '';
      textSpans.inner.innerHTML = '';
      textSpans.outer.innerHTML = '';
      
      // Update ALL CSS variables BEFORE adding content
      // This ensures the options vars are reapplied on each render
      styleManager.updateOptionsVars(clonedOptions);
      styleManager.updateSpacersVars(this.spacerHeights);
      styleManager.manageExceptions(this.spacerHeights);
      
      // Log current state for debugging
      console.log('Rendering with spacer heights:', this.spacerHeights);
      console.log('Root element classes:', containers.el.className);
      
      // Ensure root has minimum height
      if (!containers.el.style.minHeight) {
        containers.el.style.minHeight = '600px';
      }
      
      // Now add the new content
      textSpans.main.innerHTML = main;
      textSpans.inner.innerHTML = inner;
      textSpans.outer.innerHTML = outer;

      // Calculate height after a delay to allow browser layout
      setTimeout(() => {
        // Ensure all containers are visible
        ['main', 'inner', 'outer'].forEach(type => {
          const el = containers[type].el;
          if (el && el.style.display === 'none') {
            el.style.display = '';
          }
        });
        
        const containerHeight = Math.max(...["main", "inner", "outer"].map(t => {
          const el = containers[t].el;
          // Force layout calculation
          const height = Math.max(
            el.scrollHeight || 0,
            el.offsetHeight || 0,
            el.getBoundingClientRect().height || 0
          );
          console.log(`${t} container height:`, height);
          return height;
        }));
        
        if (containerHeight > 0) {
          containers.el.style.height = `${containerHeight}px`;
          console.log('Set container height to:', containerHeight);
        } else {
          // Fallback height if calculation fails
          containers.el.style.height = '800px';
          console.warn('Using fallback height');
        }
        
        if (renderCallback)
          renderCallback();
      }, 200);
    },
  }
}

