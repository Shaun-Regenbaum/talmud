/**
 * @fileoverview Style Manager for Daf Renderer
 * 
 * This module manages CSS classes and dynamic CSS variables for the daf renderer.
 * It handles:
 * - Applying CSS classes to container elements
 * - Setting CSS custom properties (variables) for dynamic values
 * - Managing layout exceptions and special cases
 * - Updating styles based on amud (page side) changes
 * 
 * The style manager works in conjunction with styles.css to create the
 * visual layout of the Talmud page.
 */

// Import styles directly
import './styles.css';

// Define class names directly (not using CSS modules)
const classes = {
  dafRoot: 'dafRoot',
  outer: 'outer',
  inner: 'inner',
  main: 'main',
  spacer: 'spacer',
  start: 'start',
  mid: 'mid',
  end: 'end',
  innerMid: 'innerMid',
  outerMid: 'outerMid',
  text: 'text'
};

const sideSpacersClasses = {
  start: [classes.spacer, classes.start],
  mid: [classes.spacer, classes.mid],
  end: [classes.spacer, classes.end]
}

const containerClasses = {
  el: classes.dafRoot,
  outer: {
    el: classes.outer,
    spacers: sideSpacersClasses,
    text: classes.text,
  },
  inner: {
    el: classes.inner,
    spacers: sideSpacersClasses,
    text: classes.text,
  },
  main: {
    el: classes.main,
    spacers: {
      start: sideSpacersClasses.start,
      inner: [classes.spacer, classes.innerMid],
      outer: [classes.spacer, classes.outerMid]
    },
    text: classes.text
  }
}


function addClasses(element, classNames) {
  if (Array.isArray(classNames))
    element.classList.add(...classNames)
  else
    element.classList.add(classNames)
}

// Keep track of the root element to set CSS variables on
let rootElement = null;

function setVars(object, prefix = "") {
  // Try to use stored root element first, then fall back to querySelector
  let targetElement = rootElement;
  
  if (!targetElement) {
    // Fall back to finding it in DOM if not yet stored
    targetElement = document.querySelector('.dafRoot');
    if (!targetElement) {
      console.error('Could not find .dafRoot element for setting CSS variables');
      return;
    }
    // Update our reference
    rootElement = targetElement;
  }

  Object.entries(object).forEach(([key, value]) => {
    if (typeof value == "string") {
      targetElement.style.setProperty(`--${prefix}${key}`, value);
    } else if (typeof value == "object") {
      setVars(value, `${key}-`);
    }
  })
}


let appliedOptions;

/**
 * Style manager singleton with methods for managing daf renderer styles
 */
export default {
  /**
   * Applies CSS classes to container elements recursively
   * @param {Object} containers - Container elements from renderer
   * @param {Object} classesMap - Mapping of container keys to CSS classes
   */
  applyClasses(containers, classesMap = containerClasses) {
    // Reset root element reference (in case DOM changed)
    rootElement = containers.el;
    
    for (const key in containers) {
      if (key in classesMap) {
        const value = classesMap[key];
        if (typeof value === "object" && !Array.isArray(value)) {
          this.applyClasses(containers[key], value);
        } else {
          addClasses(containers[key], value);
        }
      }
    }
  },
  /**
   * Updates CSS variables with option values
   * @param {Object} options - Options object with layout values
   */
  updateOptionsVars(options) {
    appliedOptions = options;
    setVars(options)
  },
  
  /**
   * Updates CSS variables for spacer heights
   * @param {Object} spacerHeights - Object with start, inner, outer, end values
   */
  updateSpacersVars(spacerHeights) {
    setVars(
      Object.fromEntries(
        Object.entries(spacerHeights).map(
          ([key, value]) => ([key, String(value) + 'px']))
      ),
      "spacerHeights-"
    );
  },
  
  /**
   * Updates float direction based on amud (page side)
   * @param {boolean} amudB - True if rendering amud bet (right side)
   */
  updateIsAmudB(amudB) {
    setVars({
      innerFloat: amudB ? "right" : "left",
      outerFloat: amudB ? "left" : "right"
    })
  },
  
  /**
   * Manages special layout exceptions when commentary is minimal
   * @param {Object} spacerHeights - Spacer heights object with exception flag
   */
  manageExceptions(spacerHeights) {
    if (!spacerHeights.exception) {
      setVars({
        hasOuterStartGap: "0",
        hasInnerStartGap: "0",
        outerStartWidth: "50%",
        innerStartWidth: "50%",
        innerPadding: appliedOptions.innerPadding,
        outerPadding: appliedOptions.outerPadding,
      });
      return;
    }
    if (spacerHeights.exception === 1) {
      setVars({
        hasInnerStartGap: "1",
        innerStartWidth: "100%",
        outerStartWidth: "0%",
        innerPadding: "0px",
        outerPadding: "0px",
      })
    } else if (spacerHeights.exception === 2) {
      setVars({
        hasOuterStartGap: "1",
        outerStartWidth: "100%",
        innerStartWidth: "0%",
        innerPadding: "0px",
        outerPadding: "0px"
      })
    }
  }
}