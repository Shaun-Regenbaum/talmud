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
  // Always try to find the root element fresh
  const currentRoot = document.querySelector('.dafRoot');
  if (!currentRoot) {
    console.error('Could not find .dafRoot element for setting CSS variables');
    return;
  }
  
  // Update our reference if it changed
  if (currentRoot !== rootElement) {
    rootElement = currentRoot;
  }

  Object.entries(object).forEach(([key, value]) => {
    if (typeof value == "string") {
      rootElement.style.setProperty(`--${prefix}${key}`, value);
    } else if (typeof value == "object") {
      setVars(value, `${key}-`);
    }
  })
}


let appliedOptions;
export default {
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
  updateOptionsVars(options) {
    appliedOptions = options;
    setVars(options)
  },
  updateSpacersVars(spacerHeights) {
    setVars(
      Object.fromEntries(
        Object.entries(spacerHeights).map(
          ([key, value]) => ([key, String(value) + 'px']))
      ),
      "spacerHeights-"
    );
  },
  updateIsAmudB(amudB) {
    setVars({
      innerFloat: amudB ? "right" : "left",
      outerFloat: amudB ? "left" : "right"
    })
  },
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