<script lang="ts">
	import { onMount } from 'svelte';
	
	let loading = false;
	let error = '';
	let response: any = null;
	let responseTime = 0;
	
	// API endpoint selection
	let selectedEndpoint = 'texts';
	let textRef = 'Berakhot.2a';
	let searchQuery = 'משנה';
	let indexTitle = 'Berakhot';
	let topicSlug = 'torah';
	let linkRef = 'Berakhot.2a';
	let linkType = '';
	let linkDirection = '';
	let calendars = '2024-01-01';
	let nameQuery = 'רש"י';
	let personKey = 'Rashi';
	let collectionSlug = 'tanakh';
	let groupName = 'Talmud';
	let termName = 'Talmud';
	
	// Response formatting
	let prettyPrint = true;
	let showRawResponse = false;
	
	// Text selection
	let selectedTextRef = '';
	let showTextSelection = false;
	
	const endpoints = {
		texts: {
			name: 'Texts API',
			description: 'Get text content and metadata',
			url: (params: any) => `https://www.sefaria.org/api/texts/${params.ref}`,
			params: ['ref']
		},
		search: {
			name: 'Search API',
			description: 'Search across all texts',
			url: (params: any) => `https://www.sefaria.org/api/search-wrapper/_search?q=${encodeURIComponent(params.query)}`,
			params: ['query']
		},
		index: {
			name: 'Index API',
			description: 'Get index/table of contents for a text',
			url: (params: any) => `https://www.sefaria.org/api/index/${params.title}`,
			params: ['title']
		},
		topics: {
			name: 'Topics API',
			description: 'Get topic information',
			url: (params: any) => `https://www.sefaria.org/api/topics/${params.slug}`,
			params: ['slug']
		},
		links: {
			name: 'Links API',
			description: 'Get links/connections between texts',
			url: (params: any) => {
				let url = `https://www.sefaria.org/api/links/${params.ref}`;
				const queryParams = [];
				if (params.type) queryParams.push(`type=${params.type}`);
				if (params.direction) queryParams.push(`direction=${params.direction}`);
				if (queryParams.length) url += '?' + queryParams.join('&');
				return url;
			},
			params: ['ref', 'type', 'direction']
		},
		calendars: {
			name: 'Calendars API',
			description: 'Get calendar/parasha information',
			url: (params: any) => `https://www.sefaria.org/api/calendars/${params.date}`,
			params: ['date']
		},
		name: {
			name: 'Name API',
			description: 'Get information about a person/author',
			url: (params: any) => `https://www.sefaria.org/api/name/${encodeURIComponent(params.query)}`,
			params: ['query']
		},
		person: {
			name: 'Person API',
			description: 'Get detailed person information',
			url: (params: any) => `https://www.sefaria.org/api/person/${params.key}`,
			params: ['key']
		},
		collections: {
			name: 'Collections API',
			description: 'Get collection information',
			url: (params: any) => `https://www.sefaria.org/api/collections/${params.slug}`,
			params: ['slug']
		},
		groups: {
			name: 'Groups API',
			description: 'Get text group information',
			url: (params: any) => `https://www.sefaria.org/api/groups/${params.name}`,
			params: ['name']
		},
		terms: {
			name: 'Terms API',
			description: 'Get term/concept information',
			url: (params: any) => `https://www.sefaria.org/api/terms/${params.name}`,
			params: ['name']
		}
	};
	
	function getParams() {
		switch (selectedEndpoint) {
			case 'texts': return { ref: textRef };
			case 'search': return { query: searchQuery };
			case 'index': return { title: indexTitle };
			case 'topics': return { slug: topicSlug };
			case 'links': return { ref: linkRef, type: linkType, direction: linkDirection };
			case 'calendars': return { date: calendars };
			case 'name': return { query: nameQuery };
			case 'person': return { key: personKey };
			case 'collections': return { slug: collectionSlug };
			case 'groups': return { name: groupName };
			case 'terms': return { name: termName };
			default: return {};
		}
	}
	
	async function testEndpoint() {
		loading = true;
		error = '';
		response = null;
		
		const startTime = performance.now();
		
		try {
			const endpoint = endpoints[selectedEndpoint];
			const params = getParams();
			const url = endpoint.url(params);
			
			console.log('Testing endpoint:', url);
			
			const res = await fetch(url);
			responseTime = performance.now() - startTime;
			
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}
			
			response = await res.json();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}
	
	function formatJSON(obj: any, indent = 2) {
		if (!prettyPrint) return JSON.stringify(obj);
		return JSON.stringify(obj, null, indent);
	}
	
	function handleTextSelection(ref: string) {
		selectedTextRef = ref;
		showTextSelection = true;
		// Switch to links endpoint and set the reference
		selectedEndpoint = 'links';
		linkRef = ref;
		// Test the endpoint
		testEndpoint();
	}
	
	function getTextSegments() {
		if (!response || !response.text) return [];
		return response.text.map((text: string, i: number) => ({
			text,
			hebrew: response.he?.[i] || '',
			ref: response.ref ? `${response.ref}:${i + 1}` : `Segment ${i + 1}`
		}));
	}
	
	function getResponseSummary() {
		if (!response) return '';
		
		const summary: string[] = [];
		
		// Text-specific summary
		if (selectedEndpoint === 'texts' && response.text) {
			summary.push(`Text: ${response.ref || 'Unknown'}`);
			summary.push(`Hebrew segments: ${response.he?.length || 0}`);
			summary.push(`English segments: ${response.text?.length || 0}`);
			if (response.commentary) {
				summary.push(`Commentaries: ${response.commentary.length}`);
			}
		}
		
		// Search-specific summary
		if (selectedEndpoint === 'search' && response.hits) {
			summary.push(`Total results: ${response.hits.total?.value || 0}`);
			summary.push(`Results returned: ${response.hits.hits?.length || 0}`);
		}
		
		// Index-specific summary
		if (selectedEndpoint === 'index') {
			summary.push(`Title: ${response.title || 'Unknown'}`);
			summary.push(`Categories: ${response.categories?.join(' > ') || 'None'}`);
			if (response.schema?.nodes) {
				summary.push(`Sections: ${response.schema.nodes.length}`);
			}
		}
		
		return summary.join('\n');
	}
	
	// Load initial data on mount
	onMount(() => {
		testEndpoint();
	});
</script>

<div class="container">
	<h1>Sefaria API Explorer</h1>
	
	<div class="controls">
		<div class="endpoint-selector">
			<label>
				Select API Endpoint:
				<select bind:value={selectedEndpoint} on:change={() => testEndpoint()}>
					{#each Object.entries(endpoints) as [key, endpoint]}
						<option value={key}>{endpoint.name}</option>
					{/each}
				</select>
			</label>
			<p class="description">{endpoints[selectedEndpoint].description}</p>
		</div>
		
		<div class="params">
			{#if selectedEndpoint === 'texts'}
				<label>
					Text Reference:
					<input type="text" bind:value={textRef} placeholder="e.g., Berakhot.2a" />
				</label>
			{:else if selectedEndpoint === 'search'}
				<label>
					Search Query:
					<input type="text" bind:value={searchQuery} placeholder="e.g., משנה" />
				</label>
			{:else if selectedEndpoint === 'index'}
				<label>
					Index Title:
					<input type="text" bind:value={indexTitle} placeholder="e.g., Berakhot" />
				</label>
			{:else if selectedEndpoint === 'topics'}
				<label>
					Topic Slug:
					<input type="text" bind:value={topicSlug} placeholder="e.g., torah" />
				</label>
			{:else if selectedEndpoint === 'links'}
				<label>
					Reference:
					<input type="text" bind:value={linkRef} placeholder="e.g., Berakhot.2a" />
				</label>
				<label>
					Type (optional):
					<input type="text" bind:value={linkType} placeholder="e.g., commentary" />
				</label>
				<label>
					Direction (optional):
					<select bind:value={linkDirection}>
						<option value="">All</option>
						<option value="from">From</option>
						<option value="to">To</option>
					</select>
				</label>
			{:else if selectedEndpoint === 'calendars'}
				<label>
					Date:
					<input type="date" bind:value={calendars} />
				</label>
			{:else if selectedEndpoint === 'name'}
				<label>
					Name Query:
					<input type="text" bind:value={nameQuery} placeholder="e.g., רש״י" />
				</label>
			{:else if selectedEndpoint === 'person'}
				<label>
					Person Key:
					<input type="text" bind:value={personKey} placeholder="e.g., Rashi" />
				</label>
			{:else if selectedEndpoint === 'collections'}
				<label>
					Collection Slug:
					<input type="text" bind:value={collectionSlug} placeholder="e.g., tanakh" />
				</label>
			{:else if selectedEndpoint === 'groups'}
				<label>
					Group Name:
					<input type="text" bind:value={groupName} placeholder="e.g., Talmud" />
				</label>
			{:else if selectedEndpoint === 'terms'}
				<label>
					Term Name:
					<input type="text" bind:value={termName} placeholder="e.g., Talmud" />
				</label>
			{/if}
		</div>
		
		<button on:click={testEndpoint} disabled={loading}>
			{loading ? 'Loading...' : 'Test Endpoint'}
		</button>
		
		<div class="options">
			<label>
				<input type="checkbox" bind:checked={prettyPrint} />
				Pretty Print JSON
			</label>
			<label>
				<input type="checkbox" bind:checked={showRawResponse} />
				Show Raw Response
			</label>
		</div>
	</div>
	
	{#if error}
		<div class="error">
			<h3>Error</h3>
			<pre>{error}</pre>
		</div>
	{/if}
	
	{#if response}
		<div class="response">
			<div class="response-header">
				<h3>Response</h3>
				<span class="response-time">({responseTime.toFixed(0)}ms)</span>
			</div>
			
			{#if !showRawResponse}
				<div class="summary">
					<h4>Summary</h4>
					<pre>{getResponseSummary()}</pre>
				</div>
				
				{#if selectedEndpoint === 'texts' && response.text}
					<div class="text-preview">
						<h4>Text Preview</h4>
						<p class="hint">Click on any segment to explore its links</p>
						<div class="text-content">
							{#each getTextSegments().slice(0, 10) as segment}
								<div class="segment clickable" on:click={() => handleTextSelection(segment.ref)}>
									<div class="ref-label">{segment.ref}</div>
									<div class="hebrew">{segment.hebrew}</div>
									<div class="english">{segment.text}</div>
								</div>
							{/each}
							{#if response.text.length > 10}
								<p class="more">...and {response.text.length - 10} more segments</p>
							{/if}
						</div>
					</div>
				{/if}
				
				{#if selectedEndpoint === 'search' && response.hits?.hits}
					<div class="search-results">
						<h4>Search Results</h4>
						<p class="hint">Click on any result to explore its links</p>
						{#each response.hits.hits.slice(0, 5) as hit}
							<div class="search-hit clickable" on:click={() => handleTextSelection(hit._source?.ref)}>
								<strong>{hit._source?.ref || 'Unknown'}</strong>
								<div class="highlight">
									{@html hit.highlight?.naive_lemmatizer?.[0] || hit._source?.exact || 'No preview'}
								</div>
							</div>
						{/each}
					</div>
				{/if}
				
				{#if selectedEndpoint === 'links' && showTextSelection}
					<div class="selection-notice">
						<p>Showing links for: <strong>{selectedTextRef}</strong></p>
						<button on:click={() => { showTextSelection = false; selectedTextRef = ''; }}>Clear Selection</button>
					</div>
				{/if}
				
				{#if selectedEndpoint === 'links' && response?.length > 0}
					<div class="links-preview">
						<h4>Links Found ({response.length})</h4>
						<div class="links-grid">
							{#each response.slice(0, 20) as link}
								<div class="link-item">
									<div class="link-type">{link.type || 'Unknown'}</div>
									<div class="link-ref">{link.ref}</div>
									<div class="link-text">
										{#if link.he}
											<div class="hebrew">{link.he}</div>
										{/if}
										{#if link.text}
											<div class="english">{link.text}</div>
										{/if}
									</div>
								</div>
							{/each}
							{#if response.length > 20}
								<p class="more">...and {response.length - 20} more links</p>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
			
			<div class="raw-response">
				<h4>Raw JSON Response</h4>
				<pre>{formatJSON(response)}</pre>
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}
	
	h1 {
		margin-bottom: 2rem;
		color: #333;
	}
	
	.controls {
		background: #f5f5f5;
		padding: 1.5rem;
		border-radius: 8px;
		margin-bottom: 2rem;
	}
	
	.endpoint-selector {
		margin-bottom: 1.5rem;
	}
	
	.endpoint-selector select {
		width: 100%;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		margin-top: 0.5rem;
	}
	
	.description {
		margin-top: 0.5rem;
		color: #666;
		font-style: italic;
	}
	
	.params {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-weight: 500;
	}
	
	input[type="text"],
	input[type="date"],
	select {
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}
	
	button {
		background: #007bff;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}
	
	button:hover:not(:disabled) {
		background: #0056b3;
	}
	
	button:disabled {
		background: #ccc;
		cursor: not-allowed;
	}
	
	.options {
		margin-top: 1rem;
		display: flex;
		gap: 1.5rem;
	}
	
	.options label {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-weight: normal;
	}
	
	.error {
		background: #fee;
		border: 1px solid #fcc;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 2rem;
	}
	
	.error h3 {
		color: #c00;
		margin: 0 0 0.5rem 0;
	}
	
	.response {
		background: #f9f9f9;
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 1.5rem;
	}
	
	.response-header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	
	.response-header h3 {
		margin: 0;
	}
	
	.response-time {
		color: #666;
		font-size: 0.9rem;
	}
	
	.summary {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.summary h4 {
		margin: 0 0 0.5rem 0;
		color: #555;
	}
	
	.text-preview {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.text-preview h4 {
		margin: 0 0 1rem 0;
		color: #555;
	}
	
	.segment {
		display: grid;
		grid-template-columns: auto 1fr 1fr;
		gap: 1rem;
		padding: 0.75rem;
		border-bottom: 1px solid #eee;
		position: relative;
	}
	
	.segment:last-child {
		border-bottom: none;
	}
	
	.segment.clickable {
		cursor: pointer;
		transition: background 0.2s;
	}
	
	.segment.clickable:hover {
		background: #f0f0f0;
	}
	
	.ref-label {
		font-size: 0.85rem;
		color: #666;
		font-weight: 500;
		white-space: nowrap;
	}
	
	.hebrew {
		text-align: right;
		font-size: 1.1rem;
		direction: rtl;
		font-family: 'Frank Ruhl Libre', serif;
	}
	
	.english {
		color: #444;
	}
	
	.hint {
		font-size: 0.85rem;
		color: #666;
		font-style: italic;
		margin: -0.5rem 0 1rem 0;
	}
	
	.more {
		text-align: center;
		color: #666;
		font-style: italic;
		margin-top: 1rem;
	}
	
	.search-results {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.search-results h4 {
		margin: 0 0 1rem 0;
		color: #555;
	}
	
	.search-hit {
		padding: 0.75rem;
		border-bottom: 1px solid #eee;
	}
	
	.search-hit:last-child {
		border-bottom: none;
	}
	
	.search-hit.clickable {
		cursor: pointer;
		transition: background 0.2s;
	}
	
	.search-hit.clickable:hover {
		background: #f0f0f0;
	}
	
	.search-hit strong {
		display: block;
		margin-bottom: 0.5rem;
		color: #333;
	}
	
	.highlight {
		color: #666;
		font-size: 0.95rem;
		line-height: 1.5;
	}
	
	.highlight :global(b) {
		background: #ffeb3b;
		color: #333;
		font-weight: normal;
		padding: 0 2px;
	}
	
	.raw-response {
		background: white;
		padding: 1rem;
		border-radius: 4px;
	}
	
	.raw-response h4 {
		margin: 0 0 0.5rem 0;
		color: #555;
	}
	
	pre {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
		font-family: 'Consolas', 'Monaco', monospace;
		font-size: 0.9rem;
		line-height: 1.5;
		max-height: 500px;
		overflow-y: auto;
	}
	
	.selection-notice {
		background: #e3f2fd;
		border: 1px solid #2196f3;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	
	.selection-notice p {
		margin: 0;
		color: #1976d2;
	}
	
	.selection-notice button {
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		background: #fff;
		color: #1976d2;
		border: 1px solid #1976d2;
	}
	
	.selection-notice button:hover {
		background: #e3f2fd;
	}
	
	.links-preview {
		background: white;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}
	
	.links-preview h4 {
		margin: 0 0 1rem 0;
		color: #555;
	}
	
	.links-grid {
		display: grid;
		gap: 1rem;
	}
	
	.link-item {
		padding: 1rem;
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		background: #fafafa;
	}
	
	.link-type {
		display: inline-block;
		background: #2196f3;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 3px;
		font-size: 0.8rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
		text-transform: capitalize;
	}
	
	.link-ref {
		font-weight: 500;
		color: #333;
		margin-bottom: 0.5rem;
	}
	
	.link-text {
		display: grid;
		gap: 0.5rem;
	}
	
	.link-text .hebrew {
		font-size: 1rem;
		padding: 0.5rem;
		background: white;
		border-radius: 3px;
	}
	
	.link-text .english {
		font-size: 0.95rem;
		padding: 0.5rem;
		background: white;
		border-radius: 3px;
	}
</style>