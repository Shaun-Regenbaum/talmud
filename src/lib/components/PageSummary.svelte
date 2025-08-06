<!--
	@component PageSummary
	
	Displays AI-generated summary of a Talmud page.
	Supports loading states, error handling, and refresh functionality.
	
	@example
	```svelte
	<PageSummary
		summary={summaryData}
		loading={false}
		error={null}
		on:refresh={() => loadSummary(true)}
	/>
	```
-->
<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { createEventDispatcher } from 'svelte';
	
	/**
	 * Component props interface
	 */
	interface Props {
		/** Summary data object */
		summary: {
			summary: string;
			cached: boolean;
			wordCount: number;
			model?: string;
			generated?: string;
		} | null;
		/** Whether summary is loading */
		loading?: boolean;
		/** Error message if load failed */
		error?: string | null;
	}
	
	let { 
		summary = null,
		loading = false,
		error = null
	}: Props = $props();
	
	let expanded = $state(false); // Default to collapsed
	const dispatch = createEventDispatcher();
	
	function handleRefresh(e: MouseEvent) {
		e.stopPropagation();
		dispatch('refresh');
	}
</script>

{#if loading}
	<div class="border border-gray-200 rounded-lg p-4 bg-white">
		<div class="flex items-center gap-2">
			<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
			<span class="text-sm text-gray-600">Loading page summary...</span>
		</div>
	</div>
{:else if summary}
	<div class="border border-gray-200 rounded-lg bg-white">
		<button 
			onclick={() => expanded = !expanded}
			class="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
		>
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-gray-700">📖 Page Summary</span>
			</div>
			<div class="text-gray-400 transition-transform {expanded ? 'rotate-180' : ''}">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</div>
		</button>
		{#if expanded}
			<div class="px-4 pb-3 border-t border-gray-100">
				<div class="prose prose-sm max-w-none text-gray-700 leading-relaxed mt-4 
					prose-headings:text-gray-800 prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-4
					prose-p:mb-3 prose-ul:mb-3 prose-li:mb-1
					prose-strong:text-gray-800 prose-em:text-gray-600">
					{@html renderMarkdown(summary.summary)}
				</div>
				
				<div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
					<div class="flex items-center gap-3 text-xs text-gray-500">
						{#if summary.cached}
							<span class="inline-flex items-center gap-1">
								<span class="w-2 h-2 bg-gray-400 rounded-full"></span>
								Cached
							</span>
						{:else}
							<span class="inline-flex items-center gap-1">
								<span class="w-2 h-2 bg-green-500 rounded-full"></span>
								Fresh
							</span>
						{/if}
						<span class="text-gray-400">•</span>
						<span>{summary.model?.replace('anthropic/', '').replace('-', ' ') || 'AI'}</span>
						{#if summary.generated}
							<span class="text-gray-400">•</span>
							<span>{new Date(summary.generated).toLocaleTimeString()}</span>
						{/if}
					</div>
					
					{#if summary.cached}
						<button 
							onclick={handleRefresh}
							class="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition"
							disabled={loading}
							title="Refresh summary"
						>
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							Refresh
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{:else if error}
	<div class="border border-red-200 rounded-lg p-4 bg-red-50">
		<div class="flex items-center justify-between">
			<div>
				<span class="text-sm font-medium text-red-800">Summary Error</span>
				<p class="text-red-600 mt-1 text-sm">{error}</p>
			</div>
			<button 
				onclick={() => dispatch('retry')}
				class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition text-xs"
			>
				Retry
			</button>
		</div>
	</div>
{/if}