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

				// Immediately check if we can set CSS variables
				const rootDiv = container.querySelector('.dafRoot') as HTMLElement;
				if (rootDiv) {
					// Set critical CSS variables using default options
					rootDiv.style.setProperty('--contentWidth', defaultOptions.contentWidth);
					rootDiv.style.setProperty('--fontSize-side', defaultOptions.fontSize.side);
					rootDiv.style.setProperty('--lineHeight-main', defaultOptions.lineHeight.main);
					rootDiv.style.setProperty('--mainWidth', defaultOptions.mainWidth);
					rootDiv.style.setProperty('--padding-vertical', defaultOptions.padding.vertical);
				}

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
				
				// Determine amud from pageLabel (e.g. "31a" -> "a", "31b" -> "b")
				const amud = pageLabel.slice(-1) === 'b' ? 'b' : 'a';
				
				// Pass lineBreakMode to renderer
				state.renderer.render(
					mainText, 
					rashiText, 
					tosafotText, 
					amud, 
					lineBreakMode ? '<br>' : undefined, // Pass '<br>' for line break mode, undefined for traditional
					() => {}, // rendered callback
					() => {}  // resized callback
				);
				
				// Monitor for layout breakage
				const checkText = () => {
					const mainSpan = state.container?.querySelector('.main .text span');
					const mainDiv = state.container?.querySelector('.main');
					
					if (mainSpan) {
						const spanStyles = window.getComputedStyle(mainSpan);
						const divStyles = window.getComputedStyle(mainDiv);
						
						if (spanStyles.fontSize === '0px' || divStyles.width === '0px') {
							console.error('LAYOUT BROKEN DETECTED!', {
								fontSize: spanStyles.fontSize,
								divWidth: divStyles.width,
								timestamp: new Date().toISOString()
							});
							fixFontSize();
						}
					}
				};
				
				// Monitor and fix font size issues
				const fixFontSize = () => {
					const rootDiv = state.container?.querySelector('.dafRoot') as HTMLElement;
					if (rootDiv) {
						// Force ALL CSS variables to be set correctly with !important-like behavior
						const setVarForce = (name: string, value: string) => {
							rootDiv.style.setProperty(name, value, 'important');
						};
						
						setVarForce('--fontSize-main', defaultOptions.fontSize.main);
						setVarForce('--fontSize-side', defaultOptions.fontSize.side);
						setVarForce('--lineHeight-main', defaultOptions.lineHeight.main);
						setVarForce('--lineHeight-side', defaultOptions.lineHeight.side);
						setVarForce('--contentWidth', defaultOptions.contentWidth);
						setVarForce('--mainWidth', defaultOptions.mainWidth);
						setVarForce('--halfway', defaultOptions.halfway);
						setVarForce('--padding-horizontal', defaultOptions.padding.horizontal);
						setVarForce('--padding-vertical', defaultOptions.padding.vertical);
						setVarForce('--direction', defaultOptions.direction);
						
						// Force font families using default options
						setVarForce('--fontFamily-main', defaultOptions.fontFamily.main);
						setVarForce('--fontFamily-inner', defaultOptions.fontFamily.inner);
						setVarForce('--fontFamily-outer', defaultOptions.fontFamily.outer);
					}
				};
				
				// Apply fixes at key intervals and monitor for breakage
				setTimeout(() => { checkText(); fixFontSize(); }, 10);
				setTimeout(() => { checkText(); fixFontSize(); }, 100);
				setTimeout(() => { checkText(); fixFontSize(); }, 300);
				setTimeout(() => { checkText(); fixFontSize(); }, 500);
				setTimeout(() => { checkText(); fixFontSize(); }, 1000);
				
				// Set up continuous monitoring every 2 seconds for debugging
				const monitorInterval = setInterval(() => {
					checkText();
				}, 2000);
				
				// Clean up interval after 30 seconds
				setTimeout(() => clearInterval(monitorInterval), 30000);
				
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
						
						// Ensure base variables are still set using default options
						rootDiv.style.setProperty('--contentWidth', defaultOptions.contentWidth);
						rootDiv.style.setProperty('--fontSize-side', defaultOptions.fontSize.side);
						rootDiv.style.setProperty('--lineHeight-main', defaultOptions.lineHeight.main);
						rootDiv.style.setProperty('--mainWidth', defaultOptions.mainWidth);
						rootDiv.style.setProperty('--padding-vertical', defaultOptions.padding.vertical);
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