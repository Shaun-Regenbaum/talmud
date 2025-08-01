<script>
  export let title = 'Transactions';
  export let description = 'A table of placeholder stock market data that does not make any sense.';
  export let showExportButton = true;
  export let data = [
    { id: 'AAPS0L', company: 'Chase & Co.', share: 'CAC', commission: '+$4.37', price: '$3,509.00', quantity: '12.00', netAmount: '$4,397.00' },
    { id: 'O2KMND', company: 'Amazon.com Inc.', share: 'AMZN', commission: '+$5.92', price: '$2,900.00', quantity: '8.80', netAmount: '$3,509.00' },
    { id: '1LP2P4', company: 'Procter & Gamble', share: 'PG', commission: '-$5.65', price: '$7,978.00', quantity: '2.30', netAmount: '$2,652.00' },
    { id: 'PS9FJGL', company: 'Berkshire Hathaway', share: 'BRK', commission: '+$4.37', price: '$3,116.00', quantity: '48.00', netAmount: '$6,055.00' },
    { id: 'QYR135', company: 'Apple Inc.', share: 'AAPL', commission: '+$38.00', price: '$8,508.00', quantity: '36.00', netAmount: '$3,496.00' },
    { id: '99SLSM', company: 'NVIDIA Corporation', share: 'NVDA', commission: '+$1,427.00', price: '$4,425.00', quantity: '18.00', netAmount: '$2,109.00' },
    { id: 'OSDJLS', company: 'Johnson & Johnson', share: 'JNJ', commission: '+$1,937.23', price: '$4,038.00', quantity: '32.00', netAmount: '$7,210.00' },
    { id: '4HJK3N', company: 'JPMorgan', share: 'JPM', commission: '-$3.67', price: '$3,966.00', quantity: '80.00', netAmount: '$6,432.00' },
  ];
  
  export let columns = [
    { key: 'id', label: 'Transaction ID' },
    { key: 'company', label: 'Company' },
    { key: 'share', label: 'Share' },
    { key: 'commission', label: 'Commission' },
    { key: 'price', label: 'Price' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'netAmount', label: 'Net amount' },
  ];
  
  export let onExport = () => {
    console.log('Export clicked');
  };
  
  export let onEdit = (item) => {
    console.log('Edit clicked for', item);
  };
</script>

<div class="px-4 sm:px-6 lg:px-8">
  <div class="sm:flex sm:items-center">
    <div class="sm:flex-auto">
      <h1 class="text-base font-semibold text-gray-900">{title}</h1>
      <p class="mt-2 text-sm text-gray-700">{description}</p>
    </div>
    {#if showExportButton}
      <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
        <button on:click={onExport} type="button" class="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          Export
        </button>
      </div>
    {/if}
  </div>
  <div class="mt-8 flow-root">
    <div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
      <div class="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
        <table class="relative min-w-full divide-y divide-gray-300">
          <thead>
            <tr>
              {#each columns as column, i}
                <th 
                  scope="col" 
                  class="{i === 0 ? 'py-3.5 pr-3 pl-4 sm:pl-0' : i === columns.length - 1 ? 'py-3.5 pr-4 pl-3 sm:pr-0' : 'px-2 py-3.5'} text-left text-sm font-semibold whitespace-nowrap text-gray-900"
                >
                  {column.label}
                </th>
              {/each}
              <th scope="col" class="py-3.5 pr-4 pl-3 whitespace-nowrap sm:pr-0">
                <span class="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white">
            {#each data as item}
              <tr>
                {#each columns as column, i}
                  <td class="{i === 0 ? 'py-2 pr-3 pl-4 sm:pl-0' : i === columns.length - 1 ? 'py-2 pr-4 pl-3 sm:pr-0' : 'px-2 py-2'} text-sm whitespace-nowrap {column.key === 'company' ? 'font-medium text-gray-900' : column.key === 'share' ? 'text-gray-900' : 'text-gray-500'}">
                    {item[column.key]}
                  </td>
                {/each}
                <td class="py-2 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
                  <button on:click={() => onEdit(item)} class="text-indigo-600 hover:text-indigo-900">
                    Edit<span class="sr-only">, {item.id}</span>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>