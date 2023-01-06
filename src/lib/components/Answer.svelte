<script lang="ts">
	export let answer: Promise<string> | undefined;
	export let awaitedAnswer: string | undefined;
	export let question: string;

	$: console.log(answer);
</script>

<div class="overflow-hidden rounded-lg bg-white shadow">
	<div class="px-4 py-5 sm:p-6 space-y-3">
		<p><span class="bg-slate-200 p-1 shadow rounded-lg">Q:</span> {question}</p>
		{#if answer}
			{#await answer}
				<p>A: Working on it...</p>
			{:then}
				<p>
					<span class="bg-slate-200 p-1 shadow rounded-lg">A:</span>
					{awaitedAnswer}
				</p>
			{/await}
		{:else}
			<p><span class="bg-slate-200 p-1 shadow rounded-lg">A:</span> ...</p>
		{/if}
	</div>
</div>
