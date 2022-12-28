import { deleteHash, getEmbedding, redis, storeHash } from '$lib/db';
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
		try {
			const response0 = await deleteHash(keys[i]);
			console.log(response0.data);
			const response1 = await getEmbedding(keys[i]);
			const embedding = response1.data[0];
			const response2 = await storeHash(keys[i], embedding, true);
			console.log(response2.data);
			status.push(response2.data);
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
