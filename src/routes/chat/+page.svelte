<script lang="ts">

  import ChatFeed from "$lib/components/ChatFeed.svelte";
    import ChatInput from "$lib/components/ChatInput.svelte";
  </script>
  
  <div class="h-screen">
    <main>
      <ChatFeed></ChatFeed>
  
    </main>
    <div class="absolute bottom-0 left-0 w-full p-4">
      <ChatInput></ChatInput>
    </div>
  </div>

