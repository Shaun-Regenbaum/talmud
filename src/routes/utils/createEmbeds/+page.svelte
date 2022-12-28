<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";


    let info: any;
	let loading:boolean = false;
	async function createEmbeds() {
		loading=true;
		const response = await fetch('/utils/createEmbeds');
		info = await response.json();
		loading = false;
	}
</script>


<h1 class="text-2xl font-bold">Creating Embeddings</h1>
<p class="text-gray-500">Creating Textual Embeddings for GroupedTexts</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={createEmbeds} purpose={"Create Embeddings"}/>
