<script lang="ts">
	import Abbr from '$lib/components/Abbr.svelte';
	import Correction from '$lib/components/Correction.svelte';
	import Note from '$lib/components/Note.svelte';
</script>

<div class="font-light overflow-hidden bg-white divide-y divide-gray-300 ">
	<div class="p-4 sm:px-6">
		<h1 class="text-lg underline underline-offset-2">What is this?</h1>
		<p>
			TorahGPT is a fine-tuned version of GPT-3, a <Abbr
				abbr={'LLM'}
				expanded={'Large Language Model'}
			/> developed by OpenAI. TorahGPT chains this <Abbr
				abbr={'LLM'}
				expanded={'Large Language Model'}
			/> to a <Abbr
				abbr={'HNSW'}
				expanded={'Hierchal Navigable Small World Vector'}
			/> look-up indexed on sentence embeddings to provide initial context and sources
			to any query.
		</p>
		<Correction
			message={'For the time being, this is vanilla GPT3.5 using context provided by a HNSW Search Index'}
		/>
		<br />
		<h1 class="text-lg underline underline-offset-2">What does that mean?</h1>

		<p>
			In the past two years, there has been a revolution in the ability of
			computers to write and read text. They can write college-level essays,
			fool humans into thinking they are human, and even write code. Over the
			next decade, <Abbr
				abbr={'NLP'}
				expanded={'Natural Language Processing'}
			/> will change the way we interact with and think about computers.
		</p>
		<br />
		<p>
			TorahGPT is, to my knowledge, the first attempt at bringing these
			cutting-edge methods to the Jewish World. It allows you to talk with a
			computer that knows every text available on Sefaria about whatever you
			want. In its current form, TorahGPT is constrained to a Q&A format, but
			will be expanded into a chatbot later on.
		</p>
		<br />
		<h1 class="text-lg underline underline-offset-2">
			Why does the Jewish World need this?
		</h1>
		<p>
			I want the Jewish World to be able to experience the cutting-edge as it
			happens rather than decades later. We have millions of Jewish books that
			sit largely unused because of their unapproachable forms. This can be
			because they are written in different languages, or because of their
			complicated nature. Most Jews don't know how to learn Talmud, or navigate
			halachic sources. I want to give everyone the ability to learn and explore
			in a way they've never been able to before.
		</p>
		<br />
		<h1 class="text-lg underline underline-offset-2">
			What else are you working on?
		</h1>
		<p>I am working on the following three projects in my free time.</p>
		<ul class="spacing-y-2">
			<li>
				- <Abbr
					abbr={'TorahGPT'}
					expanded={'My main focus'}
				/> allows you to explore everything on Sefaria in a more natural way.
			</li>
			<li>
				- <Abbr
					abbr={'TranslatorTSFMR'}
					expanded={'Still a WIP'}
				/> which will enable single word translation of every word in the Talmud,
				including Rashi and Tosafot.
			</li>
			<li>
				- <Abbr
					abbr={'TranslatorPLEX'}
					expanded={'Just Started'}
				/> which will enable robust translation for hebrew books that have never
				been translated into English. This may be expanded to Yiddish.
			</li>
		</ul>
		<br />
		<h1 class="text-lg underline underline-offset-2">Do you want to help?</h1>
		<p>You can contribute in a number of ways:</p>
		<ul class="spacing-y-2 ml-3">
			<br />
			<li>
				1. We need <span class="italic">lots</span> of data about what questions
				people ask.
				<p>
					By simply asking question to TorahGPT you are helping it get better!
				</p>
			</li>
			<br />
			<li>
				2. We need <span class="italic">lots</span> of short Q&A pairs.
				<p>
					TorahGPT needs lots of examples to learn how it should behave. The
					more correct question answer pairs we have, the better it performs. So
					if you want to help, all you have to do is send me pairs of halachic
					questions with answers and their corresponding texts. The best format
					is:
				</p>
				<div class="px-4 py-5 sm:p-6 space-y-3">
					<p>
						<span class="bg-slate-200 p-1 shadow rounded-lg">Q:</span>
						What is the meaning of life?
					</p>

					<p>
						<span class="bg-slate-200 p-1 shadow rounded-lg">A:</span>
						42 (Brachot 42a, Yevamot 42b)
					</p>
				</div>
			</li>
			<li>
				3. We need <span class="italic">a lot more</span> long-form shutim.
				<p>
					In order to be able to answer more complicated questions, TorahGPT
					needs lots of examples to learn how it should behave. Currentely
					TorahGPT is largely constrained to simpler questions with short
					answers, but I would love for it to able to potentially write entire
					Shutim. The format is less important for these examples.
				</p>
			</li>
			<br />
			<li>
				4. If you are an experienced web developer: you can help make the next
				generation of learning experiences. A couple years ago I started working
				on a <a
					class="text-blue-500 underline"
					href="https://demo.talmud.app">Talmud Learning App</a
				>, but there is a lot more to be done.
				<Note
					abbr="Learn more..."
					expanded="I don't have time to finish it, but I would love for others to help
						make better experiences for learning. I have a bunch of ideas, so reach
						out and we can talk."
				/>
			</li>
			<br />
			<li>
				5. If you are an engineer:

				<p class="ml-4">
					- You can help with statistical work.
					<Note
						abbr="Learn more..."
						expanded="It is a hard problem to find the correct sources based on the context given. It is partly a statistical problem. You would need to understand the principles of mapping text to high
					dimensional vector spaces, and the using those embeddings to match a
					correct group of sources to a given input. It is a very hard problem to
					solve, but if you are an expert I would be happy for your help."
					/>
				</p>
				<p class="ml-4">
					- You can help with prompt engineering.
					<Note
						abbr={'Learn more...'}
						expanded={"Models like GPT-3 are extremely sensitive to the instructions/prompts you provide. There are a lot of ways to improve performance simply by providing better examples and instructions. Finding better prompts involves a lot of experimentation. You don't need to be an expert or anything, you simply need to be methodical."}
					/>
				</p>
				<p class="ml-4">
					- You can help with data clean-up
					<Note
						abbr={'Learn more...'}
						expanded={'Involves a lot of scraping and html parsing, perhaps even a little bit of OCR.'}
					/>
				</p>
				<p class="ml-4">
					- You can help with sourcing
					<Note
						abbr={'Learn more...'}
						expanded={'Involves a lot of scraping and html parsing, perhaps even a little bit of OCR.'}
					/>
				</p>
			</li>
			<br />
			<li>
				6. There is always more, just reach out and well find something for you!
			</li>
		</ul>
	</div>
</div>
