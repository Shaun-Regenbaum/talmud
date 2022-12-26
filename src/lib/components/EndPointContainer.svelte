<script lang="ts">

export let info: any;
export let fn: Function;
export let purpose: string = "Unspecified Purpose";
export let loading: boolean = false;

</script>

<div class="m-4">
    <button class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" on:click={fn()}>{purpose}</button>
</div>

<div class="overflow-hidden rounded-lg bg-white shadow m-4">
    <div class="m-4 px-4 py-5 sm:p-6">

       
        {#if loading}
        <p>Loading...</p>
        {:else} 
        {#if info !== undefined || info !== null}
            <pre>{JSON.stringify(info, undefined, 2)}</pre>
        {:else}
            <p>Nothing Here Yet... </p>
        {/if}
        {/if}
      
</div>
</div>

<slot/>