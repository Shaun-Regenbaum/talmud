<script>
  import { Navigation, Table, Select, Dialog, Checkbox, Button, Toggle } from '$lib/components';
  
  let selectedUser = '4';
  let showDialog = false;
  let checkboxes = {
    comments: true,
    candidates: false,
    offers: false
  };
  let toggleState = false;
  
  const userOptions = [
    { value: '1', label: 'Wade Cooper', status: 'online' },
    { value: '2', label: 'Arlene Mccoy', status: 'offline' },
    { value: '3', label: 'Devon Webb', status: 'offline' },
    { value: '4', label: 'Tom Cook', status: 'online' },
    { value: '5', label: 'Tanya Fox', status: 'offline' },
    { value: '6', label: 'Hellen Schmidt', status: 'online' },
    { value: '7', label: 'Caroline Schultz', status: 'online' },
    { value: '8', label: 'Mason Heaney', status: 'offline' },
    { value: '9', label: 'Claudie Smitham', status: 'online' },
    { value: '10', label: 'Emil Schaefer', status: 'offline' },
  ];
  
  function handleSelectChange(event) {
    console.log('Selected:', event.detail);
  }
  
  function handleDialogPrimary() {
    console.log('Primary action clicked');
  }
  
  function handleDialogSecondary() {
    console.log('Secondary action clicked');
  }
</script>

<div class="min-h-full">
  <Navigation />
  
  <div class="py-10">
    <header>
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 class="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
      </div>
    </header>
    <main>
      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <!-- Select Component Demo -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Select Component</h2>
          <div class="max-w-xs">
            <Select
              label="Assigned to"
              name="assigned"
              bind:value={selectedUser}
              options={userOptions}
              on:change={handleSelectChange}
            />
          </div>
          <p class="mt-2 text-sm text-gray-600">Selected value: {selectedUser}</p>
        </div>
        
        <!-- Button Component Demo -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Button Component</h2>
          <div class="flex flex-wrap gap-3">
            <Button size="xs">Button text</Button>
            <Button size="sm">Button text</Button>
            <Button size="md">Button text</Button>
            <Button size="lg">Button text</Button>
            <Button size="xl">Button text</Button>
          </div>
          <div class="mt-4 flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </div>
        
        <!-- Checkbox Component Demo -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Checkbox Component</h2>
          <fieldset>
            <legend class="sr-only">Notifications</legend>
            <div class="space-y-5">
              <Checkbox
                id="comments"
                name="comments"
                label="Comments"
                description="Get notified when someones posts a comment on a posting."
                bind:checked={checkboxes.comments}
              />
              <Checkbox
                id="candidates"
                name="candidates"
                label="Candidates"
                description="Get notified when a candidate applies for a job."
                bind:checked={checkboxes.candidates}
              />
              <Checkbox
                id="offers"
                name="offers"
                label="Offers"
                description="Get notified when a candidate accepts or rejects an offer."
                bind:checked={checkboxes.offers}
              />
            </div>
          </fieldset>
        </div>
        
        <!-- Toggle Component Demo -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Toggle Component</h2>
          <Toggle bind:checked={toggleState}>
            Enable notifications
          </Toggle>
          <p class="mt-2 text-sm text-gray-600">Toggle is: {toggleState ? 'On' : 'Off'}</p>
        </div>
        
        <!-- Dialog Component Demo -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Dialog Component</h2>
          <button
            on:click={() => showDialog = true}
            class="rounded-md bg-gray-950/5 px-2.5 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-950/10"
          >
            Open dialog
          </button>
        </div>
        
        <!-- Table Component Demo -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Table Component</h2>
          <Table />
        </div>
      </div>
    </main>
  </div>
</div>

<Dialog
  bind:open={showDialog}
  title="Payment successful"
  description="Lorem ipsum, dolor sit amet consectetur adipisicing elit. Eius aliquam laudantium explicabo pariatur iste dolorem animi vitae error totam. At sapiente aliquam accusamus facere veritatis."
  icon="success"
  primaryButtonText="Deactivate"
  secondaryButtonText="Cancel"
  on:primary={handleDialogPrimary}
  on:secondary={handleDialogSecondary}
  on:close={() => console.log('Dialog closed')}
/>