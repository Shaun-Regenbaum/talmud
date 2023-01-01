import type { BodyForSearch } from '$lib/types';
import { searchIndex, redisConnect } from '$lib/db';
import { searchManualIndex } from '$lib/hnsw';
import { createEmbedding } from '$lib/openai';
import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';

export async function POST({ request }: any) {
	// Can be HNSW MODE or HASH
	let mode: string;
	mode = 'FLAT';
	const debug: boolean = false;
	let searchResults: any = [];

	const body: BodyForSearch = await request.json();
	const text = body.text;
	const embedding = await createEmbedding(text, debug).catch((e) => {
		console.log(e);
		throw new Error('Error creating embedding');
	});

	await redisConnect(redis, []);

	switch (mode) {
		case 'FLAT':
			if (debug) console.log('Searching FLAT index');
			searchResults = await searchIndex(embedding, true, mode);
			break;
		case 'HNSW':
			if (debug) console.log('Searching HNSW index');
			searchResults = await searchIndex(embedding, true, mode);
			break;
		case 'HASH':
			if (debug) console.log('Searching HASH index');
			searchResults = await searchIndex(embedding, true, mode);
			break;
		case 'MANUAL':
			if (debug) console.log('Searching manual index');
			searchResults = await searchManualIndex(embedding, true);
			break;
		default:
			if (debug) console.log('Invalid mode');
			break;
	}
	redis.quit();

	return json(JSON.stringify(searchResults));
}
