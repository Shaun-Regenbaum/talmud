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
			status.push('Redis failed to connect');
			let message = 'Unknown error';
			if (e instanceof Error) message = e.message;
			if (e instanceof Response) {
				message = e.statusText;
			}
			status.push(message);
			return json(status);
		}
		status.push('Redis already connected');
	}

	try {
		status.push('Creating Embedding');
		let embedding = await createEmbedding(query, true);
		status.push('Embedding created');
		try {
			status.push('Searching index');
			let results = await searchIndex(embedding, true);
			status.push(results);
			redis.quit();
			status.push('Redis disconnected');
			return json(status);
		} catch (e) {
			status.push('Failed to search index');
			let message = 'Unknown error';
			if (e instanceof Error) message = e.message;
			if (e instanceof Response) {
				message = e.statusText;
			}
			status.push(message);
			await redis.quit();
			status.push('Redis disconnected');
			return json(status);
		}
	} catch (e) {
		status.push('Failed to search index');
		let message = 'Unknown error';
		if (e instanceof Error) message = e.message;
		if (e instanceof Response) {
			message = e.statusText;
		}
		status.push(message);
		await redis.quit();
		status.push('Redis disconnected');
		return json(status);
	}
}
