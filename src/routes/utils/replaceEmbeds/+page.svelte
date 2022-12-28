<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";


    let info: any;
	let loading:boolean = false;
	async function replaceEmbeds() {
		loading=true;
		const response = await fetch('/utils/replaceEmbeds');
		info = await response.json();
		loading = false;
	}
</script>


<h1 class="text-2xl font-bold">Replace Embeddings</h1>
<p class="text-gray-500">Replacing the plain array embeddings with their byte blob versions.</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={replaceEmbeds} purpose={"Replace Embeddings"}/>
