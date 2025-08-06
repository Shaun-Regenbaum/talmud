<!--
	@component PageNavigator
	
	Navigation controls for selecting Talmud tractate, page, and amud.
	Includes a "Go" button and link to stories page.
	
	@example
	```svelte
	<PageNavigator
		tractate="Berakhot"
		page="2"
		amud="a"
		loading={false}
		vilnaMode={true}
		on:change={handlePageChange}
	/>
	```
-->
<script lang="ts">
	import { TRACTATE_OPTIONS, getHebrewPageNumber } from '$lib/constants/tractates';
	import { createEventDispatcher } from 'svelte';
	
	/**
	 * Component props interface
	 */
	interface Props {
		/** Current tractate name */
		tractate: string;
		/** Current page number */
		page: string;
		/** Current amud (a or b) */
		amud: string;
		/** Whether the page is loading */
		loading?: boolean;
		/** Whether in Vilna mode */
		vilnaMode?: boolean;
	}
	
	let { 
		tractate = $bindable(),
		page = $bindable(),
		amud = $bindable(),
		loading = false,
		vilnaMode = false
	}: Props = $props();
	
	const dispatch = createEventDispatcher();
	
	function handleChange() {
		dispatch('change', { tractate, page, amud });
	}
</script>

<div class="flex items-center gap-4 flex-wrap">
	<!-- Tractate Selector -->
	<div class="flex items-center gap-2">
		<label for="tractate-select" class="text-sm font-medium text-gray-700">מסכת:</label>
		<select 
			id="tractate-select"
			bind:value={tractate}
			class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
			disabled={loading}
		>
			{#each TRACTATE_OPTIONS as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>
	
	<!-- Page Number Input -->
	<div class="flex items-center gap-2">
		<label for="page-select" class="text-sm font-medium text-gray-700">דף:</label>
		<select 
			id="page-select"
			bind:value={page}
			class="border border-gray-300 rounded px-3 py-2 text-sm bg-white w-20"
			disabled={loading}
		>
			{#each Array.from({length: 76}, (_, i) => i + 2) as pageNum}
				<option value={pageNum.toString()}>{getHebrewPageNumber(pageNum)}</option>
			{/each}
		</select>
	</div>
	
	<!-- Amud Selector -->
	<div class="flex items-center gap-2">
		<label for="amud-select" class="text-sm font-medium text-gray-700">עמוד:</label>
		<select 
			id="amud-select"
			bind:value={amud}
			class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
			disabled={loading}
		>
			<option value="a">א</option>
			<option value="b">ב</option>
		</select>
	</div>
	
	<!-- Go Button -->
	<button 
		onclick={handleChange}
		class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition text-sm font-medium flex items-center gap-2"
		disabled={loading}
	>
		{#if loading}
			<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
		{/if}
		{loading ? 'טוען...' : 'עבור'}
	</button>
	
	<!-- Story Link -->
	<a 
		href="/story?tractate={tractate}&page={page}&amud={amud}&mode={vilnaMode ? 'vilna' : 'custom'}"
		class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm font-medium"
	>
		Go to Stories
	</a>
</div>