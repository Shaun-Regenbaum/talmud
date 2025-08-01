<script>
  import { createEventDispatcher } from 'svelte';
  
  export let size = 'md'; // 'xs', 'sm', 'md', 'lg', 'xl'
  export let variant = 'secondary'; // 'primary', 'secondary', 'danger', 'ghost'
  export let rounded = 'full'; // 'none', 'sm', 'md', 'lg', 'full'
  export let type = 'button';
  export let disabled = false;
  export let href = '';
  
  const dispatch = createEventDispatcher();
  
  const sizeClasses = {
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-2.5 py-1 text-sm',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-3.5 py-2 text-sm',
    xl: 'px-4 py-2.5 text-sm'
  };
  
  const variantClasses = {
    primary: 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
    secondary: 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50',
    danger: 'bg-red-600 text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600',
    ghost: 'text-gray-900 hover:bg-gray-50'
  };
  
  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full'
  };
  
  $: classes = `${sizeClasses[size]} ${variantClasses[variant]} ${roundedClasses[rounded]} font-semibold transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;
  
  function handleClick(event) {
    if (!disabled) {
      dispatch('click', event);
    }
  }
</script>

{#if href && !disabled}
  <a {href} class={classes} on:click={handleClick}>
    <slot />
  </a>
{:else}
  <button
    {type}
    {disabled}
    class={classes}
    on:click={handleClick}
  >
    <slot />
  </button>
{/if}