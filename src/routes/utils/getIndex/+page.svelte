<script lang="ts">
    let data: any;
	async function getIndex() {
        let ref = 'Mishneh_Torah,_Transmission_of_the_Oral_Law';
        ref =   ref.replace(' ', '_');
        ref = ref.replace(',', '%2C');
		const response = await fetch('/utils/getIndex?ref=Mishneh_Torah,_Transmission_of_the_Oral_Law');
		data = await response.json();
	}
</script>

<button on:click={getIndex}>Get the Index</button>

{#await data}
    <p>loading...</p>
{:then data} 
{#if data !== undefined}
	<pre>{JSON.stringify(data, undefined, 2)}</pre>
{:else}
    <p>Nothing here. </p>
{/if}
{/await}
