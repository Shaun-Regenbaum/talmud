<script>
	import { createEventDispatcher } from 'svelte';
	
	export let label;
	export let value;
	export let min = 0;
	export let max = 100;
	export let step = 1;
	export let unit = '';
	
	const dispatch = createEventDispatcher();
	
	// Convert string values to numbers for slider
	$: numValue = parseFloat(value) || 0;
	
	function handleInput(event) {
		const newVal = event.target.value;
		value = unit ? `${newVal}${unit}` : newVal;
		dispatch('input', value);
	}
</script>

<div class="space-y-2">
	<div class="flex justify-between items-center">
		<label class="block text-sm text-gray-600">{label}</label>
		<span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{value}</span>
	</div>
	<input 
		type="range" 
		{min} 
		{max} 
		{step}
		value={numValue}
		on:input={handleInput}
		class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
	/>
</div>

<style>
	.slider::-webkit-slider-thumb {
		appearance: none;
		height: 20px;
		width: 20px;
		border-radius: 50%; 
		background: #3B82F6;
		cursor: pointer;
	}

	.slider::-moz-range-thumb {
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: #3B82F6;
		cursor: pointer;
		border: none;
	}
</style>