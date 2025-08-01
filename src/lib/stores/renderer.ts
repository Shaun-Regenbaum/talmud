import { writable, get } from 'svelte/store';
import dafRenderer from '$lib/daf-renderer/index.js';

interface RendererState {
	renderer: any | null;
	container: HTMLDivElement | null;
	isInitialized: boolean;
}

function createRendererStore() {
	const { subscribe, set, update } = writable<RendererState>({
		renderer: null,
		container: null,
		isInitialized: false
	});

	return {
		subscribe,

		// Initialize the renderer
		initialize(container: HTMLDivElement) {
			const state = get(this);
			
			// Don't reinitialize if already done
			if (state.isInitialized && state.renderer && state.container === container) {
				console.log('Renderer already initialized');
				return state.renderer;
			}

			try {
				console.log('Initializing daf-renderer');
				
				const renderer = dafRenderer(container, {
					padding: { 
						vertical: "25px",
						horizontal: "25px"
					},
					fontFamily: {
						inner: "Rashi", 
						outer: "Rashi", 
						main: "Vilna"
					},
					fontSize: {
						main: "20px",
						side: "14px"
					},
					lineHeight: {
						main: "26px",
						side: "20px"
					},
					mainWidth: "52%",
					contentWidth: "900px",
					innerPadding: "8px",
					outerPadding: "8px",
					direction: "rtl",
					halfway: "50%"
				});

				// Immediately check if we can set CSS variables
				const rootDiv = container.querySelector('.dafRoot') as HTMLElement;
				if (rootDiv) {
					console.log('Found dafRoot immediately after init');
					// Set all critical CSS variables
					rootDiv.style.setProperty('--contentWidth', '900px');
					rootDiv.style.setProperty('--fontSize-main', '20px');
					rootDiv.style.setProperty('--fontSize-side', '14px');
					rootDiv.style.setProperty('--lineHeight-main', '26px');
					rootDiv.style.setProperty('--lineHeight-side', '20px');
					rootDiv.style.setProperty('--mainWidth', '52%');
					rootDiv.style.setProperty('--padding-horizontal', '25px');
					rootDiv.style.setProperty('--padding-vertical', '25px');
					rootDiv.style.setProperty('--direction', 'rtl');
					rootDiv.style.setProperty('--halfway', '50%');
					rootDiv.style.setProperty('--sidePercent', '24%');
					rootDiv.style.setProperty('--remainderPercent', '76%');
					rootDiv.style.setProperty('--mainMargin-start', '52%');
				} else {
					console.warn('dafRoot not found immediately after init');
				}

				set({
					renderer,
					container,
					isInitialized: true
				});

				console.log('Renderer initialized successfully');
				return renderer;
			} catch (error) {
				console.error('Failed to initialize renderer:', error);
				throw error;
			}
		},

		// Render content
		render(mainText: string, rashiText: string, tosafotText: string, pageLabel: string) {
			const state = get(this);
			
			if (!state.renderer || !state.isInitialized) {
				console.error('Renderer not initialized');
				return false;
			}

			try {
				console.log('Rendering content, page label:', pageLabel);
				console.log('Text lengths:', {
					main: mainText.length,
					rashi: rashiText.length,
					tosafot: tosafotText.length
				});
				
				state.renderer.render(mainText, rashiText, tosafotText, pageLabel);
				
				// After render, ensure CSS variables are still set
				setTimeout(() => {
					const rootDiv = state.container?.querySelector('.dafRoot') as HTMLElement;
					if (rootDiv) {
						// Re-apply spacer heights if they got reset
						const spacerHeights = state.renderer.spacerHeights;
						if (spacerHeights) {
							rootDiv.style.setProperty('--spacerHeights-start', spacerHeights.start + 'px');
							rootDiv.style.setProperty('--spacerHeights-inner', spacerHeights.inner + 'px');
							rootDiv.style.setProperty('--spacerHeights-outer', spacerHeights.outer + 'px');
							rootDiv.style.setProperty('--spacerHeights-end', spacerHeights.end + 'px');
						}
						
						// Ensure base variables are still set
						rootDiv.style.setProperty('--contentWidth', '900px');
						rootDiv.style.setProperty('--fontSize-main', '20px');
						rootDiv.style.setProperty('--fontSize-side', '14px');
						rootDiv.style.setProperty('--lineHeight-main', '26px');
						rootDiv.style.setProperty('--lineHeight-side', '20px');
					}
				}, 50);
				
				return true;
			} catch (error) {
				console.error('Render failed:', error);
				return false;
			}
		},

		// Clear the renderer
		clear() {
			update(state => {
				if (state.container) {
					state.container.innerHTML = '';
				}
				return {
					renderer: null,
					container: null,
					isInitialized: false
				};
			});
		},

		// Get renderer instance
		getRenderer() {
			const state = get(this);
			return state.renderer;
		}
	};
}

export const rendererStore = createRendererStore();