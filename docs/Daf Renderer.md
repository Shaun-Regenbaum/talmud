# Daf-Renderer: In-Depth Documentation

## Overview

The daf-renderer is a JavaScript library that creates authentic Vilna Shas Talmud page layouts in web applications. It reproduces the traditional three-column layout with dynamic spacing and proper Hebrew/Aramaic text handling.

## Core Architecture

The daf-renderer creates three main text layers:
- **Main text** (Gemara) - center column
- **Inner commentary** (Rashi) - typically right side in Hebrew layouts
- **Outer commentary** (Tosafot) - typically left side in Hebrew layouts

### Key Components

```
/src/lib/daf-renderer/
├── renderer.js              # Main rendering engine
├── options.js              # Configuration management
├── calculate-spacers.js    # Layout calculations without line breaks
├── calculate-spacers-breaks.js  # Layout calculations with line breaks
├── style-manager.js        # CSS variable and class management
└── styles.css              # Core CSS styles
```

## Line Break Processing

The renderer has two distinct modes for handling text input:

### Mode 1: Without Line Breaks (`linebreak` = null/false)
- Text is processed as continuous strings
- Uses area-based calculations to determine layout
- Relies on `calculate-spacers.js` for positioning
- Less precise for traditional Talmud formatting

### Mode 2: With Line Breaks (`linebreak` = "br")

When you pass `<br>` tags in your text, the renderer performs sophisticated line-by-line processing:

```javascript
// Line break processing flow
let [mainSplit, innerSplit, outerSplit] = [main, inner, outer].map(text => {
  containers.dummy.innerHTML = text;
  const brs = containers.dummy.querySelectorAll("br"); // Finds all <br> tags
  const splitFragments = []
  
  brs.forEach((node, index) => {
    const range = document.createRange();
    range.setEndBefore(node);
    // Extracts content before each <br>
    splitFragments.push(range.extractContents());
  })
  
  return splitFragments.map(fragment => {
    const el = document.createElement("div");
    el.append(fragment);
    return el.innerHTML; // Returns array of discrete lines
  })
});
```

**Key insight**: Each `<br>` tag becomes a discrete line boundary. The renderer converts your HTML with `<br>` tags into an array of individual line segments, allowing for precise control over layout and spacing.

## Layout Patterns

After splitting text on `<br>` tags, the renderer determines which of three layout patterns to use:

### 1. Double-Wrap Pattern
- Main text is shortest
- Both commentaries wrap around the main text
- Used when main text has minimal content
- Creates the classic "wrapped" appearance

### 2. Stairs Pattern
- One commentary extends beyond main text
- Creates a "stepped" layout appearance
- Determined by comparing relative text heights
- Common in pages with uneven commentary lengths

### 3. Double-Extend Pattern
- Main text is longest
- Both commentaries are shorter
- Standard layout for most Talmud pages
- Maintains traditional proportions

### Pattern Selection Logic

```javascript
switch (breaks.main.length) {
  case 0: // Double-wrap pattern
    spacerHeights.inner = mainHeight;
    spacerHeights.outer = mainHeight;
    break;
    
  case 1: // Stairs pattern  
    // Complex logic for determining which commentary extends
    // Based on relative heights and line counts
    break;
    
  case 2: // Double-extend pattern
    spacerHeights.inner = afterBreak.inner;
    spacerHeights.outer = afterBreak.outer;
    break;
}
```

## Spacer System

The renderer uses a sophisticated spacer system to maintain authentic Vilna layout:

```
┌─────────────────────────────────────┐
│  Tosafot    │   Main Text  │ Rashi  │
│  (outer)    │   (Gemara)   │ (inner)│
│             │              │        │
│  ┌─────────┐│              │┌──────┐│
│  │ spacer  ││              ││spacer││
│  └─────────┘│              │└──────┘│
│             │              │        │
└─────────────────────────────────────┘
```

### Spacer Types

1. **Start Spacers**
   - Top alignment areas before text begins
   - Ensures proper vertical positioning
   - Calculated based on header heights

2. **Mid Spacers**
   - Dynamic height adjustments between text sections
   - Maintains alignment between corresponding commentary sections
   - Calculated based on relative text lengths

3. **End Spacers**
   - Bottom padding when one column extends beyond others
   - Ensures balanced page appearance
   - Only applied when needed

## Hebrew/Aramaic Text Handling

The renderer includes specialized features for Hebrew and Aramaic text:

### Font System
```javascript
// Font configuration
fontFamily: {
  main: "Vilna",      // Traditional Vilna font for Gemara
  inner: "Rashi",     // Rashi script for inner commentary
  outer: "Vilna"      // Vilna font for Tosafot
}
```

### RTL Support
- Full right-to-left text direction support
- Proper column positioning for Hebrew layouts
- Text justification for authentic appearance

### Special Elements

#### Hadran Detection
```javascript
const hadran = "הדרן עלך";
const hadranRegex = new RegExp(`<br>[\\w\\s]*${hadran}[\\w\\s]*<br>`, 'g');
```
- Automatically detects tractate endings
- Applies special formatting for Hadran text
- Centers and styles appropriately

#### Header Formatting
- `{text}` bracket notation for special headers
- Automatic styling for section markers
- Preserves traditional typography

## CSS Variable System

The layout is controlled through dynamic CSS custom properties:

```css
/* Core layout variables */
--contentWidth: 650px;           /* Total page width */
--mainWidth: 42%;               /* Main text column width */
--innerWidth: 33%;              /* Rashi column width */
--outerWidth: 25%;              /* Tosafot column width */

/* Dynamic spacer heights */
--spacerHeights-start: [calculated]px;
--spacerHeights-inner: [calculated]px;
--spacerHeights-outer: [calculated]px;

/* Font sizes */
--fontSize-main: 20px;
--fontSize-inner: 13.5px;
--fontSize-outer: 13.5px;
```

These variables are recalculated dynamically based on:
- Text content lengths
- Window dimensions
- User preferences
- Line break positions

## Usage Examples

### Basic Implementation

```javascript
import dafRenderer from '$lib/daf-renderer/renderer';

// Initialize renderer
const container = document.getElementById('talmud-container');
const options = {
  contentWidth: 650,
  fontFamily: {
    main: "Vilna",
    inner: "Rashi",
    outer: "Vilna"
  },
  fontSize: {
    main: 20,
    inner: 13.5,
    outer: 13.5
  }
};

const renderer = dafRenderer(container, options);

// Render with line breaks
const mainText = "גמרא line 1<br>גמרא line 2<br>גמרא line 3";
const rashiText = "רש״י commentary 1<br>רש״י commentary 2";
const tosafotText = "תוספות commentary<br>more תוספות";

renderer.render(
  mainText,     // Gemara text with <br> tags
  rashiText,    // Rashi commentary with <br> tags  
  tosafotText,  // Tosafot commentary with <br> tags
  "a",          // Amud (a or b)
  "br",         // Line break mode - IMPORTANT!
  onRendered,   // Callback when rendering complete
  onResized     // Callback when layout changes
);
```

### Advanced Configuration

```javascript
const advancedOptions = {
  // Layout configuration
  contentWidth: 700,
  mainWidth: 45,    // Percentage
  
  // Typography
  fontFamily: {
    main: "custom-vilna-font",
    inner: "custom-rashi-font",
    outer: "custom-tosafot-font"
  },
  
  // Font sizes
  fontSize: {
    main: 22,
    inner: 14,
    outer: 14,
    smalls: 11,     // Small text elements
    folio: 24       // Page numbers
  },
  
  // Text direction
  direction: "rtl",
  
  // Advanced features
  useNormalSpaces: false,
  useStickyLines: true
};
```

## Text Processing Flow

Here's the complete flow of how text with line breaks gets processed:

1. **Input Phase**
   - Text with `<br>` tags is passed to renderer
   - Each text section (main, inner, outer) is processed separately

2. **Line Splitting**
   - `<br>` tags are identified using DOM queries
   - Text is split into discrete line segments
   - Each segment is stored as separate HTML content

3. **Layout Analysis**
   - Line counts determine layout pattern
   - Heights are measured for each text segment
   - Relative proportions are calculated

4. **Spacer Calculation**
   - Start spacers align top boundaries
   - Mid spacers maintain inter-column alignment
   - End spacers balance bottom boundaries

5. **CSS Application**
   - Custom properties are updated dynamically
   - Grid layout positions elements
   - Font sizes and families are applied

6. **DOM Rendering**
   - Three-column structure is created
   - Text segments are inserted with proper spacing
   - Interactive layers are established

7. **Post-Processing**
   - Resize observers monitor layout changes
   - Callbacks notify completion
   - Selection layers are activated

## Advanced Features

### Dynamic Layer Selection

The `SpacerAwareSelector` class provides intelligent text selection:
- Detects which layer contains text at mouse position
- Enables selection only on the active layer
- Prevents interference between overlapping text layers
- Maintains traditional reading experience

### Responsive Scaling
- Configurable content width adapts to screen size
- Proportional font sizing maintains readability
- Layout proportions preserved across devices
- Window resize handling with debouncing

### Real-time Layout Adjustment
- Window resize triggers recalculation
- Dynamic spacer height updates
- CSS variable modifications
- Smooth transitions between states

## Best Practices

### 1. Prepare Text with Proper Line Breaks
```javascript
// Good: Clear line breaks for structure
const mainText = `
  תנו רבנן<br>
  שלשה דברים<br>
  צריך אדם לומר בתוך ביתו<br>
  ערב שבת עם חשכה
`;

// Avoid: Continuous text without breaks
const mainText = "תנו רבנן שלשה דברים צריך אדם לומר בתוך ביתו ערב שבת עם חשכה";
```

### 2. Match Commentary to Main Text Sections
- Align commentary breaks with related main text sections
- Maintain logical connections between layers
- Consider visual balance in break placement

### 3. Handle Special Characters
- Preserve Hebrew punctuation marks
- Maintain proper spacing around parentheses
- Handle abbreviation marks (גרשיים) correctly

### 4. Optimize for Performance
- Minimize DOM manipulations
- Cache renderer instances when possible
- Use callbacks for post-render operations
- Batch updates when changing multiple texts

## Troubleshooting

### Common Issues

1. **Text Not Aligning Properly**
   - Ensure `linebreak` parameter is set to "br"
   - Check that `<br>` tags are properly formatted
   - Verify font files are loaded

2. **Layout Jumping**
   - Wait for fonts to load before rendering
   - Use consistent font-size units
   - Implement proper resize debouncing

3. **Selection Not Working**
   - Verify SpacerAwareSelector is initialized
   - Check z-index of text layers
   - Ensure no CSS conflicts with selection

### Debug Mode

Enable console logging for troubleshooting:
```javascript
// Add to options
debug: true,
logCalculations: true
```

## Integration with Talmud Study Application

The daf-renderer integrates seamlessly with the broader Talmud study application:

1. **Data Flow**
   - Sefaria API provides base text
   - HebrewBooks scraper adds commentary
   - Text processor adds `<br>` tags
   - Renderer creates final layout

2. **Interactive Features**
   - Click handlers on text segments
   - Hover effects for translations
   - Context menus for study tools
   - AI-powered analysis integration

3. **Caching Strategy**
   - Rendered layouts cached in memory
   - Text segments stored separately
   - Spacer calculations memoized
   - Font metrics preserved

## Conclusion

The daf-renderer provides a sophisticated system for creating authentic Talmud page layouts in web applications. Its line break processing, dynamic spacer system, and Hebrew text handling combine to produce a reading experience that honors the traditional Vilna Shas format while adding modern digital capabilities.

The key to effective use is understanding how `<br>` tags create discrete line boundaries that the renderer uses to calculate precise spacing and maintain the authentic three-column layout that has defined Talmud study for generations.