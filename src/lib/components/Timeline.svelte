<script lang="ts">
	export interface TimeEvent {
		year: number;
		label: string;
		type?: 'major' | 'minor' | 'custom';
	}

	export interface TimePeriod {
		name: string;
		startYear: number;
		endYear: number;
		color?: string;
		generations?: { name: string; startYear: number; endYear: number }[];
	}

	export let periods: TimePeriod[] = [];
	export let events: TimeEvent[] = [];
	export let customEvents: TimeEvent[] = [];
	export let highlightedPeriods: string[] = [];
	export let highlightedDates: number[] = [];
	export let highlightedRanges: { start: number; end: number; label?: string; color?: string }[] = [];
	export let startYear = -200;
	export let endYear = 600;

	const totalYears = endYear - startYear;

	function getPosition(year: number): number {
		return ((year - startYear) / totalYears) * 100;
	}

	function isHighlighted(period: TimePeriod): boolean {
		return highlightedPeriods.includes(period.name);
	}

	function isDateHighlighted(year: number): boolean {
		return highlightedDates.includes(year);
	}

	function formatYear(year: number): string {
		return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
	}

	const defaultPeriods: TimePeriod[] = [
		{
			name: 'Zugot',
			startYear: -170,
			endYear: -10,
			color: '#e5e7eb'
		},
		{
			name: 'Tannaim',
			startYear: -10,
			endYear: 220,
			color: '#d1d5db'
		},
		{
			name: 'Amoraim',
			startYear: 220,
			endYear: 500,
			color: '#9ca3af'
		},
		{
			name: 'Savoraim',
			startYear: 500,
			endYear: 600,
			color: '#6b7280'
		}
	];

	const defaultEvents: TimeEvent[] = [
		{ year: -165, label: 'Maccabean Revolt', type: 'major' },
		{ year: 70, label: 'Temple Destroyed', type: 'major' },
		{ year: 132, label: 'Bar Kochba Rebellion', type: 'major' },
		{ year: 200, label: 'Mishnah Compiled', type: 'major' },
		{ year: 400, label: 'Yerushalmi Compiled', type: 'major' },
		{ year: 500, label: 'Bavli Compiled', type: 'major' }
	];

	if (periods.length === 0) periods = defaultPeriods;
	if (events.length === 0) events = defaultEvents;

	// Combine all events
	const allEvents = [...events, ...customEvents];
	
	// Add highlighted dates as minor dots if they don't exist in events
	highlightedDates.forEach(year => {
		if (!allEvents.some(e => e.year === year)) {
			allEvents.push({ year, label: '', type: 'minor' });
		}
	});

	// Improved label staggering to prevent overlap
	const processedEvents = allEvents.map((event, index) => {
		const position = getPosition(event.year);
		return { ...event, position, index };
	});

	// Sort events with labels by position for collision detection
	const eventsWithLabels = processedEvents.filter(e => e.label).sort((a, b) => a.position - b.position);
	
	// Calculate label offsets with better collision detection
	const labelOffsets = new Map();
	const occupiedRanges = []; // Array of {start, end, level} for occupied label spaces
	
	eventsWithLabels.forEach(event => {
		const labelWidth = 12; // Approximate width in percentage
		const start = event.position - labelWidth / 2;
		const end = event.position + labelWidth / 2;
		
		let level = 0;
		// Find the lowest available level
		for (let testLevel = 0; testLevel <= 2; testLevel++) {
			const hasCollision = occupiedRanges.some(range => 
				range.level === testLevel && 
				!(end < range.start || start > range.end)
			);
			
			if (!hasCollision) {
				level = testLevel;
				break;
			}
		}
		
		occupiedRanges.push({ start, end, level });
		labelOffsets.set(event.index, level);
	});

	// Apply calculated offsets
	processedEvents.forEach(event => {
		event.labelOffset = labelOffsets.get(event.index) || 0;
	});

	// Generate year ticks (major and minor)
	const yearTicks = [];
	const majorInterval = 100;
	const minorInterval = 50;
	
	for (let year = Math.ceil(startYear / majorInterval) * majorInterval; year <= endYear; year += majorInterval) {
		yearTicks.push({ year, major: true });
	}
	
	for (let year = Math.ceil(startYear / minorInterval) * minorInterval; year <= endYear; year += minorInterval) {
		if (year % majorInterval !== 0) {
			yearTicks.push({ year, major: false });
		}
	}
</script>

<div class="timeline-container">
	<!-- Event labels at top -->
	<div class="event-labels">
		{#each processedEvents.filter(e => e.label) as event}
			<div 
				class="event-label-container"
				class:offset={event.labelOffset === 1}
				class:offset-2={event.labelOffset === 2}
				style="left: {getPosition(event.year)}%"
			>
				<div class="event-label-text">{event.label}</div>
			</div>
		{/each}
	</div>

	<div class="timeline">
		<!-- Main timeline line -->
		<div class="timeline-line" />

		<!-- Event dots on line -->
		{#each processedEvents as event}
			<div
				class="event-dot"
				class:major={event.type === 'major'}
				class:minor={event.type === 'minor'}
				class:custom={event.type === 'custom'}
				class:highlighted={isDateHighlighted(event.year)}
				style="left: {getPosition(event.year)}%"
			/>
		{/each}

		<!-- Periods bar below with spacing -->
		<div class="periods-bar">
			{#each periods as period, i}
				{@const gapPercent = 0.5} <!-- Small gap between periods -->
				{@const leftPos = i === 0 ? getPosition(period.startYear) : getPosition(period.startYear) + gapPercent}
				{@const width = i === periods.length - 1 
					? getPosition(period.endYear) - getPosition(period.startYear) 
					: getPosition(period.endYear) - getPosition(period.startYear) - gapPercent}
				
				<div
					class="period"
					class:highlighted={isHighlighted(period)}
					style="
						left: {leftPos}%;
						width: {width}%;
						background-color: {period.color || '#e5e7eb'};
					"
				>
					<span class="period-label">{period.name.toUpperCase()}</span>
				</div>
			{/each}
		</div>

		<!-- Range markers (block with lines on timeline) -->
		{#each highlightedRanges as range}
			{@const rangeColor = range.color || '#3b82f6'}
			<div
				class="range-block"
				style="
					left: {getPosition(range.start)}%;
					width: {getPosition(range.end) - getPosition(range.start)}%;
					background: {rangeColor}20;
				"
			/>
			<div
				class="range-marker-start"
				style="
					left: {getPosition(range.start)}%;
					background: {rangeColor};
				"
			/>
			<div
				class="range-marker-end"
				style="
					left: {getPosition(range.end)}%;
					background: {rangeColor};
				"
			/>
			{#if range.label}
				<div
					class="range-label"
					style="
						left: {(getPosition(range.start) + getPosition(range.end)) / 2}%;
						color: {rangeColor};
					"
				>
					{range.label}
				</div>
			{/if}
		{/each}

		<!-- Year ticks and labels at bottom -->
		<div class="year-axis">
			{#each yearTicks as tick}
				<div 
					class="year-tick"
					class:major={tick.major}
					style="left: {getPosition(tick.year)}%"
				/>
				{#if tick.major}
					<div class="year-label" style="left: {getPosition(tick.year)}%">
						{formatYear(tick.year)}
					</div>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	.timeline-container {
		width: 100%;
		padding: 1rem;
		background: white;
		overflow-x: auto;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.event-labels {
		position: relative;
		height: 45px;
		margin-bottom: 2px;
		min-width: 900px;
	}

	.event-label-container {
		position: absolute;
		transform: translateX(-50%);
		text-align: center;
		bottom: 0;
		transition: bottom 0.2s ease;
	}

	.event-label-container.offset {
		bottom: 14px;
	}

	.event-label-container.offset-2 {
		bottom: 28px;
	}

	.event-label-text {
		font-size: 10px;
		font-weight: 400;
		color: #4b5563;
		white-space: nowrap;
		line-height: 1.2;
	}

	.timeline {
		position: relative;
		min-width: 900px;
		height: 120px;
		margin: 0 auto;
	}

	.timeline-line {
		position: absolute;
		top: 20px;
		left: 0;
		right: 0;
		height: 2px;
		background: #000;
		border-radius: 1px;
	}

	.event-dot {
		position: absolute;
		top: 20px;
		transform: translate(-50%, -50%);
		width: 10px;
		height: 10px;
		background: black;
		border-radius: 50%;
		z-index: 3;
	}

	.event-dot.minor {
		width: 6px;
		height: 6px;
		background: #9ca3af;
	}

	.event-dot.custom {
		background: #7c3aed;
	}

	.event-dot.highlighted {
		background: #3b82f6;
		box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.2);
	}

	.periods-bar {
		position: absolute;
		top: 45px;
		height: 25px;
		width: 100%;
	}

	.period {
		position: absolute;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
	}

	.period.highlighted {
		outline: 2px solid #3b82f6;
		outline-offset: 1px;
	}

	.period-label {
		font-size: 10px;
		font-weight: 600;
		color: #374151;
		letter-spacing: 0.08em;
		opacity: 0.85;
	}

	.range-block {
		position: absolute;
		top: 16px;
		height: 10px;
		z-index: 1;
		border-radius: 2px;
	}

	.range-marker-start,
	.range-marker-end {
		position: absolute;
		top: 12px;
		width: 2px;
		height: 16px;
		transform: translateX(-50%);
		z-index: 2;
		border-radius: 1px;
	}

	.range-label {
		position: absolute;
		top: 30px;
		transform: translateX(-50%);
		font-size: 9px;
		font-weight: 500;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.year-axis {
		position: absolute;
		top: 85px;
		width: 100%;
		height: 35px;
	}

	.year-tick {
		position: absolute;
		top: 0;
		width: 1px;
		height: 4px;
		background: #9ca3af;
		transform: translateX(-50%);
		border-radius: 0.5px;
	}

	.year-tick.major {
		height: 6px;
		background: #6b7280;
	}

	.year-label {
		position: absolute;
		top: 10px;
		transform: translateX(-50%);
		font-size: 10px;
		color: #6b7280;
		font-weight: 400;
	}

	@media (max-width: 768px) {
		.timeline-container {
			padding: 0.5rem;
		}

		.event-label-text {
			font-size: 10px;
		}

		.year-label {
			font-size: 9px;
		}
	}
</style>