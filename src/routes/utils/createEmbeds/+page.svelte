<script lang="ts">
    let data: any;
	async function getIndex() {
		const response = await fetch('/utils/createEmbeds');
		data = await response.json();
	}
</script>

<button on:click={getIndex}>Create Embeds</button>

{#await data}
    <p>loading...</p>
{:then data} 
{#if data !== undefined}
	<pre>{JSON.stringify(data, undefined, 2)}</pre>
{:else}
    <p>Nothing here. </p>
{/if}
{/await}
