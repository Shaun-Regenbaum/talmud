<script lang="ts">
	export let abbr: string;
	export let expanded: string;
	export let link: string | undefined = undefined;
	let hideExpanded: boolean = true;
</script>

<span
	><button
		on:click={() => {
			hideExpanded = !hideExpanded;
		}}
		class="inline border-b-2 border-dashed hover:bg-gray-100"
		>{abbr}<span
			hidden={!hideExpanded}
			class="text-xs text-gray-600 align-super">{'(?)'}</span
		>
	</button>
</span>
<p
	hidden={hideExpanded}
	class={'p-3 my-2 text-sm text-gray-600 bg-gray-50 rounded-lg shadow outline '}
>
	{expanded}
</p>
