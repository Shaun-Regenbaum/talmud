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
	<button class="m-4 p-1 bg-red-200">Get Text</button>
</form>

<p>Choose a number:</p>
<input
	type="number"
	class="bg-red-200 border-black border-2"
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
	class="m-4 p-1 bg-red-200">Translate</button
>

{#if awaitedAnswer}
	<p>{awaitedAnswer}</p>
{/if}
