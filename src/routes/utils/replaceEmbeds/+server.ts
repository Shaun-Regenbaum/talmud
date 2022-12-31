import { getEmbedding, redis, redisConnect, replaceEmbed } from '$lib/db';

import { json } from '@sveltejs/kit';

export async function GET() {
	let debug: boolean = false;
	let status: string[] = [];
	status = await redisConnect(redis, status);

	if (debug) console.log('Getting keys');
	status.push('Getting keys');
	const keys = await redis.keys('group:*');
	if (debug) console.log('Got Keys');
	status.push('Got keys');

	for (let i = 0; i < keys.length; i++) {
		console.log(`Working on ${i}/${keys.length}...`);
		status.push(`Working on ${i}/${keys.length}...`);
		try {
			const response = await replaceEmbed(keys[i]).catch((e) => {
				throw new Error(`Failed on ${i}/${keys.length}...`);
			});
			status.push(JSON.stringify(response));
		} catch (e) {
			console.log(`Failed on ${i}/${keys.length}...`);
			status.push(`Faixwled on ${i}/${keys.length}...`);
			if (debug) console.log(JSON.stringify(e));
			if (debug) status.push(`No text for ${keys[i]}`);
		}
	}
	console.log(`Finished`);
	status.push(`Finished`);

	redis.quit();
	return json(status);
}
