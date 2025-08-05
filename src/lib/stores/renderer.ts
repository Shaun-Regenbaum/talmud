import { writable, get } from 'svelte/store';
import createDafRenderer from '$lib/daf-renderer/renderer.js';
import { defaultOptions } from '$lib/daf-renderer/options.js';

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

		// Initialize the renderer (just set up container, actual renderer created in render())
		initialize(container: HTMLDivElement) {
			const state = get(this);
			
			// Don't reinitialize if already done with same container
			if (state.isInitialized && state.container === container) {
				return null;
			}

			try {
				// Clear container like spacer-analysis does
				container.innerHTML = '';

				set({
					renderer: null, // Will be created in render()
					container,
					isInitialized: true
				});

				return null; // Renderer will be created in render()
			} catch (error) {
				console.error('Failed to initialize renderer container:', error);
				throw error;
			}
		},

		// Render content
		render(mainText: string, rashiText: string, tosafotText: string, pageLabel: string, lineBreakMode: boolean = false) {
			const state = get(this);
			
			if (!state.isInitialized || !state.container) {
				console.error('Renderer container not initialized');
				return false;
			}

			try {
				// Clear container before each render like spacer-analysis does
				state.container.innerHTML = '';
				
				// Re-create renderer instance with improved padding for better readability
				const improvedOptions = {
					...defaultOptions,
					padding: {
						vertical: "16px",   // More vertical space for overflowing lines
						horizontal: "24px", // More horizontal space between columns
					},
					innerPadding: "12px",  // More space between main and rashi
					outerPadding: "12px",  // More space between rashi and tosafot
					lineHeight: {
						main: "19px",      // Slightly more line height for main text
						side: "15px",      // Slightly more line height for commentary
					}
				};
				const renderer = createDafRenderer(state.container, improvedOptions);
				
				// Update the store with new renderer instance
				update(currentState => ({ ...currentState, renderer }));
				
				
				// Determine amud from pageLabel (e.g. "31a" -> "a", "31b" -> "b")
				const amud = pageLabel.slice(-1) === 'b' ? 'b' : 'a';
				
				// Pass lineBreakMode to renderer - let it handle everything
				renderer.render(
					mainText, 
					rashiText, 
					tosafotText, 
					amud, 
					lineBreakMode ? 'br' : false, // Pass 'br' for line break mode like test page does
					() => {
						// rendered callback
					}, 
					() => {
						// resized callback
					}
				);
				
				return true;
			} catch (error) {
				console.error('Render failed:', error);
				return false;
			}
		},

		// Clear the renderer
		clear() {
			update(state => {
				// Call destroy method if renderer exists
				if (state.renderer && typeof state.renderer.destroy === 'function') {
					state.renderer.destroy();
				}
				
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