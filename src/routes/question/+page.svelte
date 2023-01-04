<script lang="ts">
	import Answer from '$lib/components/Answer.svelte';
	let text: string = '';
	let answer: Promise<string> | undefined = undefined;

	async function getCompletion() {
		console.log('asking...');
		const response = await fetch('/question', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				question: text,
			}),
		});

		const result = await response.text();

		if (response.ok) {
			return result.slice(5, -1);
		} else {
			throw new Error(text);
		}
	}
</script>

<div
	class="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow"
>
	<div class="border-b border-gray-200 bg-white px-4 py-5 sm:px-6">
		<h3 class="text-3xl font-medium leading-6 text-gray-900">
			This is an ongoing experiment.
		</h3>
		<p class="mt-4 ml-4 text-sm max-w-sm font-medium text-gray-700">
			Please do not use this for any serious halachic questions. We are actively
			working on improving the results and the ability to quote sources.
		</p>
		<div class="mt-4 ml-4">
			<p class="text-sm">
				The current tested accuracy is <span class="text-red-500"
					>below 45%.</span
				>
			</p>
		</div>
	</div>
	<div class="px-4 py-5 sm:px-6">
		<label
			for="question"
			class="block ml-4 text-sm font-medium text-gray-700"
			>Put your Halachic Question Here:</label
		>
		<input
			name="question"
			bind:value={text}
			placeholder="What does the Rambam say to do if the seventeenth of Marcheshvan has arrived and no rains have yet descended?"
			class="block whitespace-pre-wrap min-w-[300px] w-full ml-4 p-3 rounded-md border-gray-300 border-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
		/>
		<div class="m-4">
			<button
				class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
				on:click={() => {
					answer = getCompletion();
				}}>Ask</button
			>
		</div>
	</div>
	{#if answer}
		<div class="px-4 py-5 sm:p-6">
			{#await answer}
				<div class="flex justify-center">
					<div
						class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"
					/>
				</div>
			{:then answer}
				<Answer {answer} />
			{/await}
		</div>
	{:else}
		<div class="px-4 py-5 sm:p-6">
			<Answer answer="Ask a question!" />
		</div>
	{/if}
</div>
