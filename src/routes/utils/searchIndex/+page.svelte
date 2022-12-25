<script lang="ts">
    let data: any;
	async function getIndex() {
		fetch('/utils/searchIndex').then(
            (response) => {
                console.log(response);
                data = response.json();
            }
        )

	}
</script>

<button on:click={getIndex}>Search the Index</button>

{#await data}
    <p>loading...</p>
{:then data} 
{#if data !== undefined}
	<pre>{JSON.stringify(data, undefined, 2)}</pre>
{:else}
    <p>Nothing here. </p>
{/if}
{/await}
