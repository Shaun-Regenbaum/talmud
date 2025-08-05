<script lang="ts">
	import { onMount } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	
	export interface TimelinePeriod {
		id: string;
		name: string;
		hebrewName?: string;
		startYear: number;
		endYear: number;
		color: string;
		description?: string;
		figures?: Array<{
			name: string;
			hebrewName?: string;
			year?: number;
		}>;
	}
	
	export let periods: TimelinePeriod[] = [];
	export let minYear = -500;
	export let maxYear = 1500;
	
	let selectedPeriod: TimelinePeriod | null = null;
	let hoveredPeriod: TimelinePeriod | null = null;
	let containerWidth = 0;
	let mouseX = 0;
	let showCursor = false;
	
	// Animation values
	const progressWidth = tweened(0, {
		duration: 1500,
		easing: cubicOut
	});
	
	// Calculate position for a given year
	function yearToPosition(year: number): number {
		return ((year - minYear) / (maxYear - minYear)) * 100;
	}
	
	// Format year for display
	function formatYear(year: number): string {
		if (year < 0) return `${Math.abs(year)} BCE`;
		if (year === 0) return '1 CE';
		return `${year} CE`;
	}
	
	// Get year from mouse position
	function positionToYear(x: number): number {
		const percentage = x / containerWidth;
		return Math.round(minYear + (maxYear - minYear) * percentage);
	}
	
	// Handle mouse movement
	function handleMouseMove(event: MouseEvent) {
		const rect = event.currentTarget.getBoundingClientRect();
		mouseX = event.clientX - rect.left;
		showCursor = true;
	}
	
	// Handle mouse leave
	function handleMouseLeave() {
		showCursor = false;
	}
	
	// Handle period click
	function selectPeriod(period: TimelinePeriod) {
		selectedPeriod = selectedPeriod?.id === period.id ? null : period;
	}
	
	onMount(() => {
		// Animate timeline on mount
		progressWidth.set(100);
		
		return () => {
			selectedPeriod = null;
			hoveredPeriod = null;
		};
	});
	
	// Calculate major year marks with better spacing
	$: yearMarks = (() => {
		const marks = [];
		const range = maxYear - minYear;
		let interval: number;
		
		if (range <= 500) interval = 100;
		else if (range <= 1000) interval = 200;
		else if (range <= 2000) interval = 400;
		else interval = 500;
		
		// Add marks at regular intervals
		for (let year = Math.ceil(minYear / interval) * interval; year <= maxYear; year += interval) {
			marks.push(year);
		}
		
		// Always include 0/1 CE transition if in range
		if (minYear <= 0 && maxYear >= 0 && !marks.includes(0)) {
			marks.push(0);
		}
		
		return marks.sort((a, b) => a - b);
	})();
</script>

<div class="timeline-container">
	<!-- Header with title -->
	<div class="timeline-header">
		<h2 class="timeline-title">Historical Timeline</h2>
		<div class="timeline-subtitle">
			{formatYear(minYear)} — {formatYear(maxYear)}
		</div>
	</div>
	
	<!-- Main timeline -->
	<div 
		class="timeline-main"
		bind:clientWidth={containerWidth}
		on:mousemove={handleMouseMove}
		on:mouseleave={handleMouseLeave}
		role="presentation"
	>
		<!-- Background track -->
		<div class="timeline-track">
			<div class="timeline-progress" style="width: {$progressWidth}%"></div>
		</div>
		
		<!-- Year markers -->
		<div class="timeline-markers">
			{#each yearMarks as year}
				<div 
					class="year-marker"
					style="left: {yearToPosition(year)}%"
				>
					<div class="marker-line"></div>
					<div class="marker-label">
						{formatYear(year)}
					</div>
				</div>
			{/each}
		</div>
		
		<!-- Period bars -->
		<div class="timeline-periods">
			{#each periods as period, i}
				{@const width = yearToPosition(period.endYear) - yearToPosition(period.startYear)}
				<button
					class="period-bar"
					class:selected={selectedPeriod?.id === period.id}
					class:hovered={hoveredPeriod?.id === period.id}
					style="
						left: {yearToPosition(period.startYear)}%;
						width: {width}%;
						background: {period.color};
						animation-delay: {i * 100}ms;
						top: {i % 3 * 36}px;
					"
					on:mouseenter={() => hoveredPeriod = period}
					on:mouseleave={() => hoveredPeriod = null}
					on:click={() => selectPeriod(period)}
					aria-label="{period.name}: {formatYear(period.startYear)} to {formatYear(period.endYear)}"
				>
					<div class="period-content">
						{#if width > 6}
							<div class="period-name">
								{period.name}
							</div>
							{#if period.hebrewName && width > 10}
								<div class="period-hebrew">{period.hebrewName}</div>
							{/if}
						{/if}
					</div>
				</button>
			{/each}
		</div>
		
		<!-- Cursor tooltip -->
		{#if showCursor}
			<div 
				class="cursor-tooltip"
				style="left: {mouseX}px"
			>
				<div class="cursor-line"></div>
				<div class="cursor-year">
					{formatYear(positionToYear(mouseX))}
				</div>
			</div>
		{/if}
		
		<!-- Hover card -->
		{#if hoveredPeriod && !selectedPeriod}
			<div 
				class="hover-card"
				style="
					left: {Math.min(
						Math.max(20, mouseX - 120),
						containerWidth - 260
					)}px;
				"
			>
				<div class="card-header" style="border-color: {hoveredPeriod.color}">
					<div class="card-title">{hoveredPeriod.name}</div>
					{#if hoveredPeriod.hebrewName}
						<div class="card-hebrew">{hoveredPeriod.hebrewName}</div>
					{/if}
				</div>
				<div class="card-body">
					<div class="card-years">
						{formatYear(hoveredPeriod.startYear)} — {formatYear(hoveredPeriod.endYear)}
						<span class="card-duration">
							({hoveredPeriod.endYear - hoveredPeriod.startYear} years)
						</span>
					</div>
					{#if hoveredPeriod.description}
						<div class="card-description">{hoveredPeriod.description}</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
	
	<!-- Selected period detail -->
	{#if selectedPeriod}
		<div class="period-detail">
			<div class="detail-header">
				<div class="detail-badge" style="background: {selectedPeriod.color}"></div>
				<div>
					<h3 class="detail-title">{selectedPeriod.name}</h3>
					{#if selectedPeriod.hebrewName}
						<div class="detail-hebrew">{selectedPeriod.hebrewName}</div>
					{/if}
				</div>
				<button 
					class="detail-close"
					on:click={() => selectedPeriod = null}
					aria-label="Close details"
				>
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>
			
			<div class="detail-content">
				<div class="detail-meta">
					<span class="meta-label">Period:</span>
					<span>{formatYear(selectedPeriod.startYear)} — {formatYear(selectedPeriod.endYear)}</span>
				</div>
				<div class="detail-meta">
					<span class="meta-label">Duration:</span>
					<span>{selectedPeriod.endYear - selectedPeriod.startYear} years</span>
				</div>
				
				{#if selectedPeriod.description}
					<p class="detail-description">{selectedPeriod.description}</p>
				{/if}
				
				{#if selectedPeriod.figures && selectedPeriod.figures.length > 0}
					<div class="detail-figures">
						<h4 class="figures-title">Key Figures</h4>
						<div class="figures-grid">
							{#each selectedPeriod.figures as figure}
								<div class="figure-item">
									<div class="figure-name">{figure.name}</div>
									{#if figure.hebrewName}
										<div class="figure-hebrew">{figure.hebrewName}</div>
									{/if}
									{#if figure.year}
										<div class="figure-year">{formatYear(figure.year)}</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.timeline-container {
		font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
		background: #ffffff;
		border-radius: 16px;
		padding: 32px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.08);
	}
	
	.timeline-header {
		margin-bottom: 40px;
	}
	
	.timeline-title {
		font-size: 28px;
		font-weight: 600;
		color: #1d1d1f;
		margin: 0 0 4px 0;
		letter-spacing: -0.02em;
	}
	
	.timeline-subtitle {
		font-size: 15px;
		color: #86868b;
		font-weight: 500;
	}
	
	.timeline-main {
		position: relative;
		height: 160px;
		margin: 40px 0;
		cursor: crosshair;
	}
	
	.timeline-track {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 2px;
		background: #f5f5f7;
		transform: translateY(-50%);
		border-radius: 1px;
		overflow: hidden;
	}
	
	.timeline-progress {
		height: 100%;
		background: linear-gradient(90deg, #f5f5f7 0%, #d2d2d7 100%);
		transition: width 1.5s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.timeline-markers {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		pointer-events: none;
	}
	
	.year-marker {
		position: absolute;
		transform: translateX(-50%);
	}
	
	.marker-line {
		width: 1px;
		height: 8px;
		background: #d2d2d7;
		margin: 0 auto;
		transform: translateY(-4px);
	}
	
	.marker-label {
		font-size: 10px;
		color: #86868b;
		font-weight: 500;
		margin-top: 16px;
		white-space: nowrap;
		user-select: none;
		letter-spacing: 0.01em;
	}
	
	.timeline-periods {
		position: absolute;
		top: 40%;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		height: 100px;
	}
	
	.period-bar {
		position: absolute;
		height: 28px;
		border: none;
		border-radius: 14px;
		padding: 0 12px;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
		transform: translateY(0);
		overflow: hidden;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
	}
	
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 0.85;
			transform: translateY(0);
		}
	}
	
	.period-bar:hover {
		opacity: 1;
		transform: translateY(-2px) scale(1.02);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
		z-index: 10;
	}
	
	.period-bar.selected {
		opacity: 1;
		transform: translateY(-3px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
		z-index: 11;
	}
	
	.period-content {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	
	.period-name {
		font-size: 11px;
		font-weight: 600;
		color: white;
		letter-spacing: 0.02em;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
		white-space: nowrap;
	}
	
	.period-hebrew {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.85);
		font-weight: 500;
		white-space: nowrap;
	}
	
	.period-edge-left,
	.period-edge-right {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 12px;
		background: linear-gradient(90deg, rgba(255,255,255,0.2), transparent);
		pointer-events: none;
	}
	
	.period-edge-left {
		left: 0;
		border-radius: 12px 0 0 12px;
	}
	
	.period-edge-right {
		right: 0;
		background: linear-gradient(270deg, rgba(255,255,255,0.2), transparent);
		border-radius: 0 12px 12px 0;
	}
	
	.cursor-tooltip {
		position: absolute;
		top: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 20;
	}
	
	.cursor-line {
		position: absolute;
		top: 20%;
		bottom: 20%;
		width: 1px;
		background: rgba(0, 0, 0, 0.1);
	}
	
	.cursor-year {
		position: absolute;
		top: -20px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		font-weight: 600;
		color: #1d1d1f;
		background: white;
		padding: 2px 8px;
		border-radius: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		white-space: nowrap;
	}
	
	.hover-card {
		position: absolute;
		top: -80px;
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
		padding: 16px;
		width: 240px;
		z-index: 30;
		pointer-events: none;
		animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
	
	.card-header {
		padding-bottom: 12px;
		border-bottom: 1px solid #f5f5f7;
		margin-bottom: 12px;
		border-left: 3px solid;
		padding-left: 12px;
		margin-left: -16px;
	}
	
	.card-title {
		font-size: 16px;
		font-weight: 600;
		color: #1d1d1f;
		margin-bottom: 2px;
	}
	
	.card-hebrew {
		font-size: 13px;
		color: #86868b;
	}
	
	.card-body {
		font-size: 13px;
		color: #48484a;
		line-height: 1.5;
	}
	
	.card-years {
		font-weight: 500;
		margin-bottom: 8px;
	}
	
	.card-duration {
		color: #86868b;
		font-weight: 400;
	}
	
	.card-description {
		color: #6e6e73;
		line-height: 1.6;
	}
	
	.period-detail {
		margin-top: 32px;
		padding: 24px;
		background: #f5f5f7;
		border-radius: 12px;
		animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	@keyframes slideUp {
		from { opacity: 0; transform: translateY(12px); }
		to { opacity: 1; transform: translateY(0); }
	}
	
	.detail-header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 20px;
	}
	
	.detail-badge {
		width: 48px;
		height: 48px;
		border-radius: 12px;
		flex-shrink: 0;
	}
	
	.detail-title {
		font-size: 20px;
		font-weight: 600;
		color: #1d1d1f;
		margin: 0 0 4px 0;
	}
	
	.detail-hebrew {
		font-size: 14px;
		color: #86868b;
	}
	
	.detail-close {
		margin-left: auto;
		width: 32px;
		height: 32px;
		border: none;
		background: white;
		border-radius: 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #86868b;
		transition: all 0.2s;
	}
	
	.detail-close:hover {
		background: #e8e8ed;
		color: #1d1d1f;
	}
	
	.detail-content {
		margin-left: 64px;
	}
	
	.detail-meta {
		display: flex;
		gap: 8px;
		font-size: 14px;
		margin-bottom: 8px;
		color: #48484a;
	}
	
	.meta-label {
		font-weight: 500;
		color: #86868b;
	}
	
	.detail-description {
		margin: 16px 0;
		font-size: 14px;
		line-height: 1.6;
		color: #48484a;
	}
	
	.detail-figures {
		margin-top: 24px;
	}
	
	.figures-title {
		font-size: 14px;
		font-weight: 600;
		color: #1d1d1f;
		margin: 0 0 12px 0;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	
	.figures-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 12px;
	}
	
	.figure-item {
		padding: 12px;
		background: white;
		border-radius: 8px;
		border: 1px solid #e8e8ed;
	}
	
	.figure-name {
		font-size: 13px;
		font-weight: 600;
		color: #1d1d1f;
		margin-bottom: 2px;
	}
	
	.figure-hebrew {
		font-size: 11px;
		color: #86868b;
		margin-bottom: 4px;
	}
	
	.figure-year {
		font-size: 11px;
		color: #86868b;
		font-weight: 500;
	}
	
	/* Responsive adjustments */
	@media (max-width: 768px) {
		.timeline-container {
			padding: 20px;
		}
		
		.timeline-title {
			font-size: 24px;
		}
		
		.period-name {
			font-size: 11px;
		}
		
		.period-hebrew {
			display: none;
		}
		
		.hover-card {
			width: 200px;
		}
	}
</style>