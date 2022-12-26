import { searchIndex } from '$lib/db';
import { createEmbedding } from '$lib/openai';
import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';

export async function GET() {
	let query = 'What are the laws of fringes?';
	let status = [];
	try {
		await redis.connect();
		status.push('Redis connected');
	} catch (e) {
		if (!redis.isOpen) {
			console.log("Redis didn't connect");
			throw Error("Redis didn't connect");
		}
		status.push('Redis already connected');
	}

	try {
		status.push('Creating Embedding');
		let embedding = await createEmbedding(query);
		status.push('Embedding created');
		try {
			status.push('Searching index');
			let results = await searchIndex(embedding);
			status.push(results);
			await redis.quit();
			status.push('Redis disconnected');
			return json(status);
		} catch (e) {
			console.log(e);
			status.push('Failed to search index');
			status.push(e.message);
			await redis.quit();
			status.push('Redis disconnected');
			return json(status);
		}
	} catch (e) {
		status.push('Failed to create index');
		status.push(JSON.stringify(e));
		await redis.quit();
		status.push('Redis disconnected');
		return json(status);
	}
}
