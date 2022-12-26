<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";


    let info: any;
    let loading:boolean = false;
	async function createIndex() {
        loading=true;
		const response = await fetch('/utils/createIndex')
        info = await response.json();
        loading = false;
	}
</script>


<h1 class="text-2xl font-bold">Create An Index</h1>
<p class="text-gray-500">Create an index in Redis DB based on the embeddings.</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={createIndex} purpose={"Create an Index"}/>

