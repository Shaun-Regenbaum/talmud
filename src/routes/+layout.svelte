<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/NavBar.svelte';
	import type { NavBarData } from '$lib/types';

	export let data: { navBar: NavBarData[] };
</script>

<NavBar
	selected={3}
	items={data.items}
/>
<slot />
