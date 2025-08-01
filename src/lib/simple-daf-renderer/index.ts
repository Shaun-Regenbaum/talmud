export interface DafRendererOptions {
  fontSize?: {
    main?: string;
    commentary?: string;
  };
  fontFamily?: {
    main?: string;
    rashi?: string;
    tosafot?: string;
  };
  spacing?: {
    columnGap?: string;
    sectionGap?: string;
    padding?: string;
  };
}

const defaultOptions: DafRendererOptions = {
  fontSize: {
    main: '18px',
    commentary: '14px'
  },
  fontFamily: {
    main: 'Frank Ruhl Libre, serif',
    rashi: 'Rashi, serif',
    tosafot: 'Rashi, serif'
  },
  spacing: {
    columnGap: '20px',
    sectionGap: '30px',
    padding: '40px'
  }
};

export class SimpleDafRenderer {
  private container: HTMLElement;
  private options: DafRendererOptions;
  
  constructor(container: HTMLElement, options: DafRendererOptions = {}) {
    this.container = container;
    this.options = { ...defaultOptions, ...options };
    this.setupContainer();
  }
  
  private setupContainer() {
    // Clear container and set base styles
    this.container.innerHTML = '';
    this.container.style.cssText = `
      direction: rtl;
      padding: ${this.options.spacing?.padding};
      background: #f5f5dc;
      min-height: 800px;
      font-family: ${this.options.fontFamily?.main};
      position: relative;
      overflow-x: auto;
    `;
  }
  
  render(mainText: string, rashiText: string, tosafotText: string, pageLabel: string) {
    this.setupContainer();
    
    // Create main layout structure
    const layout = document.createElement('div');
    layout.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 2fr 1fr;
      gap: ${this.options.spacing?.columnGap};
      max-width: 1200px;
      margin: 0 auto;
      align-items: start;
    `;
    
    // Left column (Rashi)
    const leftColumn = document.createElement('div');
    leftColumn.className = 'rashi-column';
    leftColumn.style.cssText = `
      font-family: ${this.options.fontFamily?.rashi};
      font-size: ${this.options.fontSize?.commentary};
      line-height: 1.6;
      text-align: justify;
    `;
    
    // Center column (Main text)
    const centerColumn = document.createElement('div');
    centerColumn.className = 'main-column';
    centerColumn.style.cssText = `
      font-family: ${this.options.fontFamily?.main};
      font-size: ${this.options.fontSize?.main};
      line-height: 1.8;
      text-align: justify;
      padding: 0 20px;
    `;
    
    // Right column (Tosafot)
    const rightColumn = document.createElement('div');
    rightColumn.className = 'tosafot-column';
    rightColumn.style.cssText = `
      font-family: ${this.options.fontFamily?.tosafot};
      font-size: ${this.options.fontSize?.commentary};
      line-height: 1.6;
      text-align: justify;
    `;
    
    // Add page label
    const pageHeader = document.createElement('div');
    pageHeader.style.cssText = `
      text-align: center;
      font-size: 24px;
      font-weight: bold;
      margin-bottom: ${this.options.spacing?.sectionGap};
      grid-column: 1 / -1;
    `;
    pageHeader.textContent = pageLabel;
    
    // Set content
    leftColumn.innerHTML = this.wrapContent(rashiText, 'rashi');
    centerColumn.innerHTML = this.wrapContent(mainText, 'main');
    rightColumn.innerHTML = this.wrapContent(tosafotText, 'tosafot');
    
    // Assemble layout
    layout.appendChild(pageHeader);
    layout.appendChild(leftColumn);
    layout.appendChild(centerColumn);
    layout.appendChild(rightColumn);
    
    this.container.appendChild(layout);
    
    // For mobile/narrow screens, stack columns
    this.addResponsiveStyles();
  }
  
  private wrapContent(html: string, type: string): string {
    // If content is empty or just whitespace, add placeholder
    if (!html || html.trim().length === 0) {
      return `<div class="${type}-placeholder" style="color: #ccc; font-style: italic;">No ${type} commentary available</div>`;
    }
    
    // Wrap in a container div for styling
    return `<div class="${type}-content">${html}</div>`;
  }
  
  private addResponsiveStyles() {
    // Check if styles already exist
    if (document.getElementById('simple-daf-renderer-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'simple-daf-renderer-styles';
    style.textContent = `
      @media (max-width: 768px) {
        .simple-daf-renderer > div {
          grid-template-columns: 1fr !important;
        }
        
        .rashi-column, .tosafot-column {
          padding: 20px;
          background: rgba(255, 255, 255, 0.5);
          border-radius: 8px;
          margin-bottom: 20px;
        }
      }
      
      /* Add some styling for Hebrew text */
      .simple-daf-renderer .gdropcap {
        font-size: 2em;
        font-weight: bold;
        float: right;
        line-height: 0.8;
        margin-left: 5px;
      }
      
      .simple-daf-renderer .shastitle7 {
        font-weight: bold;
        font-size: 1.1em;
      }
      
      /* Ensure spans are visible */
      .simple-daf-renderer span {
        display: inline;
      }
    `;
    document.head.appendChild(style);
  }
  
  destroy() {
    this.container.innerHTML = '';
  }
}