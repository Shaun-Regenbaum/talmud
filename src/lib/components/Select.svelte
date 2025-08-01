<script>
  import { onMount, createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let name = '';
  export let value = '';
  export let options = [];
  export let placeholder = 'Select an option';
  
  const dispatch = createEventDispatcher();
  
  let isOpen = false;
  let selectedOption = null;
  let selectButton;
  let optionsContainer;
  
  $: selectedOption = options.find(opt => opt.value === value) || null;
  
  function toggleDropdown() {
    isOpen = !isOpen;
  }
  
  function selectOption(option) {
    value = option.value;
    selectedOption = option;
    isOpen = false;
    dispatch('change', { value: option.value, option });
  }
  
  function handleClickOutside(event) {
    if (selectButton && !selectButton.contains(event.target) && 
        optionsContainer && !optionsContainer.contains(event.target)) {
      isOpen = false;
    }
  }
  
  function handleKeyDown(event) {
    if (!isOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        isOpen = true;
      }
      return;
    }
    
    const currentIndex = options.findIndex(opt => opt.value === value);
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < options.length - 1) {
          selectOption(options[currentIndex + 1]);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          selectOption(options[currentIndex - 1]);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (selectedOption) {
          selectOption(selectedOption);
        }
        break;
      case 'Escape':
        event.preventDefault();
        isOpen = false;
        selectButton.focus();
        break;
    }
  }
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div>
  {#if label}
    <label for={name} class="block text-sm/6 font-medium text-gray-900">{label}</label>
  {/if}
  <div class="relative {label ? 'mt-2' : ''}">
    <button
      bind:this={selectButton}
      type="button"
      on:click={toggleDropdown}
      on:keydown={handleKeyDown}
      class="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:text-sm/6"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-labelledby={label ? name : undefined}
    >
      <span class="col-start-1 row-start-1 flex items-center gap-3 pr-6">
        {#if selectedOption}
          {#if selectedOption.status}
            <span 
              aria-label={selectedOption.status === 'online' ? 'Online' : 'Offline'} 
              class="inline-block size-2 shrink-0 rounded-full border border-transparent {selectedOption.status === 'online' ? 'bg-green-400' : 'bg-gray-200'}"
            ></span>
          {/if}
          <span class="block truncate">{selectedOption.label}</span>
        {:else}
          <span class="block truncate text-gray-500">{placeholder}</span>
        {/if}
      </span>
      <svg viewBox="0 0 16 16" fill="currentColor" data-slot="icon" aria-hidden="true" class="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4">
        <path d="M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06ZM10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
      </svg>
    </button>

    {#if isOpen}
      <div
        bind:this={optionsContainer}
        class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-hidden sm:text-sm"
        role="listbox"
        aria-labelledby={label ? name : undefined}
        tabindex="-1"
      >
        {#each options as option}
          <button
            type="button"
            on:click={() => selectOption(option)}
            class="group relative w-full cursor-default py-2 pr-9 pl-3 text-left text-gray-900 hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white focus:outline-hidden"
            role="option"
            aria-selected={value === option.value}
          >
            <div class="flex items-center">
              {#if option.status}
                <span 
                  aria-hidden="true" 
                  class="inline-block size-2 shrink-0 rounded-full border border-transparent {option.status === 'online' ? 'bg-green-400 group-focus:forced-colors:bg-[Highlight]' : 'bg-gray-200'}"
                ></span>
              {/if}
              <span class="{option.status ? 'ml-3' : ''} block truncate {value === option.value ? 'font-semibold' : 'font-normal'}">
                {option.label}
                {#if option.status}
                  <span class="sr-only"> is {option.status}</span>
                {/if}
              </span>
            </div>
            {#if value === option.value}
              <span class="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-hover:text-white group-focus:text-white">
                <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="size-5">
                  <path d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" fill-rule="evenodd" />
                </svg>
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>