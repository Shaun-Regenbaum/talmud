<script lang="ts">
    import type  {BodyForCompletion, BodyForSearch} from '$lib/types';
    let endpoint = "search";

    const options = [
        { value: "search", label: "Search" },
        { value: "formResponse", label: "FormResponse" },
        { value: "deDuplicate", label: "deDuplicate" },
    ]
    let body: BodyForSearch | BodyForCompletion;
    let text:string = "";

    let info: any = null;
    
    async function callApi(){
        if (endpoint == "search"){
                const result = await fetch('/api/search', {
                method: 'POST',
                body: JSON.stringify({text: text}),     
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            info = await result.json();
            console.log(info);
        }
        else if (endpoint == "formResponse"){
            const result1 = await fetch('/api/search' , {
                method: 'POST',
                body: JSON.stringify({text: text}),     
                headers: {
                    'Content-Type': 'application/json'
                } 
            })
            const result = await result1.json();
            const topText:string = result.topText;
            const secondText:string = result.secondText;
            const sources:string[] = result.sources;

            const result2 = await fetch('/api/formResponse', {
                method: 'POST',
                body: JSON.stringify({question: text, context: topText + secondText, sources: sources }),     
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            info = JSON.stringify(await result2.json());
            info = info + sources
        }
        else if (endpoint == "deDuplicate"){
            const result = await fetch('/api/deDuplicate', {
                method: 'GET',   
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            info = JSON.stringify(await result.json());
            console.log(info);
        }
      
        
    }

</script>

<div>
    <label for="api" class="block text-sm font-medium text-gray-700">Location</label>
    <select id="api" name="location" bind:value={endpoint} class="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm">
        {#each options as option}
            <option value={option.value} selected={option.value == endpoint}>{option.label}</option>
        {/each}
    </select>
  </div>
  <div class="flex mt-2">
    {#if endpoint == "search"}
    <label >
        <p class="hidden">Put a question:</p>
        <input name="question" type="text" bind:value={text} placeholder="..." class="block w-[300px] ml-4 p-2 rounded-md border-gray-300 border-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
    </label>
    {:else if endpoint == "formResponse"}
    <label >
        <p class="hidden">Put a question:</p>
        <input name="question" type="text" bind:value={text} placeholder="..." class="block w-[300px] ml-4 p-2 rounded-md border-gray-300 border-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
    </label>
    {:else if endpoint == "deDuplicate"}
    <p>No Options</p>
    {/if}

    <div class=p-4></div>
    <button on:click={callApi} class="items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" type="submit">Submit</button>
</div>

<div class="overflow-x-scroll rounded-lg bg-white shadow m-4">
    <div class="m-4 px-4 py-5 sm:p-6">
        {#if info !== undefined || info !== null}
            <pre>{JSON.stringify(JSON.parse(info), null, 2)};</pre>
        {:else if info ===  null}
            <p> This is null</p>
        {:else}
            <p>Nothing Here Yet... </p>
        {/if}
    </div>
    </div>

