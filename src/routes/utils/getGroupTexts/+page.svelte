<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";

    let info: any;
    let loading: boolean = false;
	async function storeTexts() {
    loading=true
    try{
        const response = await fetch(`/utils/getGroupTexts`);
        info = await response.json();
      } catch{
        console.log('error')
      }

        loading = false;
	}
</script>

<h1 class="text-2xl font-bold">Getting Text From Sefaria</h1>
<p class="text-gray-500">Using the sefaria API to get and store both the Single and Group Texts in supabase</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={storeTexts} purpose={"Store the Text"}>
  </EndPointContainer>
