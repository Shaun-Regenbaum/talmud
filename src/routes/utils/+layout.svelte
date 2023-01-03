<script lang="ts">
	import NavBar from '$lib/components/NavBar.svelte';
	import type { NavBarData } from '$lib/types';

	export let data: { items: NavBarData[] };
</script>

<NavBar
	items={data.items}
	selected={1}
/>

<slot />
