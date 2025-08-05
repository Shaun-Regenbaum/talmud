/**
 * Spacer-aware text selector for daf-renderer layers
 * 
 * Dynamically enables text selection on the layer that contains actual text
 * at the current mouse position, while disabling selection on other layers.
 * Uses spacer detection to determine which layer has text content.
 */

interface LayerInfo {
	name: 'main' | 'inner' | 'outer';
	element: HTMLElement;
	textElement: HTMLElement;
	spacers: HTMLElement[];
}

export class SpacerAwareSelector {
	private container: HTMLDivElement;
	private layers: LayerInfo[] = [];
	private currentActiveLayer: string | null = null;
	private styleElement: HTMLStyleElement | null = null;
	private overlayElement: HTMLDivElement | null = null;
	private updateTimer: number | null = null;

	constructor(container: HTMLDivElement) {
		this.container = container;
	}

	enable() {
		console.log('Enabling spacer-aware selector...');
		
		// Create style element for CSS overrides
		this.styleElement = document.createElement('style');
		this.styleElement.id = 'spacer-aware-styles';
		document.head.appendChild(this.styleElement);
		
		// Wait for daf-renderer to initialize
		setTimeout(() => {
			this.mapLayers();
			this.createOverlay();
			this.updateStyles('outer'); // Start with outer layer active
			
			console.log('Spacer-aware selector enabled');
		}, 100);
	}

	disable() {
		if (this.styleElement) {
			this.styleElement.remove();
			this.styleElement = null;
		}
		
		if (this.overlayElement) {
			this.overlayElement.remove();
			this.overlayElement = null;
		}
		
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = null;
		}
		
		console.log('Spacer-aware selector disabled');
	}

	private mapLayers() {
		this.layers = [];
		
		const layerNames: Array<'main' | 'inner' | 'outer'> = ['main', 'inner', 'outer'];
		
		layerNames.forEach(name => {
			const layer = this.container.querySelector(`.${name}`) as HTMLElement;
			if (!layer) return;
			
			const textElement = layer.querySelector('.text') as HTMLElement;
			if (!textElement) return;
			
			// Find all spacers in this layer
			const spacers = Array.from(layer.querySelectorAll('.spacer')) as HTMLElement[];
			
			this.layers.push({
				name,
				element: layer,
				textElement,
				spacers
			});
			
			console.log(`Mapped ${name} layer with ${spacers.length} spacers`);
		});
	}

	private createOverlay() {
		// Create transparent overlay for visual debugging (not used for events)
		this.overlayElement = document.createElement('div');
		this.overlayElement.className = 'spacer-detection-overlay';
		this.overlayElement.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 9998;
			pointer-events: none;
			background: transparent;
		`;
		
		const dafRoot = this.container.querySelector('.dafRoot') || this.container;
		if (dafRoot && dafRoot.style.position !== 'relative' && dafRoot.style.position !== 'absolute') {
			(dafRoot as HTMLElement).style.position = 'relative';
		}
		dafRoot.appendChild(this.overlayElement);
		
		// Listen for mouse movement on the container
		this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
	}

	private handleMouseMove(e: MouseEvent) {
		// Debounce layer switching to avoid excessive updates
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
		
		this.updateTimer = window.setTimeout(() => {
			const activeLayer = this.getLayerWithTextAt(e.clientX, e.clientY);
			
			// Switch to the layer that has text at current mouse position
			if (activeLayer !== this.currentActiveLayer) {
				this.updateStyles(activeLayer);
			}
		}, 50);
	}


	private getLayerWithTextAt(clientX: number, clientY: number): string | null {
		// Check each layer in priority order (outer, inner, main)
		// Uses same detection logic as MousePositionLogger for consistency
		for (const layer of this.layers) {
			const status = this.checkLayerAtPosition(layer, clientX, clientY);
			if (status === 'TEXT HERE') {
				return layer.name;
			}
		}
		
		// No layer has text at this position
		return null;
	}

	private checkLayerAtPosition(layer: LayerInfo, clientX: number, clientY: number): string {
		// First check if we're within the text element bounds
		const textRect = layer.textElement.getBoundingClientRect();
		
		if (clientX < textRect.left || clientX > textRect.right ||
		    clientY < textRect.top || clientY > textRect.bottom) {
			return 'outside bounds';
		}
		
		// Check if we're over a spacer
		for (const spacer of layer.spacers) {
			const spacerRect = spacer.getBoundingClientRect();
			
			if (clientX >= spacerRect.left && clientX <= spacerRect.right &&
			    clientY >= spacerRect.top && clientY <= spacerRect.bottom) {
				// We're over a spacer - no text here
				return 'spacer (no text)';
			}
		}
		
		// Not over a spacer, check if there's actual text
		const hasText = this.hasTextAtPosition(layer, clientX, clientY);
		
		return hasText ? 'TEXT HERE' : 'empty space';
	}

	private hasTextAtPosition(layer: LayerInfo, clientX: number, clientY: number): boolean {
		// First check if we're within the text element bounds
		const textRect = layer.textElement.getBoundingClientRect();
		
		if (clientX < textRect.left || clientX > textRect.right ||
		    clientY < textRect.top || clientY > textRect.bottom) {
			// Outside bounds - no text
			return false;
		}
		
		// Check if we're over a spacer
		for (const spacer of layer.spacers) {
			const spacerRect = spacer.getBoundingClientRect();
			
			if (clientX >= spacerRect.left && clientX <= spacerRect.right &&
			    clientY >= spacerRect.top && clientY <= spacerRect.bottom) {
				// Over a spacer - no text here
				return false;
			}
		}
		
		// Not over a spacer, check if there's actual text
		const textSpans = layer.textElement.querySelectorAll('span:not(.spacer)');
		
		for (const span of textSpans) {
			if (!span.textContent || span.textContent.trim() === '') continue;
			
			const spanRect = span.getBoundingClientRect();
			
			if (clientX >= spanRect.left && clientX <= spanRect.right &&
			    clientY >= spanRect.top && clientY <= spanRect.bottom) {
				return true;
			}
		}
		
		return false;
	}

	private updateStyles(activeLayer: string | null) {
		if (this.currentActiveLayer === activeLayer) return;
		
		console.log(`Switching text selection from ${this.currentActiveLayer} to ${activeLayer}`);
		this.currentActiveLayer = activeLayer;
		
		// Disable all layers first
		const layerNames = ['main', 'inner', 'outer'];
		layerNames.forEach(name => {
			const layer = this.container.querySelector(`.${name}`) as HTMLElement;
			if (!layer) return;
			
			// Disable layer and text elements
			layer.style.pointerEvents = 'none';
			layer.style.userSelect = 'none';
			layer.style.webkitUserSelect = 'none';
			layer.style.mozUserSelect = 'none';
			
			const textEl = layer.querySelector('.text') as HTMLElement;
			if (textEl) {
				textEl.style.pointerEvents = 'none';
				textEl.style.userSelect = 'none';
				textEl.style.webkitUserSelect = 'none';
				textEl.style.mozUserSelect = 'none';
			}
			
			// Set appropriate z-index
			layer.style.zIndex = name === activeLayer ? '100' : (name === 'outer' ? '3' : name === 'inner' ? '2' : '1');
		});
		
		// Enable only the active layer
		if (activeLayer) {
			const activeLayerEl = this.container.querySelector(`.${activeLayer}`) as HTMLElement;
			if (activeLayerEl) {
				// Enable the layer
				activeLayerEl.style.pointerEvents = 'auto';
				activeLayerEl.style.userSelect = 'text';
				activeLayerEl.style.webkitUserSelect = 'text';
				activeLayerEl.style.mozUserSelect = 'text';
				
				// Enable the text element
				const textEl = activeLayerEl.querySelector('.text') as HTMLElement;
				if (textEl) {
					textEl.style.pointerEvents = 'auto';
					textEl.style.userSelect = 'text';
					textEl.style.webkitUserSelect = 'text';
					textEl.style.mozUserSelect = 'text';
					textEl.style.cursor = 'text';
					
					// Enable all text spans
					const textSpans = textEl.querySelectorAll('span:not(.spacer)');
					textSpans.forEach(span => {
						(span as HTMLElement).style.pointerEvents = 'auto';
						(span as HTMLElement).style.userSelect = 'text';
						(span as HTMLElement).style.webkitUserSelect = 'text';
						(span as HTMLElement).style.mozUserSelect = 'text';
					});
				}
			}
		}
		
		// Ensure spacers remain disabled
		const allSpacers = this.container.querySelectorAll('.spacer');
		allSpacers.forEach(spacer => {
			(spacer as HTMLElement).style.pointerEvents = 'none';
			(spacer as HTMLElement).style.userSelect = 'none';
		});
		
		// Apply CSS overrides
		if (!this.styleElement) {
			this.styleElement = document.createElement('style');
			this.styleElement.id = 'spacer-aware-styles';
			document.head.appendChild(this.styleElement);
		}
		
		this.styleElement.textContent = `
			.spacer-detection-overlay {
				z-index: 9998 !important;
				pointer-events: none !important;
			}
			
			.dafRoot .spacer {
				pointer-events: none !important;
				user-select: none !important;
			}
		`;
	}
}