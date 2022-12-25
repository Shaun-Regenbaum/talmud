<script lang="ts">
  import type { PageData } from "./$types";

  
    let inputText:string;
    let responseHistory:string[]
    $: responseText = responseHistory;

    async function getSources(question:string) {
        const response = await fetch('/utils/getSources', {
            method: 'POST',
      body: JSON.stringify({ question}),
      headers: {
        'content-type': 'application/json'
      }
        });
        const data = await response.json();
        responseHistory = data;
    }
    //On enter we send the input text to search on redis and then take X text and input it before hand to completion.
    </script>



<h1> This the WIP Torah Chat:</h1>

<h3>Response:</h3>
{#each responseText as text}
    <p>{text}</p>
{/each}

<h3>Prompt:</h3>
<input bind:value={inputText} type='text'>