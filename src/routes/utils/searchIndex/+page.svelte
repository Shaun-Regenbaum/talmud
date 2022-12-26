<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";

    export let info: any;
    let loading:boolean = false;
	async function searchIndex() {
        loading = true;
		const data = await fetch('/utils/searchIndex')
        info = await data.json();
        console.log(info);
        loading = false;
    }
</script>

<h1 class="text-2xl font-bold">Search an Index from Redis</h1>
<p class="text-gray-500">Searching an Index from Redis with some default embedding to test that HNSW search is working correctly.</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={searchIndex} purpose={"Search an Index"}/>
