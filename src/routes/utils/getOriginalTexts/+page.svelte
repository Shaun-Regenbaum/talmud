<script lang="ts">
  import EndPointContainer from "$lib/components/EndPointContainer.svelte";


    let info: any;
    let loading: boolean = false;
	async function getIndex() {
        loading= true;
        let ref = 'Mishneh_Torah,_Transmission_of_the_Oral_Law';
        ref =   ref.replace(' ', '_');
        ref = ref.replace(',', '%2C');
		const response = await fetch('/utils/getOriginalTexts?ref=Mishneh_Torah,_Transmission_of_the_Oral_Law');
		info = await response.json();
        loading = false;
	}
</script>

<h1 class="text-2xl font-bold">Getting Text From Sefaria</h1>
<p class="text-gray-500">Using the sefaria API to get and store the original text in supabase</p>
<EndPointContainer bind:info={info} bind:loading={loading} fn={getIndex} purpose={"Store the Text"}/>
