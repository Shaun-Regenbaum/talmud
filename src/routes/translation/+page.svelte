<script lang="ts">
	import WordSelect from '$lib/components/WordSelect.svelte';
	let awaitedAnswer: string;
	let chosenWord: string;
	let selected = 0;
	let loading = false;

	export let form: any;
	$: hebrew = form ? form.he : [];
	$: text = form ? form.text : [];
	async function getTranslation() {
		loading = true;
		return fetch('/translation', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				aramaic: hebrew[selected],
				english: text[selected],
				word: chosenWord,
			}),
		})
			.then(async (response) => {
				const result = response.text();
				console.log(result);
				awaitedAnswer = (await result).slice(1, -1);
				loading = false;
				return awaitedAnswer;
			})
			.catch(() => {
				throw new Error(chosenWord);
			});
	}
</script>

<form method="POST">
	<p>Masechet:</p>
	<input
		id="ref"
		name="ref"
		type="text"
		class="inline-block w-[300px] ml-4 p-2 rounded-md border-gray-300 border-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
	/>
	<button
		class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
		>Get Text</button
	>
</form>

<p>Choose a Section:</p>
<input
	type="number"
	class="inline-block w-[300px] ml-4 p-2 rounded-md border-gray-300 border-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
	max={form ? form.text.length : 1}
	bind:value={selected}
/>
<WordSelect
	sentences={hebrew}
	bind:word={chosenWord}
	bind:selected
/>

<button
	on:click={() => {
		getTranslation();
	}}
	class="inline-block ml-12 items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
>
	Translate</button
>

{#if awaitedAnswer}
	<div class="bg-gray-200 border-black border-2 rounded ml-12 mt-12 p-4">
		<p>{awaitedAnswer}</p>
	</div>
{/if}
