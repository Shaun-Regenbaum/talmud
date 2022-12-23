import { redis } from '$lib/db';
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

	await redis.quit();
	return json(status);
}
