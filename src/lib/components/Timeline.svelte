<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	
	export interface TimelineItem {
		id: string;
		name: string;
		hebrewName?: string;
		startYear: number;
		endYear: number;
		color: string;
		description?: string;
		items?: Array<{
			name: string;
			hebrewName?: string;
			year?: number;
			location?: string;
			generation?: number;
		}>;
	}
	
	export let items: TimelineItem[] = [];
	export let minYear = -500;
	export let maxYear = 2000;
	export let height = 200;
	export let showAxis = true;
	export let showMarkers = true;
	export let interactive = true;
	export let title = '';
	
	let hoveredItem: TimelineItem | null = null;
	let selectedItem: TimelineItem | null = null;
	let tooltipPosition = { x: 0, y: 0 };
	let containerElement: HTMLElement;
	let mousePosition = { x: 0, y: 0 };
	let nearestYear = 0;
	
	// Calculate position on timeline
	function getPosition(year: number): number {
		return ((year - minYear) / (maxYear - minYear)) * 100;
	}
	
	// Format year display
	function formatYear(year: number): string {
		if (year < 0) return `${Math.abs(year)} BCE`;
		if (year === 0) return '1 CE';
		return `${year} CE`;
	}
	
	// Get major tick marks for the timeline
	function getMajorTicks(): number[] {
		const ticks = [];
		const range = maxYear - minYear;
		let interval: number;
		
		if (range <= 100) interval = 10;
		else if (range <= 500) interval = 50;
		else if (range <= 1000) interval = 100;
		else if (range <= 2000) interval = 250;
		else interval = 500;
		
		for (let year = Math.ceil(minYear / interval) * interval; year <= maxYear; year += interval) {
			ticks.push(year);
		}
		return ticks;
	}
	
	// Handle mouse movement for interactive cursor
	function handleMouseMove(event: MouseEvent) {
		if (!interactive || !containerElement) return;
		
		const rect = containerElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		
		mousePosition = { x, y };
		
		// Calculate nearest year based on x position
		const percentage = x / rect.width;
		nearestYear = Math.round(minYear + (maxYear - minYear) * percentage);
		
		// Update tooltip position
		tooltipPosition = {
			x: Math.min(x, rect.width - 200),
			y: y - 40
		};
	}
	
	// Handle item click
	function handleItemClick(item: TimelineItem) {
		if (!interactive) return;
		selectedItem = selectedItem?.id === item.id ? null : item;
	}
	
	// Get overlapping items for stacking - improved algorithm
	function getItemLayer(item: TimelineItem, index: number): number {
		// Track which layers are occupied at this item's time range
		const occupiedLayers = new Set<number>();
		
		for (let i = 0; i < index; i++) {
			const other = items[i];
			// Check if items overlap
			if (
				(item.startYear < other.endYear && item.endYear > other.startYear)
			) {
				// Find which layer this overlapping item uses
				let otherLayer = 0;
				for (let j = 0; j < i; j++) {
					const prev = items[j];
					if (prev !== other && 
						other.startYear < prev.endYear && 
						other.endYear > prev.startYear) {
						otherLayer++;
					}
				}
				occupiedLayers.add(otherLayer % 4);
			}
		}
		
		// Find the first available layer
		for (let layer = 0; layer < 4; layer++) {
			if (!occupiedLayers.has(layer)) {
				return layer;
			}
		}
		return 0; // Fallback to first layer
	}
	
	onMount(() => {
		// Animate items on mount
		return () => {
			hoveredItem = null;
			selectedItem = null;
		};
	});
</script>

<div class="timeline-container" class:interactive>
	{#if title}
		<h3 class="timeline-title">{title}</h3>
	{/if}
	
	<div 
		class="timeline-wrapper"
		bind:this={containerElement}
		on:mousemove={handleMouseMove}
		on:mouseleave={() => hoveredItem = null}
		style="height: {height}px"
		role="presentation"
	>
		<!-- Background gradient -->
		<div class="timeline-gradient"></div>
		
		<!-- Axis line -->
		{#if showAxis}
			<div class="timeline-axis" transition:fade={{ duration: 500 }}>
				<!-- Major ticks -->
				{#if showMarkers}
					{#each getMajorTicks() as tick}
						<div 
							class="tick-mark"
							style="left: {getPosition(tick)}%"
							transition:scale={{ duration: 300, delay: 100 }}
						>
							<span class="tick-line"></span>
							<span class="tick-label">{formatYear(tick)}</span>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
		
		<!-- Interactive cursor line -->
		{#if interactive && mousePosition.x > 0}
			<div 
				class="cursor-line"
				style="left: {mousePosition.x}px"
				transition:fade={{ duration: 150 }}
			>
				<span class="cursor-year">{formatYear(nearestYear)}</span>
			</div>
		{/if}
		
		<!-- Timeline items -->
		<div class="timeline-items">
			{#each items as item, index}
				{@const layer = getItemLayer(item, index)}
				{@const left = getPosition(item.startYear)}
				{@const width = getPosition(item.endYear) - left}
				
				<div
					class="timeline-item-wrapper"
					style="
						left: {left}%;
						width: {width}%;
						top: {60 + layer * 40}px;
					"
				>
					<button
						class="timeline-item"
						class:hovered={hoveredItem?.id === item.id}
						class:selected={selectedItem?.id === item.id}
						style="background: {item.color};"
						on:mouseenter={() => hoveredItem = item}
						on:mouseleave={() => hoveredItem = null}
						on:click={() => handleItemClick(item)}
						transition:fly={{ 
							y: 20, 
							duration: 500, 
							delay: index * 50,
							easing: cubicOut 
						}}
						aria-label="{item.name}: {formatYear(item.startYear)} to {formatYear(item.endYear)}"
					>
						<span class="item-label">
							<span class="item-name">{item.name}</span>
							{#if item.hebrewName}
								<span class="hebrew-label">{item.hebrewName}</span>
							{/if}
						</span>
					</button>
				</div>
			{/each}
		</div>
		
		<!-- Tooltip -->
		{#if hoveredItem && !selectedItem}
			<div 
				class="timeline-tooltip"
				style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px"
				transition:scale={{ duration: 200 }}
			>
				<h4>{hoveredItem.name}</h4>
				{#if hoveredItem.hebrewName}
					<p class="hebrew">{hoveredItem.hebrewName}</p>
				{/if}
				<p class="years">
					{formatYear(hoveredItem.startYear)} – {formatYear(hoveredItem.endYear)}
				</p>
				<p class="duration">
					Duration: {hoveredItem.endYear - hoveredItem.startYear} years
				</p>
				{#if hoveredItem.description}
					<p class="description">{hoveredItem.description}</p>
				{/if}
			</div>
		{/if}
		
		<!-- Selected item detail panel -->
		{#if selectedItem}
			<div 
				class="detail-panel"
				transition:fly={{ x: 300, duration: 300 }}
			>
				<button 
					class="close-btn"
					on:click={() => selectedItem = null}
					aria-label="Close details"
				>
					×
				</button>
				
				<h3 style="color: {selectedItem.color}">
					{selectedItem.name}
				</h3>
				{#if selectedItem.hebrewName}
					<h4 class="hebrew">{selectedItem.hebrewName}</h4>
				{/if}
				
				<div class="detail-info">
					<p class="period">
						<strong>Period:</strong> {formatYear(selectedItem.startYear)} – {formatYear(selectedItem.endYear)}
					</p>
					<p class="duration">
						<strong>Duration:</strong> {selectedItem.endYear - selectedItem.startYear} years
					</p>
					
					{#if selectedItem.description}
						<p class="description">{selectedItem.description}</p>
					{/if}
					
					{#if selectedItem.items && selectedItem.items.length > 0}
						<div class="sub-items">
							<h5>Key Figures:</h5>
							<ul>
								{#each selectedItem.items as subItem}
									<li>
										<span class="name">{subItem.name}</span>
										{#if subItem.hebrewName}
											<span class="hebrew">({subItem.hebrewName})</span>
										{/if}
										{#if subItem.generation}
											<span class="generation">Gen {subItem.generation}</span>
										{/if}
										{#if subItem.location}
											<span class="location">{subItem.location}</span>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.timeline-container {
		position: relative;
		padding: 24px;
		background: linear-gradient(to bottom, #ffffff, #fafafa);
		border-radius: 8px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		overflow: hidden;
		border: 1px solid #e5e7eb;
	}
	
	.timeline-container.interactive {
		cursor: default;
	}
	
	.timeline-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin-bottom: 24px;
		color: #111827;
		letter-spacing: -0.01em;
	}
	
	.timeline-wrapper {
		position: relative;
		width: 100%;
		overflow: visible;
		background: white;
		border-radius: 6px;
		padding: 16px;
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
	}
	
	.timeline-gradient {
		display: none; /* Remove gradient for cleaner look */
	}
	
	.timeline-axis {
		position: absolute;
		bottom: 24px;
		left: 16px;
		right: 16px;
		height: 1px;
		background: linear-gradient(to right, #d1d5db, #9ca3af, #d1d5db);
		z-index: 0;
	}
	
	.tick-mark {
		position: absolute;
		bottom: -8px;
		transform: translateX(-50%);
		z-index: 1;
	}
	
	.tick-line {
		display: block;
		width: 1px;
		height: 8px;
		background: #9ca3af;
		margin: 0 auto;
	}
	
	.tick-label {
		display: block;
		margin-top: 4px;
		font-size: 0.6875rem;
		color: #6b7280;
		white-space: nowrap;
		user-select: none;
		font-weight: 500;
		letter-spacing: 0.01em;
	}
	
	.cursor-line {
		position: absolute;
		top: 40px;
		bottom: 40px;
		width: 1px;
		background: rgba(99, 102, 241, 0.3);
		pointer-events: none;
		z-index: 2;
		transition: opacity 0.15s;
	}
	
	.cursor-year {
		position: absolute;
		top: -24px;
		left: 50%;
		transform: translateX(-50%);
		padding: 2px 6px;
		background: #4f46e5;
		color: white;
		font-size: 0.625rem;
		border-radius: 3px;
		white-space: nowrap;
		font-weight: 600;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}
	
	.timeline-items {
		position: relative;
		height: 100%;
		padding-top: 20px;
	}
	
	.timeline-item-wrapper {
		position: absolute;
		height: 32px;
		z-index: 1;
		transition: z-index 0.2s;
	}
	
	.timeline-item-wrapper:hover {
		z-index: 10;
	}
	
	.timeline-item {
		width: 100%;
		height: 100%;
		border-radius: 4px;
		border: none;
		padding: 0 12px;
		color: white;
		font-size: 0.8125rem;
		font-weight: 600;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		opacity: 0.85;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24);
		min-width: fit-content;
		white-space: nowrap;
		overflow: visible;
	}
	
	.timeline-item::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 4px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px 0 0 4px;
	}
	
	.timeline-item:hover {
		opacity: 1;
		transform: translateY(-1px);
		box-shadow: 0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23);
	}
	
	.timeline-item.selected {
		opacity: 1;
		transform: translateY(-2px);
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.19), 0 6px 6px rgba(0, 0, 0, 0.23);
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 1px;
	}
	
	.item-label {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		line-height: 1.1;
		text-align: center;
		position: relative;
		z-index: 2;
	}
	
	.item-name {
		font-weight: 600;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
		letter-spacing: 0.02em;
	}
	
	.hebrew-label {
		font-size: 0.625rem;
		opacity: 0.95;
		margin-top: 1px;
		font-weight: 500;
	}
	
	.timeline-tooltip {
		position: absolute;
		padding: 12px;
		background: white;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
		pointer-events: none;
		z-index: 20;
		min-width: 200px;
		max-width: 300px;
		border: 1px solid #e5e7eb;
	}
	
	.timeline-tooltip h4 {
		margin: 0 0 4px 0;
		font-size: 1rem;
		font-weight: 600;
		color: #1f2937;
	}
	
	.timeline-tooltip .hebrew {
		color: #6b7280;
		font-size: 0.875rem;
		margin: 4px 0;
	}
	
	.timeline-tooltip .years {
		color: #4b5563;
		font-size: 0.875rem;
		margin: 4px 0;
	}
	
	.timeline-tooltip .duration {
		color: #6b7280;
		font-size: 0.75rem;
		margin: 4px 0;
	}
	
	.timeline-tooltip .description {
		color: #4b5563;
		font-size: 0.875rem;
		margin-top: 8px;
		line-height: 1.4;
	}
	
	.detail-panel {
		position: absolute;
		top: 20px;
		right: 20px;
		width: 320px;
		max-height: calc(100% - 40px);
		background: white;
		border-radius: 12px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
		padding: 20px;
		z-index: 25;
		overflow-y: auto;
		border: 1px solid #e5e7eb;
	}
	
	.detail-panel h3 {
		margin: 0 0 8px 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
	
	.detail-panel h4.hebrew {
		margin: 0 0 16px 0;
		font-size: 1rem;
		color: #6b7280;
	}
	
	.close-btn {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 28px;
		height: 28px;
		border: none;
		background: #f3f4f6;
		border-radius: 6px;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: #6b7280;
		transition: all 0.2s;
	}
	
	.close-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}
	
	.detail-info p {
		margin: 8px 0;
		font-size: 0.875rem;
		color: #4b5563;
	}
	
	.detail-info strong {
		color: #1f2937;
	}
	
	.sub-items {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid #e5e7eb;
	}
	
	.sub-items h5 {
		margin: 0 0 8px 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}
	
	.sub-items ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	
	.sub-items li {
		padding: 6px 0;
		font-size: 0.875rem;
		color: #4b5563;
		border-bottom: 1px solid #f3f4f6;
	}
	
	.sub-items li:last-child {
		border-bottom: none;
	}
	
	.sub-items .name {
		font-weight: 500;
		color: #1f2937;
	}
	
	.sub-items .hebrew {
		color: #6b7280;
		margin-left: 4px;
	}
	
	.sub-items .generation,
	.sub-items .location {
		display: inline-block;
		margin-left: 8px;
		padding: 2px 6px;
		background: #f3f4f6;
		border-radius: 4px;
		font-size: 0.75rem;
		color: #6b7280;
	}
	
	/* Responsive adjustments */
	@media (max-width: 768px) {
		.timeline-container {
			padding: 12px;
		}
		
		.detail-panel {
			width: calc(100% - 40px);
			right: 20px;
			left: 20px;
		}
		
		.timeline-item {
			font-size: 0.75rem;
			min-width: 60px;
		}
		
		.tick-label {
			font-size: 0.625rem;
		}
	}
</style>