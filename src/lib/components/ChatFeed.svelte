<script lang="ts">
interface ChatMessage {
  id: number;
  message: string;
  sender: string;
  timestamp: string;
}
export let data:ChatMessage[] = [{id: 1, message: "Hello", sender: "User", timestamp: "2021-01-01"}, {id: 2, message: "Hello", sender: "Rambam", timestamp: "2021-01-01"}]

</script>
<ul class="divide-y divide-gray-200">
  {#each data as message}
    <li class="px-4 py-4 sm:px-0">
      <div class="flex pl-12">
        <img class="inline-block h-10 w-10 rounded-full" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="">
        <div class="px-2"></div>
        <p class="self-center">{message.message}</p>
      </div>
      <div class="flex flex-row-reverse"> 
        <div class="pr-12 pt-2"></div>
        <div class="text-sm">Sent: <p class="text-xs">{message.timestamp}</p></div>
      </div>
          
    </li>
    {/each}

    <!-- More items... -->
  </ul>