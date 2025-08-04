<script>
	export let label;
	export let value;
	export let placeholder = '';
</script>

<div class="space-y-1">
	<label class="block text-sm text-gray-600">{label}</label>
	<input 
		type="text" 
		bind:value={value}
		{placeholder}
		class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
	/>
</div>