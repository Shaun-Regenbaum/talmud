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
					contentWidth: "650px",
					fontSize: {
						main: "16px",
						side: "10.5px"
					},
					lineHeight: {
						main: "16px",
						side: "12px" 
					},
					padding: {
						horizontal: "8px",
						vertical: "10px"
					},
					mainWidth: "42%",
					fontFamily: {
						main: "Times New Roman, serif",
						inner: "Times New Roman, serif", 
						outer: "Times New Roman, serif"
					},
					direction: "rtl",
					halfway: "50%"
					// Removed lineBreaks: "br" since we're not using <br> tags
				});

				// Immediately check if we can set CSS variables
				const rootDiv = container.querySelector('.dafRoot') as HTMLElement;
				if (rootDiv) {
					console.log('Found dafRoot immediately after init');
					// Set critical CSS variables (only the ones we explicitly configured)
					rootDiv.style.setProperty('--contentWidth', '650px');
					rootDiv.style.setProperty('--fontSize-side', '10.5px');
					rootDiv.style.setProperty('--lineHeight-main', '16px');
					rootDiv.style.setProperty('--mainWidth', '42%');
					rootDiv.style.setProperty('--padding-vertical', '10px');
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
				
				// Debug: Check if <br> tags are present in the text
				console.log('Main text first 500 chars:', mainText.substring(0, 500));
				console.log('Main text contains <br>:', mainText.includes('<br>'));
				console.log('Main text contains newlines:', mainText.includes('\n'));
				console.log('Rashi text contains <br>:', rashiText.includes('<br>'));
				console.log('Rashi text contains newlines:', rashiText.includes('\n'));
				console.log('Tosafot text contains <br>:', tosafotText.includes('<br>'));
				console.log('Tosafot text contains newlines:', tosafotText.includes('\n'));
				
				// Determine amud from pageLabel (e.g. "31a" -> "a", "31b" -> "b")
				const amud = pageLabel.slice(-1) === 'b' ? 'b' : 'a';
				
				// Use linebreak splitting for main text since we have <br> tags
				state.renderer.render(
					mainText, 
					rashiText, 
					tosafotText, 
					amud, 
					"br", // Use <br> linebreak splitting
					() => console.log('Renderer: rendered callback'), // rendered callback
					() => console.log('Renderer: resized callback')   // resized callback
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
						
						setVarForce('--fontSize-main', '16px');
						setVarForce('--fontSize-side', '10.5px');
						setVarForce('--lineHeight-main', '18px');
						setVarForce('--lineHeight-side', '12px');
						setVarForce('--contentWidth', '650px');
						setVarForce('--mainWidth', '42%');
						setVarForce('--mainMargin-start', '42%');
						setVarForce('--sidePercent', '29%');
						setVarForce('--remainderPercent', '71%');
						setVarForce('--halfway', '50%');
						setVarForce('--padding-horizontal', '8px');
						setVarForce('--padding-vertical', '8px');
						setVarForce('--direction', 'rtl');
						
						// Force font families
						setVarForce('--fontFamily-main', 'Vilna, serif');
						setVarForce('--fontFamily-inner', 'Rashi, serif');
						setVarForce('--fontFamily-outer', 'Tosafot, serif');
						
						console.log('Applied forced CSS variables');
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
						
						// Ensure base variables are still set
						rootDiv.style.setProperty('--contentWidth', '650px');
						rootDiv.style.setProperty('--fontSize-side', '10.5px');
						rootDiv.style.setProperty('--lineHeight-main', '16px');
						rootDiv.style.setProperty('--mainWidth', '42%');
						rootDiv.style.setProperty('--padding-vertical', '10px');
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