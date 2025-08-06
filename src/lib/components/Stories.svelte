<!--
	@component Stories
	
	Displays AI-generated stories for a Talmud page.
	Supports loading states, error handling, tabs for story types, and refresh functionality.
	
	@example
	```svelte
	<Stories
		stories={storiesData}
		loading={false}
		error={null}
		on:refresh={() => loadStories(true)}
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
		/** Stories data object */
		stories: {
			stories: Array<{
				type: string;
				title: string;
				content: string;
				wordCount: number;
				model?: string;
			}>;
			cached: boolean;
			generated?: string;
			totalWords: number;
		} | null;
		/** Whether stories are loading */
		loading?: boolean;
		/** Error message if load failed */
		error?: string | null;
	}
	
	let { 
		stories = null,
		loading = false,
		error = null
	}: Props = $props();
	
	let expanded = $state(true); // Default to expanded for immediate reading
	let activeTab = $state('main-discussion'); // Default to main discussion tab
	const dispatch = createEventDispatcher();
	
	function handleRefresh(e: MouseEvent) {
		e.stopPropagation();
		dispatch('refresh');
	}
	
	function getStoryByType(type: string) {
		return stories?.stories?.find(s => s.type === type);
	}
</script>

{#if loading}
	<div class="border border-gray-200 rounded-lg p-4 bg-white">
		<div class="flex items-center gap-2">
			<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
			<span class="text-sm text-gray-600">Generating stories...</span>
		</div>
	</div>
{:else if stories && stories.stories}
	<div class="border border-gray-200 rounded-lg bg-white">
		<button 
			onclick={() => expanded = !expanded}
			class="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
		>
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-gray-700">📚 Talmud Stories</span>
			</div>
			<div class="text-gray-400 transition-transform {expanded ? 'rotate-180' : ''}">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</div>
		</button>
		
		{#if expanded}
			<div class="border-t border-gray-100">
				<!-- Tab Navigation -->
				<div class="flex border-b border-gray-200">
					<button
						onclick={() => activeTab = 'main-discussion'}
						class="flex-1 px-4 py-3 text-sm font-medium transition-colors
							{activeTab === 'main-discussion' 
								? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' 
								: 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}"
					>
						The Main Discussion
					</button>
					<button
						onclick={() => activeTab = 'historical-fiction'}
						class="flex-1 px-4 py-3 text-sm font-medium transition-colors
							{activeTab === 'historical-fiction' 
								? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' 
								: 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}"
					>
						Historical Fiction
					</button>
				</div>
				
				<!-- Story Content -->
				<div class="px-4 pb-3">
					{#if getStoryByType(activeTab)}
						{@const activeStory = getStoryByType(activeTab)}
						<div class="prose prose-sm max-w-none text-gray-700 leading-relaxed mt-4
							prose-headings:text-gray-800 prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-4
							prose-p:mb-3 prose-ul:mb-3 prose-li:mb-1
							prose-strong:text-gray-800 prose-em:text-gray-600">
							{@html renderMarkdown(activeStory.content)}
						</div>
					{:else}
						<div class="py-8 text-center text-gray-500">
							<p>Story content not available</p>
						</div>
					{/if}
					
					<!-- Footer with cache status and refresh -->
					<div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
						<div class="flex items-center gap-3 text-xs text-gray-500">
							{#if stories.cached}
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
							<span>{getStoryByType(activeTab)?.model?.replace('anthropic/', '').replace('-', ' ') || 'AI'}</span>
							{#if stories.generated}
								<span class="text-gray-400">•</span>
								<span>{new Date(stories.generated).toLocaleTimeString()}</span>
							{/if}
						</div>
						
						{#if stories.cached}
							<button 
								onclick={handleRefresh}
								class="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition"
								disabled={loading}
								title="Refresh stories"
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
			</div>
		{/if}
	</div>
{:else if error}
	<div class="border border-red-200 rounded-lg p-4 bg-red-50">
		<div class="flex items-center justify-between">
			<div>
				<span class="text-sm font-medium text-red-800">Stories Error</span>
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