import { redis } from '$lib/db';
import { createEmbedding } from '$lib/openai';
import { storeEmbedding } from '$lib/db';
import { json } from '@sveltejs/kit';

export async function GET() {
	let debug: boolean = false;
	let status = [];
	try {
		await redis.connect();
		if (debug) console.log('Redis connected');
		status.push('Redis connected');
	} catch {
		if (!redis.isOpen) {
			console.log("Redis didn't connect");
			throw Error("Redis didn't connect");
		}
		if (debug) console.log('Redis already connected');
		status.push('Redis already connected');
	}
	if (debug) console.log('Getting keys');
	status.push('Getting keys');
	const keys = await redis.keys('group:*');
	if (debug) console.log('Got Keys');
	status.push('Got keys');

	for (let i = 0; i < keys.length; i++) {
		console.log(`Working on ${i}/${keys.length}...`);
		status.push(`Working on ${i}/${keys.length}...`);
		let groupedText = await redis.json.get(keys[i]);
		if (debug) console.log(`Got text for ${keys[i]}`);
		status.push(`Got text for ${keys[i]}`);
		try {
			const text = JSON.parse(JSON.stringify(groupedText)).text;
			try {
				if (debug) console.log(`Embedding In Progress for ${keys[i]}`);
				if (debug) status.push(`Embedding In Progress for ${keys[i]}`);
				const embedding = await createEmbedding(text);
				if (debug) console.log(`Created embedding for ${keys[i]}`);
				if (debug) status.push(`Created embedding for ${keys[i]}`);
				const { data, error } = await storeEmbedding(keys[i], embedding, true);
				// I know it will only be data rn:
				if (debug) console.log(`Stored embedding for ${keys[i]}`);
				if (debug) status.push(`Stored embedding for ${keys[i]}`);
				console.log(`Finished ${i}/${keys.length}...`);
				status.push(`Finished ${i}/${keys.length}...`);
			} catch (e) {
				console.log(`Failed on ${i}/${keys.length}...`);
				status.push(`Failed on ${i}/${keys.length}...`);
				if (debug) console.log(JSON.stringify(e));
				if (debug) status.push(JSON.stringify(e));
			}
		} catch (e) {
			console.log(`Failed on ${i}/${keys.length}...`);
			status.push(`Failed on ${i}/${keys.length}...`);
			if (debug) console.log(JSON.stringify(e));
			if (debug) status.push(`No text for ${keys[i]}`);
		}
	}
	console.log(`Finished`);
	status.push(`Finished`);

	redis.quit();
	return json(status);
}
