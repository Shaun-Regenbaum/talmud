<script lang="ts">
  import { onMount } from "svelte";


    export let form: any;
	let statement: string = "";
	let loading = false;
	onMount(async () => {
		loading = true;
	});
</script>

<form method="POST">
    <div class="flex mt-2">
        <label >
            <p class="hidden">Put a statement to complete:</p>
            <input name="statement" type="text" bind:value={statement} placeholder="..." class="block w-[300px] ml-4 p-2 rounded-md border-gray-300 border-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
        </label>
        <div class=p-4></div>
        <button class=" items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" type="submit">Search</button>
    
    </div>
  </form>


<div class="overflow-hidden rounded-lg bg-white shadow m-4">
    <div class="m-4 px-4 py-5 sm:p-6">
{#await form}
<p>Loading...</p>
{:then form} 
{#if form !== null || form !== undefined}
	<pre>{JSON.stringify(form, undefined, 2)}</pre>
{:else}
    <p>Nothing here. </p>
{/if}
{/await}
</div>
</div>
