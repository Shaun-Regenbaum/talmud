import { redis, redisConnect, redisReconnect } from '$lib/db';
import { createEmbedding } from '$lib/openai';
import { storeEmbedding } from '$lib/db';
import { json } from '@sveltejs/kit';

export async function GET() {
	let debug: boolean = true;
	let status: string[] = [];
	status = await redisConnect(redis, status);

	if (debug) console.log('Getting keys');
	status.push('Getting keys');
	const keys = await redis.keys('group:*').catch((e) => {
		if (debug) console.log('Error getting keys');
		status.push('Error getting keys');
		throw new Error(e);
	});
	if (debug) console.log('Got Keys');
	status.push('Got keys');

	for (let i = 0; i < keys.length; i++) {
		if (debug) console.log(`Working on ${i}/${keys.length}...`);
		status.push(`Working on ${i}/${keys.length}...`);
		let groupedText = await redis.json.get(keys[i]).catch((e) => {
			if (debug) console.log(`Failed on ${i}/${keys.length}...`);
			status.push(`Failed on ${i}/${keys.length}...`);
			throw new Error(e);
		});
		if (debug) console.log(`Got text for ${keys[i]}`);
		try {
			const text = JSON.parse(JSON.stringify(groupedText)).text;
			try {
				if (debug) console.log(`Embedding In Progress for ${keys[i]}`);
				status.push(`Embedding In Progress for ${keys[i]}`);
				const embedding = await createEmbedding(text).catch((e) => {
					if (debug) console.log(`Failed on ${i}/${keys.length}...`);
					status.push(`Failed on ${i}/${keys.length}...`);
					throw new Error(e);
				});
				if (debug) console.log(`Created embedding for ${keys[i]}`);
				status.push(`Created embedding for ${keys[i]}`);
				await storeEmbedding(keys[i], embedding, true).catch((e) => {
					if (debug) console.log(`Failed on ${i}/${keys.length}...`);
					status.push(`Failed on ${i}/${keys.length}...`);
					throw new Error(e);
				});
				// I know it will only be data rn:
				status.push(`Stored embedding for ${keys[i]}`);
				if (debug) console.log(`Finished ${i}/${keys.length}...`);
				status.push(`Finished ${i}/${keys.length}...`);
			} catch (e) {
				status = await redisReconnect(redis, status);
			}
		} catch (e) {
			status = await redisReconnect(redis, status);
		}
	}
	if (debug) console.log(`Finished`);
	status.push(`Finished`);
	redis.quit().catch(() => {
		if (debug) console.log('Error quitting redis');
	});
	return json(status);
}
