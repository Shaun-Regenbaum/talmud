<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";


    let info: any;
	let loading:boolean = false;
	async function createHashes() {
		loading=true;
		const response = await fetch('/utils/createHashes');
		info = await response.json();
		loading = false;
	}
</script>


<h1 class="text-2xl font-bold">Creating Hashes</h1>
<p class="text-gray-500">Creating Hashes containing the vectors</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={createHashes} purpose={"Create Hashes"}/>
