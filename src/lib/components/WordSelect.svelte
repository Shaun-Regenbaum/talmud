<script lang="ts">
	import { onMount } from 'svelte';

	export let sentences: string[];
	export let word = '';
	export let selected: number;
	$: sentence = sentences[selected];

	$: words = sentences.length > 0 ? sentence.split(' ') : '';
</script>

{#if words}
	<div class="w-fit my-4 ml-12 p-4 bg-gray-200 rounded border-black border-2">
		{#each words as singleWord}
			<button
				on:click={(event) => {
					word = event.currentTarget.innerHTML;
				}}
				class="hover:bg-blue-200 underline-offset-4 underline text-gr"
			>
				{singleWord}</button
			><span>{' '}</span>
		{/each}
	</div>
	<p>{word}</p>
{:else}
	<p>Nothing Yet</p>
{/if}
