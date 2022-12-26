import { searchIndex } from '$lib/db';
import { createEmbedding } from '$lib/openai';
import { redis } from '$lib/db';
import { json } from '@sveltejs/kit';

export function load({}) {
	return {
		thing: 'hello',
	};
}

export const actions = {
	//@ts-ignore
	default: async (event) => {
		let status = [];
		const data = await event.request.formData();
		const question = data.get('question');
		status.push('Got Question');
		status.push(question);
		try {
			await redis.connect();
			status.push('Connected to Redis');
		} catch (e) {
			if (!redis.isOpen) {
				status.push("Redis didn't connect");
				return status;
				throw Error("Redis didn't connect");
			}
		}

		try {
			let embedding = await createEmbedding(question);
			status.push('Created Embedding');
			try {
				status.push('Searching Index');
				let results = await searchIndex(embedding);
				status.push('Found Results');
				status.push(results);
				return status;
			} catch (e) {
				console.log(e);
				await redis.quit();
				status.push('Search Failed');
				return status;
				throw Error('Search Failed');
			}
		} catch (e) {
			await redis.quit();
			status.push('Embedding Failed');
			return status;
			throw Error('Embedding Failed');
		}
	},
};
