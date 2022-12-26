<script lang="ts">
    import EndPointContainer from "$lib/components/EndPointContainer.svelte";
    let data: any = null;
	async function getIndex() {
		fetch('/utils/storeText').then(
            (response) => {
                console.log(response);
                data = response.json();
            }
        )

	}
    
</script>


<h1 class="text-2xl font-bold">Store Texts from Sefaria</h1>
<p class="text-gray-500">Store texts from Sefaria in a redis db after formatting and cleaning them up.</p>
<EndPointContainer info={data} fn={getIndex} purpose={"Store the Text"}/>
