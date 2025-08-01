<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  
  export let open = false;
  export let title = '';
  export let description = '';
  export let icon = 'success'; // 'success', 'error', 'warning', 'info'
  export let primaryButtonText = 'Confirm';
  export let secondaryButtonText = 'Cancel';
  export let primaryButtonClass = 'bg-indigo-600 hover:bg-indigo-500 focus-visible:outline-indigo-600';
  export let showSecondaryButton = true;
  
  const dispatch = createEventDispatcher();
  
  let dialog;
  
  function handlePrimaryClick() {
    dispatch('primary');
    open = false;
  }
  
  function handleSecondaryClick() {
    dispatch('secondary');
    open = false;
  }
  
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      dispatch('close');
      open = false;
    }
  }
  
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      dispatch('close');
      open = false;
    }
  }
  
  onMount(() => {
    const handleGlobalKeyDown = (event) => {
      if (open && event.key === 'Escape') {
        handleKeyDown(event);
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  });
  
  $: if (dialog && open) {
    dialog.focus();
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 overflow-y-auto"
    aria-labelledby="dialog-title"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="fixed inset-0 bg-gray-500/75 transition-opacity"
      transition:fade={{ duration: 200 }}
      on:click={handleBackdropClick}
      aria-hidden="true"
    ></div>

    <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
      <div
        bind:this={dialog}
        class="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6"
        transition:scale={{ duration: 200, start: 0.95 }}
        tabindex="-1"
      >
        <div>
          {#if icon}
            <div class="mx-auto flex size-12 items-center justify-center rounded-full {icon === 'success' ? 'bg-green-100' : icon === 'error' ? 'bg-red-100' : icon === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'}">
              {#if icon === 'success'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-green-600">
                  <path d="m4.5 12.75 6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              {:else if icon === 'error'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-red-600">
                  <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              {:else if icon === 'warning'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-yellow-600">
                  <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-blue-600">
                  <path d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              {/if}
            </div>
          {/if}
          <div class="{icon ? 'mt-3' : ''} text-center sm:mt-5">
            {#if title}
              <h3 id="dialog-title" class="text-base font-semibold text-gray-900">{title}</h3>
            {/if}
            {#if description}
              <div class="mt-2">
                <p class="text-sm text-gray-500">{description}</p>
              </div>
            {/if}
            {#if $$slots.default}
              <div class="mt-2">
                <slot />
              </div>
            {/if}
          </div>
        </div>
        <div class="mt-5 sm:mt-6 {showSecondaryButton ? 'sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3' : ''}">
          <button
            type="button"
            on:click={handlePrimaryClick}
            class="inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 {primaryButtonClass} {showSecondaryButton ? 'sm:col-start-2' : ''}"
          >
            {primaryButtonText}
          </button>
          {#if showSecondaryButton}
            <button
              type="button"
              on:click={handleSecondaryClick}
              class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:col-start-1 sm:mt-0"
            >
              {secondaryButtonText}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}