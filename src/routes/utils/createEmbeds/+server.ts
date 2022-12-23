import { redis } from '$lib/db';
import { createEmbedding, storeEmbedding } from '$lib/openai';
import { json } from '@sveltejs/kit';

export async function GET() {
	let status = [];
	try {
		await redis.connect();
		status.push('Redis connected');
	} catch {
		if (!redis.isOpen) {
			console.log("Redis didn't connect");
			throw Error("Redis didn't connect");
		}
		status.push('Redis already connected');
	}
	const keys = await redis.keys('group:*');
	status.push(keys);

	for (let i = 0; i < keys.length; i++) {
		let groupedText = await redis.json.get(keys[i]);
		try {
			const text = JSON.parse(JSON.stringify(groupedText)).text;
			try {
				const embedding = await createEmbedding(text);
				console.log(embedding);
				status.push(`Created embedding for ${keys[i]}`);
				await storeEmbedding(keys[i], embedding);
				status.push(`Stored embedding for ${keys[i]}`);
			} catch (e) {
				console.log(JSON.stringify(e));
				status.push(`Failed to make or store embedding for ${keys[i]}`);
			}
		} catch (e) {
			console.log(JSON.stringify(e));
			status.push(`No text for ${keys[i]}`);
		}
	}

	await redis.quit();
	return json(status);
}
