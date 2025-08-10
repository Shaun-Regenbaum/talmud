<!--
	@component SefariaContextPopup
	
	Displays Sefaria text and commentary data for selected HebrewBooks text.
	Uses text alignment to find corresponding Sefaria segments.
	
	@example
	```svelte
	<SefariaContextPopup
		visible={showContext}
		selectedText={selectedHebrewText}
		segments={matchedSegments}
		x={popupX}
		y={popupY}
		on:close={() => showContext = false}
	/>
	```
-->
<script lang="ts">
	import type { SegmentMapping } from '$lib/services/textAlignment';
	
	interface Props {
		visible: boolean;
		selectedText: string;
		segments: SegmentMapping[];
		x?: number;
		y?: number;
		onClose?: () => void;
	}
	
	let { 
		visible = false,
		selectedText = '',
		segments = [],
		x = 0,
		y = 0,
		onClose
	}: Props = $props();
	
	let popupElement = $state<HTMLDivElement>();
	let expandedSegments = $state<Set<number>>(new Set());
	
	// Toggle segment expansion
	function toggleSegment(index: number) {
		const newSet = new Set(expandedSegments);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		expandedSegments = newSet;
	}
	
	// Adjust popup position to stay within viewport
	$effect(() => {
		if (visible && popupElement) {
			const rect = popupElement.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const padding = 20;
			
			// Adjust horizontal position
			if (rect.right > viewportWidth - padding) {
				popupElement.style.left = `${viewportWidth - rect.width - padding}px`;
			} else if (rect.left < padding) {
				popupElement.style.left = `${padding}px`;
			}
			
			// Adjust vertical position
			if (rect.bottom > viewportHeight - padding) {
				// Show above selection instead
				popupElement.style.top = `${y - rect.height - 10}px`;
			} else if (rect.top < padding) {
				popupElement.style.top = `${padding}px`;
			}
		}
	});
	
	// Handle click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (popupElement && !popupElement.contains(event.target as Node)) {
			onClose?.();
		}
	}
	
	// Handle escape key to close
	function handleEscape(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose?.();
		}
	}
	
	$effect(() => {
		if (visible) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleEscape);
			
			return () => {
				document.removeEventListener('mousedown', handleClickOutside);
				document.removeEventListener('keydown', handleEscape);
			};
		}
	});
</script>

{#if visible && segments.length > 0}
	<div 
		bind:this={popupElement}
		class="sefaria-context-popup"
		style="left: {x}px; top: {y}px;"
	>
		<div class="popup-header">
			<h4>Sefaria Commentary</h4>
			<button class="close-btn" onclick={onClose}>×</button>
		</div>
		
		<div class="popup-body">
			{#if selectedText}
				<div class="selected-text-section">
					<div class="label">Selected Text:</div>
					<div class="hebrew-text">{selectedText}</div>
				</div>
			{/if}
			
			<div class="segments-section">
				<div class="label">Related Segments ({segments.length}):</div>
				<div class="segments-list">
					{#each segments as segment, index}
						<div class="segment-item" class:expanded={expandedSegments.has(index)}>
							<button 
								class="segment-header"
								onclick={() => toggleSegment(index)}
							>
								<span class="segment-ref">{segment.segmentRef}</span>
								<span class="expand-icon">{expandedSegments.has(index) ? '▼' : '▶'}</span>
							</button>
							
							{#if expandedSegments.has(index)}
								<div class="segment-content">
									<div class="hebrew-section">
										<div class="text-label">Hebrew:</div>
										<div class="hebrew-text">{segment.hebrewText}</div>
									</div>
									{#if segment.englishText}
										<div class="english-section">
											<div class="text-label">English:</div>
											<div class="english-text">{segment.englishText}</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.sefaria-context-popup {
		position: fixed;
		background: white;
		border: 1px solid #ccc;
		border-radius: 8px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		z-index: 10000;
		max-width: 500px;
		max-height: 600px;
		display: flex;
		flex-direction: column;
		font-family: system-ui, -apple-system, sans-serif;
	}
	
	.popup-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid #e0e0e0;
		background: #f8f9fa;
		border-radius: 8px 8px 0 0;
	}
	
	.popup-header h4 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #1a1a1a;
	}
	
	.close-btn {
		background: none;
		border: none;
		font-size: 24px;
		line-height: 1;
		color: #666;
		cursor: pointer;
		padding: 0;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: background-color 0.2s;
	}
	
	.close-btn:hover {
		background-color: rgba(0, 0, 0, 0.05);
		color: #333;
	}
	
	.popup-body {
		padding: 16px;
		overflow-y: auto;
		flex: 1;
	}
	
	.selected-text-section {
		margin-bottom: 16px;
		padding-bottom: 16px;
		border-bottom: 1px solid #e0e0e0;
	}
	
	.label {
		font-size: 12px;
		font-weight: 600;
		color: #666;
		margin-bottom: 6px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	
	.hebrew-text {
		font-size: 18px;
		line-height: 1.6;
		direction: rtl;
		text-align: right;
		font-family: 'David Libre', 'SBL Hebrew', serif;
		color: #1a1a1a;
	}
	
	.segments-section {
		margin-top: 12px;
	}
	
	.segments-list {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	
	.segment-item {
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		overflow: hidden;
		transition: border-color 0.2s;
	}
	
	.segment-item:hover {
		border-color: #007bff;
	}
	
	.segment-item.expanded {
		border-color: #007bff;
		background: #f8f9fa;
	}
	
	.segment-header {
		width: 100%;
		padding: 10px 12px;
		background: white;
		border: none;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		font-size: 14px;
		transition: background-color 0.2s;
	}
	
	.segment-header:hover {
		background: #f0f4f8;
	}
	
	.segment-ref {
		font-weight: 600;
		color: #007bff;
	}
	
	.expand-icon {
		color: #666;
		font-size: 10px;
	}
	
	.segment-content {
		padding: 12px;
		border-top: 1px solid #e0e0e0;
		background: white;
	}
	
	.hebrew-section,
	.english-section {
		margin-bottom: 12px;
	}
	
	.hebrew-section:last-child,
	.english-section:last-child {
		margin-bottom: 0;
	}
	
	.text-label {
		font-size: 11px;
		font-weight: 600;
		color: #888;
		margin-bottom: 4px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}
	
	.english-text {
		font-size: 14px;
		line-height: 1.5;
		color: #333;
	}
	
	/* Responsive adjustments */
	@media (max-width: 600px) {
		.sefaria-context-popup {
			max-width: calc(100vw - 40px);
			max-height: calc(100vh - 40px);
		}
	}
</style>