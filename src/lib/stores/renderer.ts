/**
 * @fileoverview Renderer Store - Manages the daf-renderer instance lifecycle
 * 
 * This store provides a centralized way to manage the daf-renderer instance,
 * handling initialization, rendering, and cleanup. It ensures only one renderer
 * instance exists at a time and properly manages DOM container references.
 * 
 * The store follows a two-phase initialization:
 * 1. Initialize: Sets up the container reference
 * 2. Render: Creates the actual renderer instance and renders content
 */

import { writable, get } from 'svelte/store';
import createDafRenderer from '$lib/daf-renderer/renderer.js';
import { defaultOptions } from '$lib/daf-renderer/options.js';

/**
 * State shape for the renderer store
 */
interface RendererState {
	/** The daf-renderer instance */
	renderer: any | null;
	/** DOM container element for the renderer */
	container: HTMLDivElement | null;
	/** Whether the store has been initialized with a container */
	isInitialized: boolean;
}

/**
 * Creates a store for managing the daf-renderer instance
 * @returns {Object} Renderer store with methods for initialization and rendering
 */
function createRendererStore() {
	const { subscribe, set, update } = writable<RendererState>({
		renderer: null,
		container: null,
		isInitialized: false
	});

	return {
		subscribe,

		/**
		 * Initialize the renderer store with a DOM container
		 * Note: This only sets up the container reference. The actual renderer
		 * instance is created during the render() call.
		 * 
		 * @param {HTMLDivElement} container - DOM element to render into
		 * @returns {null} Always returns null (renderer created in render())
		 */
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

		/**
		 * Render Talmud content using daf-renderer
		 * Creates a new renderer instance and renders the provided texts
		 * 
		 * @param {string} mainText - HTML content for main Gemara text
		 * @param {string} rashiText - HTML content for Rashi commentary
		 * @param {string} tosafotText - HTML content for Tosafot commentary
		 * @param {string} pageLabel - Page label (e.g., "31א" or "31ב")
		 * @param {boolean} lineBreakMode - Whether to use line break mode (vilna style)
		 * @returns {boolean} True if render succeeded, false otherwise
		 */
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

		/**
		 * Clear the renderer and reset the store
		 * Properly destroys the renderer instance and clears the container
		 */
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

		/**
		 * Get the current renderer instance
		 * @returns {any|null} The daf-renderer instance or null if not created
		 */
		getRenderer() {
			const state = get(this);
			return state.renderer;
		}
	};
}

export const rendererStore = createRendererStore();