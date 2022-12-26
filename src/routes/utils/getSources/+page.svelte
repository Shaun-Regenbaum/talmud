<script lang="ts">

    let query:string = "Why does Rashi like Rambam?";
    export let data: any;	
    export let form: any;
</script>

<form method="POST">
    <label >
        Put a question:
        <input name="question" type="text" bind:value={query} placeholder="...">
    </label>
<button type="submit">Search the Index</button>
</form>


{#await data}
    <p>loading...</p>
{:then data} 
{#if data !== undefined}
	<pre>{JSON.stringify(data, undefined, 2)}</pre>
{:else}
    <p>Nothing here. </p>
{/if}
{/await}


{#await form}
    <p>loading...</p>
{:then form} 
{#if form !== null}
	<pre>{JSON.stringify(form, undefined, 2)}</pre>
{:else}
    <p>Nothing here. </p>
{/if}
{/await}

