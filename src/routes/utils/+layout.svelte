<script lang="ts">
import NavBar from '$lib/components/NavBar.svelte';
import type { NavBarData } from '$lib/types';

export let data: {navBar: NavBarData[]};
</script>

<NavBar items={data.navBar}></NavBar>
<slot/>