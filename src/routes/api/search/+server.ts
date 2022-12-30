import type { BodyForSearch, GroupedText } from '$lib/types';
import { searchIndex } from '$lib/db';
import { searchManualIndex } from '$lib/hnsw';
import { createEmbedding } from '$lib/openai';
import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';
interface SearchResults {
	score: number;
	groupedText: GroupedText;
}

export async function POST({ request }: any) {
	const body: BodyForSearch = await request.json();
	const text = body.text;
	const embedding = await createEmbedding(text);
	try {
		await redis.connect();
	} catch {
		if (!redis.isOpen) {
			throw Error("Redis didn't connect");
		}
	}
	const searchResults = await searchManualIndex(embedding, true);
	// await redis.quit();
	return json(searchResults);
	// sort search results by score
	// if (typeof searchResults === 'string') return json(searchResults);
	// const data = searchResults.sort((a, b) => b.score - a.score);
	// const topText = data[0].groupedText.text;
	// const secondText = data[1].groupedText.text;
	// const averageScore = data[0].score + data[1].score / 2;
	// // add two arrays together:
	// const sources = data[0].groupedText.source.concat(data[1].groupedText.source);
	// return json(data);
}
