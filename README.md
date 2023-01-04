# To do:

1. I still don't understand how loading data/ actions are truly meant to work. I suppose I can always use +server.ts, but I feel like I should understand how to actually use the framework.
2. We have a very basic talmudgpt working, what do we want to add before we give it to some people?
   a. Record the questions ppl ask somewhere (redis or supabase?)
   b. Add a component for people to :thumbs-up or :thumbs-down the responses and give comments about what it was good or bad. (Record these in redis or supabase?)
3. Write down a proper analysis of the best way to use embeddings, is it short sentences, converting the search, or what? People will be interested in something like this.
4. Constrain yourself to simply improving the prompt with better example answers and more varied questions.
5. Add validation to the sources and hyperlink them when possible. If the source doesn't exist, right a disclaimer on why it got it wrong (answer could be correct, but using incorrect source, ask the user about the context of the question).

We know what load does:
If you want data available essentially on mount, you can use load to make it available through export let data;
If you want a normal API route, you simply use GET or POST, etc... in +server.ts

What advantages does +page.ts/js give? I know it is done client side, but is that it?

I am still quite confused as to the advantages of forms/actions? Why are they preferred vs using API routes?

What does end-end type safety really imply in sveltekit, how does it work?

TODO:
It seems I have esbuild explicitly set to a dependancy in here and it is causing our annoying issue, if I remove that, can I get it to go away just like it works in personal-site?
