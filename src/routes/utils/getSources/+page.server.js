import { searchIndex } from '$lib/db';
import { createEmbedding } from '$lib/openai';
import { redis } from '$lib/db';
import { json } from '@sveltejs/kit';

export const actions = {
	//@ts-ignore
	default: async ({ request }) => {
		const data = await request.formData();
		const question = data.get('question');
		try {
			await redis.connect();
		} catch (e) {
			if (!redis.isOpen) {
				throw Error("Redis didn't connect");
			}
		}

		try {
			let embedding = await createEmbedding(question);
			try {
				let results = await searchIndex(embedding);
				await redis.quit();
				return json(results);
			} catch (e) {
				console.log(e);
				await redis.quit();
				throw Error('Search Failed');
			}
		} catch (e) {
			await redis.quit();
			throw Error('Embedding Failed');
		}
	},
};
