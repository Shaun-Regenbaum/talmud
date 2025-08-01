<script>
  import { createEventDispatcher } from 'svelte';
  
  export let id = '';
  export let name = '';
  export let label = '';
  export let description = '';
  export let checked = false;
  export let indeterminate = false;
  export let disabled = false;
  
  const dispatch = createEventDispatcher();
  
  function handleChange(event) {
    checked = event.target.checked;
    dispatch('change', { checked, indeterminate: false });
  }
  
  $: if (indeterminate && checked) {
    indeterminate = false;
  }
</script>

<div class="flex gap-3">
  <div class="flex h-6 shrink-0 items-center">
    <div class="group grid size-4 grid-cols-1">
      <input
        {id}
        {name}
        type="checkbox"
        bind:checked
        bind:indeterminate
        {disabled}
        on:change={handleChange}
        aria-describedby={description ? `${id}-description` : undefined}
        class="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
      />
      <svg
        fill="none"
        viewBox="0 0 14 14"
        class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25"
      >
        <path
          d="M3 8L6 11L11 3.5"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-0 group-has-checked:opacity-100"
        />
        <path
          d="M3 7H11"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-0 group-has-indeterminate:opacity-100"
        />
      </svg>
    </div>
  </div>
  <div class="text-sm/6">
    <label for={id} class="font-medium text-gray-900">
      {label}
    </label>
    {#if description}
      <p id="{id}-description" class="text-gray-500">
        {description}
      </p>
    {/if}
  </div>
</div>