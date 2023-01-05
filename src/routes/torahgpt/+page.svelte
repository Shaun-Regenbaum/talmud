<script lang="ts">
	import Answer from '$lib/components/Answer.svelte';
	let text: string = '';
	let answer: Promise<string> | undefined = undefined;
	let hideExamples = true;

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

<div class="font-light overflow-hidden bg-white divide-y divide-gray-300 ">
	<div class="p-4 sm:px-6">
		<h1 class="text-3xl leading-6 text-gray-900">
			This is a <span class="font-bold">demo</span>.
		</h1>

		<div
			class="w-fit h-fit mt-4 p-2  bg-gray-100 rounded-lg shadow-sm border-gray-300 border"
		>
			<p class="ml-4 text-sm max-w-sm font-medium text-gray-700">
				Please <span class="underline">do not</span> use this for any serious halachic
				questions.
			</p>
			<div
				class="w-fit h-fit ml-3 my-3 py-1 px-2 rounded-xl bg-red-200 shadow-sm"
			>
				<p class="text-xs text-gray-800">
					The current tested accuracy is <span class="text-red-400"
						>below 45%.</span
					>
				</p>
			</div>
			<p class="ml-4 mb-3 text-sm max-w-sm font-medium text-gray-700">
				We are actively working on improving the results and the ability to
				quote sources.
			</p>
			<p class="ml-4 text-sm max-w-sm font-medium text-gray-700">
				If you don't know what this is, click <a
					href="/torahgpt/faq?what_is_this"
					class="underline underline-offset-2 text-blue-500">here</a
				> to find out more.
			</p>
			<p class="ml-4 text-sm max-w-sm font-medium text-gray-700">
				If you want to contribute, click <a
					href="/torahgpt/faq?contribute"
					class="underline underline-offset-2 text-blue-500">here</a
				> to learn how.
			</p>
		</div>
	</div>
	<div class=" px-4 py-5 sm:px-6">
		<label
			for="question"
			class="block  text-sm font-medium text-gray-700"
			>Ask a Question to TorahGPT:</label
		>
		<input
			name="question"
			bind:value={text}
			placeholder="What does the Rambam say to do if the seventeenth of Marcheshvan has arrived and no rains have yet descended?"
			class="block min-w-[300px] p-3 border-gray-300 border hover:bg-gray-50 focus:bg-gray-50 rounded-md shadow-sm sm:text-sm"
		/>
		<button
			class=" my-1 text-xs"
			on:click={() => {
				hideExamples = !hideExamples;
			}}
		>
			Click <span>here</span> for some examples.
		</button>
		<ul
			hidden={hideExamples}
			class="ml-2 text-xs"
		>
			<li>
				- "What does the Rambam say to do if the seventeenth of Marcheshvan has
				arrived and no rains have yet descended?"
			</li>
			<li>
				- "Do I have to replace my tzitzit if some of the string breaks at the
				loop connecting the beged?"
			</li>
		</ul>

		<button
			class="block mt-2 px-4 py-2 text-sm font-medium items-center rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
			on:click={() => {
				answer = getCompletion();
			}}>Ask</button
		>
	</div>
	<div class="px-4 py-5 sm:p-6">
		<Answer
			{answer}
			bind:question={text}
		/>
	</div>
</div>
