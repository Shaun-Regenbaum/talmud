<script>
  import { createEventDispatcher } from 'svelte';
  
  export let name = '';
  export let checked = false;
  export let disabled = false;
  export let label = 'Use setting';
  export let showIcons = true;
  
  const dispatch = createEventDispatcher();
  
  function handleChange(event) {
    checked = event.target.checked;
    dispatch('change', { checked });
  }
</script>

<label class="inline-flex items-center">
  <div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2 {disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
    <span class="relative size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5">
      {#if showIcons}
        <span
          aria-hidden="true"
          class="absolute inset-0 flex size-full items-center justify-center opacity-100 transition-opacity duration-200 ease-in group-has-checked:opacity-0 group-has-checked:duration-100 group-has-checked:ease-out"
        >
          <svg fill="none" viewBox="0 0 12 12" class="size-3 text-gray-400">
            <path
              d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span
          aria-hidden="true"
          class="absolute inset-0 flex size-full items-center justify-center opacity-0 transition-opacity duration-100 ease-out group-has-checked:opacity-100 group-has-checked:duration-200 group-has-checked:ease-in"
        >
          <svg fill="currentColor" viewBox="0 0 12 12" class="size-3 text-indigo-600">
            <path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z" />
          </svg>
        </span>
      {/if}
    </span>
    <input
      {name}
      type="checkbox"
      bind:checked
      {disabled}
      on:change={handleChange}
      aria-label={label}
      class="absolute inset-0 appearance-none focus:outline-hidden"
    />
  </div>
  {#if $$slots.default}
    <span class="ml-3 text-sm font-medium text-gray-900">
      <slot />
    </span>
  {/if}
</label>