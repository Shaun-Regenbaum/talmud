<script lang="ts">
	import type { NavBarData } from '$lib/types';
	import { onMount } from 'svelte';

	// get current path

	export let items: NavBarData[];
	export let selected = 1;
	onMount(() => {
		const path = window.location.pathname;
		//split path into array
		const pathArray = path.split('/');

		// This is to handle nested navBar up to 1 level deep, will not work more than that...
		if (items.findIndex((item) => item.link === '/' + pathArray[1]) !== -1) {
			selected =
				items.findIndex((item) => item.link === '/' + pathArray[1]) + 1;
		} else {
			selected = items.findIndex((item) => item.link === path) + 1;
		}
	});
	export let menuShow = false;
	const selectedStyle = 'text-white bg-gray-900';
	const unselectedStyle =
		'text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium';
</script>

<nav class="bg-gray-800 pb-2">
	<div class="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
		<div class="relative flex h-16 items-center justify-between">
			<div class="absolute inset-y-0 left-0 flex items-center sm:hidden">
				<!-- Mobile menu button-->
				<button
					type="button"
					on:click={() => {
						menuShow = !menuShow;
					}}
					class="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
					aria-controls="mobile-menu"
					aria-expanded="false"
				>
					<span class="sr-only">Open main menu</span>

					<svg
						class="block h-6 w-6"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
						/>
					</svg>
				</button>
				<h1 class="text-white">{' ' + items[selected - 1].name}</h1>
			</div>
			<div
				class="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start"
			>
				<div class="hidden sm:ml-6 sm:block">
					<div class="flex flex-wrap space-x-4">
						{#each items as item}
							<a
								href={item.link}
								on:click={() => {
									selected = item.index;
								}}
								class={(item.index == selected
									? selectedStyle
									: unselectedStyle) +
									' ' +
									'px-3 py-2 rounded-md text-sm font-medium'}
								aria-current={item.index == selected ? 'true' : 'false'}
								>{item.name}</a
							>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Mobile menu, show/hide based on menu state. -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div
		class="sm:hidden"
		id="mobile-menu"
		hidden={menuShow}
	>
		<div class="space-y-1 px-2 pt-2 pb-3">
			{#each items as item}
				<a
					href={item.link}
					on:click={() => {
						selected = item.index;
					}}
					class={(item.index == selected ? selectedStyle : unselectedStyle) +
						' ' +
						'block px-3 py-2 rounded-md text-base font-medium'}
					aria-current={item.index == selected ? 'true' : 'false'}
					>{item.name}</a
				>
			{/each}
		</div>
	</div>
</nav>
