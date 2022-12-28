import { redis } from '$lib/db';

import { replaceEmbed } from '$lib/db';
import { json } from '@sveltejs/kit';

export async function GET() {
	let status = [];
	try {
		await redis.connect();
		console.log('Redis connected');
		status.push('Redis connected');
	} catch {
		if (!redis.isOpen) {
			console.log("Redis didn't connect");
			throw Error("Redis didn't connect");
		}
		console.log('Redis already connected');
		status.push('Redis already connected');
	}
	console.log('Getting keys');
	status.push('Getting keys');
	const keys = await redis.keys('group:*');
	status.push('Get keys');
	console.log('Got Keys');

	for (let i = 0; i < keys.length; i++) {
		console.log(`Working on ${i}/${keys.length}...`);
		const { data, error } = await replaceEmbed(keys[i]);
		if (data) {
			console.log(`Success for ${keys[i]}`);
			status.push(`Success for ${keys[i]}`);
			status.push(data);
		} else if (error) {
			console.log(`Failure for ${keys[i]}`);
			status.push(`Failure for ${keys[i]}`);
			status.push(error);
		} else {
			console.log(`Unknown error for ${keys[i]}`);
			status.push(`Unknown error for ${keys[i]}`);
		}
	}
	redis.quit();
	return json(status);
}
