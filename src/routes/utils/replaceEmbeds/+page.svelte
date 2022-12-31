<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";


    let info: any;
	let loading:boolean = false;
	async function replaceEmbed() {
		loading=true;
		const response = await fetch('/utils/replaceEmbeds');
		info = await response.json();
		loading = false;
	}
</script>


<h1 class="text-2xl font-bold">Replace Embeds</h1>
<p class="text-gray-500">Replace embeddings from string to actual arrays</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={replaceEmbed} purpose={"Replace Embeds"}/>
