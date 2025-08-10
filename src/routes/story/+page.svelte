<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	// Note: Story generation handled via API endpoints
	import Stories from '$lib/components/Stories.svelte';

	// Get data from load function
	let { data } = $props();

	// Form state - initialized from URL
	let selectedTractate = $state(data.tractate);
	let selectedPage = $state(data.page);
	let selectedAmud = $state(data.amud);

	// Story state
	let isLoading = $state(false);
	let stories = $state<any>(null);
	let error = $state<string | null>(null);

	// Tractate options for the dropdown
	const tractateOptions = [
		{ value: 'Berakhot', label: 'ברכות', id: 1 },
		{ value: 'Shabbat', label: 'שבת', id: 2 },
		{ value: 'Eruvin', label: 'עירובין', id: 3 },
		{ value: 'Pesachim', label: 'פסחים', id: 4 },
		{ value: 'Shekalim', label: 'שקלים', id: 5 },
		{ value: 'Yoma', label: 'יומא', id: 6 },
		{ value: 'Sukkah', label: 'סוכה', id: 7 },
		{ value: 'Beitzah', label: 'ביצה', id: 8 },
		{ value: 'Rosh Hashanah', label: 'ראש השנה', id: 9 },
		{ value: 'Taanit', label: 'תענית', id: 10 },
		{ value: 'Megillah', label: 'מגילה', id: 11 },
		{ value: 'Moed Katan', label: 'מועד קטן', id: 12 },
		{ value: 'Chagigah', label: 'חגיגה', id: 13 },
		{ value: 'Yevamot', label: 'יבמות', id: 14 },
		{ value: 'Ketubot', label: 'כתובות', id: 15 },
		{ value: 'Nedarim', label: 'נדרים', id: 16 },
		{ value: 'Nazir', label: 'נזיר', id: 17 },
		{ value: 'Sotah', label: 'סוטה', id: 18 },
		{ value: 'Gittin', label: 'גיטין', id: 19 },
		{ value: 'Kiddushin', label: 'קידושין', id: 20 },
		{ value: 'Bava Kamma', label: 'בבא קמא', id: 21 },
		{ value: 'Bava Metzia', label: 'בבא מציעא', id: 22 },
		{ value: 'Bava Batra', label: 'בבא בתרא', id: 23 },
		{ value: 'Sanhedrin', label: 'סנהדרין', id: 24 },
		{ value: 'Makkot', label: 'מכות', id: 25 },
		{ value: 'Shevuot', label: 'שבועות', id: 26 },
		{ value: 'Avodah Zarah', label: 'עבודה זרה', id: 27 },
		{ value: 'Horayot', label: 'הוריות', id: 28 },
		{ value: 'Zevachim', label: 'זבחים', id: 29 },
		{ value: 'Menachot', label: 'מנחות', id: 30 },
		{ value: 'Chullin', label: 'חולין', id: 31 },
		{ value: 'Bekhorot', label: 'בכורות', id: 32 },
		{ value: 'Arakhin', label: 'ערכין', id: 33 },
		{ value: 'Temurah', label: 'תמורה', id: 34 },
		{ value: 'Keritot', label: 'כריתות', id: 35 },
		{ value: 'Meilah', label: 'מעילה', id: 36 },
		{ value: 'Niddah', label: 'נידה', id: 37 }
	];

	// Generate Hebrew page numbers
	function getHebrewPageNumber(num: number): string {
		const hebrewNumbers: Record<number, string> = {
			1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י',
			11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו', 16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ',
			21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה', 26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל',
			31: 'לא', 32: 'לב', 33: 'לג', 34: 'לד', 35: 'לה', 36: 'לו', 37: 'לז', 38: 'לח', 39: 'לט', 40: 'מ',
			41: 'מא', 42: 'מב', 43: 'מג', 44: 'מד', 45: 'מה', 46: 'מו', 47: 'מז', 48: 'מח', 49: 'מט', 50: 'נ',
			51: 'נא', 52: 'נב', 53: 'נג', 54: 'נד', 55: 'נה', 56: 'נו', 57: 'נז', 58: 'נח', 59: 'נט', 60: 'ס',
			61: 'סא', 62: 'סב', 63: 'סג', 64: 'סד', 65: 'סה', 66: 'סו', 67: 'סז', 68: 'סח', 69: 'סט', 70: 'ע',
			71: 'עא', 72: 'עב', 73: 'עג', 74: 'עד', 75: 'עה', 76: 'עו'
		};
		return hebrewNumbers[num] || num.toString();
	}

	// Function to handle form submission
	async function handlePageChange() {
		const params = new URLSearchParams({
			tractate: selectedTractate,
			page: selectedPage,
			amud: selectedAmud
		});
		
		window.location.href = `/story?${params.toString()}`;
	}

	// Load educational stories
	async function loadStories(forceRefresh: boolean = false) {
		// API endpoint will handle key configuration internally

		isLoading = true;
		error = null;
		if (forceRefresh) {
			stories = null; // Clear existing stories when refreshing
		}

		try {
			const refreshParam = forceRefresh ? '&refresh=true' : '';
			const response = await fetch(`/api/stories?tractate=${selectedTractate}&page=${selectedPage}&amud=${selectedAmud}${refreshParam}`);
			if (!response.ok) {
				throw new Error(`Failed to fetch stories: ${response.status}`);
			}

			const storiesData = await response.json();
			
			// Check if we need to fetch from daf-supplier first
			if (storiesData.requiresClientFetch) {
				// Fetch from daf-supplier directly
				const dafResponse = await fetch(storiesData.dafSupplierUrl);
				if (!dafResponse.ok) {
					throw new Error(`Failed to fetch Talmud data: ${dafResponse.status}`);
				}
				
				const dafData = await dafResponse.json();
				
				// Now POST the data back to generate stories
				const storiesResponse = await fetch('/api/stories', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						tractate: storiesData.tractate,
						page: storiesData.page,
						amud: storiesData.amud,
						mainText: dafData.mainText,
						rashi: dafData.rashi,
						tosafot: dafData.tosafot
					})
				});
				
				if (!storiesResponse.ok) {
					throw new Error(`Failed to generate stories: ${storiesResponse.status}`);
				}
				
				stories = await storiesResponse.json();
			} else {
				stories = storiesData;
			}

		} catch (err) {
			console.error('Failed to load stories:', err);
			error = err instanceof Error ? err.message : 'Unknown error occurred';
		} finally {
			isLoading = false;
		}
	}

	// Load stories when component mounts or data changes
	$effect(() => {
		const { tractate, page, amud } = data;
		selectedTractate = tractate;
		selectedPage = page;
		selectedAmud = amud;
		loadStories();
	});
</script>

<main class="min-h-screen bg-gray-100 p-8">
	<div class="max-w-5xl mx-auto space-y-8">
		<!-- Header -->
		<div class="bg-white rounded-lg shadow-md p-8">
			<h1 class="text-4xl font-bold text-gray-800 mb-4">Talmud Stories</h1>
			<p class="text-gray-600 mb-6">
				Compelling narratives to help you remember and understand the Gemara
			</p>
		</div>

		<!-- Navigation -->
		<div class="bg-white rounded-lg shadow-md p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-2xl font-bold text-gray-800">
					{selectedTractate} {selectedPage}{selectedAmud}
				</h2>
				
				<!-- Page Navigation Form -->
				<div class="flex items-center gap-4 flex-wrap">
					<!-- Tractate Selector -->
					<div class="flex items-center gap-2">
						<label for="tractate-select" class="text-sm font-medium text-gray-700">מסכת:</label>
						<select 
							id="tractate-select"
							bind:value={selectedTractate}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
							disabled={isLoading}
						>
							{#each tractateOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
					
					<!-- Page Number Input -->
					<div class="flex items-center gap-2">
						<label for="page-select" class="text-sm font-medium text-gray-700">דף:</label>
						<select 
							id="page-select"
							bind:value={selectedPage}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white w-20"
							disabled={isLoading}
						>
							{#each Array.from({length: 76}, (_, i) => i + 2) as pageNum}
								<option value={pageNum.toString()}>{getHebrewPageNumber(pageNum)}</option>
							{/each}
						</select>
					</div>
					
					<!-- Amud Selector -->
					<div class="flex items-center gap-2">
						<label for="amud-select" class="text-sm font-medium text-gray-700">עמוד:</label>
						<select 
							id="amud-select"
							bind:value={selectedAmud}
							class="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
							disabled={isLoading}
						>
							<option value="a">א</option>
							<option value="b">ב</option>
						</select>
					</div>
					
					<!-- Go Button -->
					<button 
						onclick={handlePageChange}
						class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition text-sm font-medium"
						disabled={isLoading}
					>
						{isLoading ? 'טוען...' : 'עבור'}
					</button>
					
					<!-- View Daf Link -->
					<a 
						href="/?tractate={selectedTractate}&page={selectedPage}&amud={selectedAmud}"
						class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm font-medium"
					>
						Return to Daf
					</a>
				</div>
			</div>
		</div>

		<!-- Stories Component -->
		<Stories 
			{stories}
			loading={isLoading}
			{error}
			on:refresh={() => loadStories(true)}
			on:retry={() => loadStories()}
		/>

	</div>
</main>