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
	
	let expanded = $state(false);
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
				<div class="flex items-center gap-2 text-xs text-gray-500">
					{#if summary.cached}
						<span class="px-2 py-1 bg-gray-100 rounded">Cached</span>
						<button 
							onclick={handleRefresh}
							class="px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition text-xs"
							disabled={loading}
						>
							🔄 Refresh
						</button>
					{:else}
						<span class="px-2 py-1 bg-green-100 text-green-600 rounded">Fresh</span>
					{/if}
					<span>{summary.wordCount} words</span>
				</div>
			</div>
			<div class="text-gray-400 transition-transform {expanded ? 'rotate-180' : ''}">
				▼
			</div>
		</button>
		{#if expanded}
			<div class="px-4 pb-4 border-t border-gray-100">
				<div class="prose max-w-none text-gray-700 leading-relaxed text-sm mt-3">
					{@html renderMarkdown(summary.summary)}
				</div>
				{#if !summary.cached && summary.generated}
					<div class="mt-3 text-xs text-gray-400">
						Generated with {summary.model || 'AI'} • {new Date(summary.generated).toLocaleString()}
					</div>
				{/if}
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