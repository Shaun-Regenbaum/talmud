import { writable, get } from 'svelte/store';
import dafRenderer from '$lib/daf-renderer/index.js';
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
				
				const renderer = dafRenderer(container, defaultOptions);


				set({
					renderer,
					container,
					isInitialized: true
				});

				return renderer;
			} catch (error) {
				console.error('Failed to initialize renderer:', error);
				throw error;
			}
		},

		// Render content
		render(mainText: string, rashiText: string, tosafotText: string, pageLabel: string, lineBreakMode: boolean = false) {
			const state = get(this);
			
			if (!state.renderer || !state.isInitialized) {
				console.error('Renderer not initialized');
				return false;
			}

			try {
				// Debug: Log first 200 chars of each text to see what we're rendering
				console.log('🔍 Rendering texts:', {
					main: mainText.substring(0, 200) + '...',
					rashi: rashiText.substring(0, 200) + '...',
					tosafot: tosafotText.substring(0, 200) + '...'
				});
				
				// Determine amud from pageLabel (e.g. "31a" -> "a", "31b" -> "b")
				const amud = pageLabel.slice(-1) === 'b' ? 'b' : 'a';
				
				// Pass lineBreakMode to renderer - let it handle everything
				state.renderer.render(
					mainText, 
					rashiText, 
					tosafotText, 
					amud, 
					lineBreakMode ? '<br>' : undefined, // Pass '<br>' for line break mode, undefined for traditional
					() => {
						console.log('🎯 Daf-renderer completed - trusting renderer to handle CSS');
					}, // rendered callback
					() => {
						console.log('📏 Daf-renderer resized');
					}  // resized callback
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