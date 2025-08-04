<script>
	import { createEventDispatcher } from 'svelte';
	
	export let label;
	export let value;
	export let options = [];
	
	const dispatch = createEventDispatcher();
	
	function handleChange(event) {
		value = event.target.value;
		dispatch('change', value);
	}
</script>

<div class="space-y-1">
	<label class="block text-sm text-gray-600">{label}</label>
	<select 
		{value}
		on:change={handleChange}
		class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
	>
		{#each options as option}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</div>