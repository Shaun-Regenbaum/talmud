<script lang="ts">
	// @ts-ignore
	import dafRenderer from 'daf-renderer';
	import { onMount } from 'svelte';
	import type { DafData } from '$lib/types';

	export let data: DafData;
	export let form: DafData;
	$: amud = form ? form.amud : 'b';

	const masechtot = [
		'Brachot',
		'Shabbat',
		'Eruvin',
		'Pesachim',
		'Shekalim',
		'Yoma',
		'Sukkah',
		'Beitzah',
		'RoshHashana',
		'Taanit',
		'megillah',
		'moed katan',
		'chagigah',
		'yevamot',
		'ketubot',
		'nedarim',
		'nazir',
		'sotah',
		'gitin',
		'kidushin',
		'bava kamma',
		'bava metzia',
		'bava batra',
		'sanhedrin',
		'makkot',
		'shevuot',
		'avodah zarah',
		'horayot',
		'zevachim',
		'menachot',
		'chullin',
		'bechorot',
		'arachin',
		'temurah',
		'keritot',
		'meilah',
		'tamid',
		'middot',
		'kinot',
		'niddah',
	];

	const dafNumbers = Array.from(Array(100).keys()).map((i) => i + 1);

	const options = {
		contentWidth: '650px',
		fontSize: {
			side: '10.5px',
		},
		padding: {
			vertical: '0px',
		},
		lineHeight: {
			main: '16px',
		},
		mainWidth: '42%',
		lineBreaks: 'br',
	};
	onMount(async () => {
		// @ts-ignore as the type definitions are not up to date for daf-renderer
		const renderer = dafRenderer('#daf-container', options);
		// When you have complex inputs such as above, you may have to put the render function in a timeout as Chromium struggles to provide the inputs fast enough. What this is doing is essentially giving Chrome an extra 10 millisenconds to process the inputs.
		//wait 100 ms
		setTimeout(() => {
			//render the daf
			renderer.render(data.main, data.rashi, data.tosafot, amud);
		}, 80);
	});
</script>

<main class="box-border text-gray-700 p-4">
	<form method="POST">
		<select>
			{#each masechtot as masechet}
				<option value={masechet}>{masechet}</option>
			{/each}
		</select>
		<select>
			{#each dafNumbers as number}
				<option value={number}>{number}</option>
			{/each}
		</select>
		<select>
			<option value="a">a</option>
			<option value="b">b</option>
		</select>
		<button type="submit">Submit</button>
	</form>

	<h1>Daf</h1>
	<div class="block pl-50 w-full">
		<div
			class="block"
			id="daf-container"
		/>
	</div>
</main>

<style>
	#daf-container {
		direction: rtl;
		text-align-last: justify !important;
	}

	span {
		display: inline-block;
	}
</style>
