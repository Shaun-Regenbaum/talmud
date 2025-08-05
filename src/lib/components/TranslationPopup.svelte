<!--
	@component TranslationPopup
	
	Displays a popup with Hebrew text and its translation.
	Automatically adjusts position to stay within viewport boundaries.
	
	@example
	```svelte
	<TranslationPopup
		x={100}
		y={200}
		selectedText="שלום עולם"
		translation="Hello World"
		visible={true}
	/>
	```
-->
<script lang="ts">
	import { onMount } from 'svelte';
	
	/**
	 * Component props interface
	 */
	interface Props {
		/** X coordinate for popup position */
		x: number;
		/** Y coordinate for popup position */
		y: number;
		/** Hebrew text that was selected */
		selectedText: string;
		/** Translation of the selected text */
		translation: string;
		/** Whether the popup should be visible */
		visible: boolean;
	}

	let { x, y, selectedText, translation, visible }: Props = $props();
	let popupElement = $state<HTMLDivElement>();
	let adjustedX = $state(x);
	let adjustedY = $state(y);
	
	// Update adjusted positions when x/y change
	$effect(() => {
		adjustedX = x;
		adjustedY = y;
	});
	
	// Function to recalculate position based on current size
	function recalculatePosition() {
		if (!popupElement || !visible) return;
		
		// Use setTimeout to ensure DOM has updated
		setTimeout(() => {
			if (!popupElement) return;
			
			const rect = popupElement.getBoundingClientRect();
			const padding = 10;
			
			// Start with original position
			let newX = x;
			let newY = y;
			
			// Check right edge
			if (x + rect.width > window.innerWidth - padding) {
				newX = window.innerWidth - rect.width - padding;
			}
			
			// Check left edge
			if (newX < padding) {
				newX = padding;
			}
			
			// Check bottom edge
			if (y + rect.height > window.innerHeight - padding) {
				// Try to position above the selection
				newY = y - rect.height - 20;
				
				// If still off screen, position at bottom
				if (newY < padding) {
					newY = window.innerHeight - rect.height - padding;
				}
			}
			
			// Apply adjusted positions
			adjustedX = newX;
			adjustedY = newY;
		}, 0);
	}
	
	// Recalculate position when popup becomes visible
	$effect(() => {
		if (visible) {
			recalculatePosition();
		}
	});
	
	// Recalculate position when translation content changes (size might change)
	$effect(() => {
		if (visible && translation && translation !== 'Translating...') {
			recalculatePosition();
		}
	});
	
	// Use ResizeObserver to detect size changes
	$effect(() => {
		if (visible && popupElement) {
			const resizeObserver = new ResizeObserver(() => {
				recalculatePosition();
			});
			
			resizeObserver.observe(popupElement);
			
			// Cleanup
			return () => {
				resizeObserver.disconnect();
			};
		}
	});
</script>

{#if visible && (translation || selectedText)}
	<div 
		bind:this={popupElement}
		class="translation-popup"
		style="left: {adjustedX}px; top: {adjustedY}px;"
	>
		<div class="selected-text">{selectedText}</div>
		<div class="translation" class:loading={translation === 'Translating...'}>
			{translation || 'Loading...'}
		</div>
	</div>
{/if}

<style>
	.translation-popup {
		position: fixed;
		z-index: 9999;
		background: white;
		border: 1px solid #ccc;
		border-radius: 8px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		padding: 12px 16px;
		max-width: 400px;
		font-family: Arial, sans-serif;
		direction: ltr;
		transition: left 0.2s ease, top 0.2s ease;
	}

	.selected-text {
		font-size: 14px;
		color: #666;
		margin-bottom: 8px;
		direction: rtl;
		text-align: right;
		font-family: 'Frank Ruhl Libre', serif;
	}

	.translation {
		font-size: 16px;
		color: #333;
		line-height: 1.5;
	}
	
	.translation.loading {
		color: #666;
		font-style: italic;
		opacity: 0.7;
	}
</style>