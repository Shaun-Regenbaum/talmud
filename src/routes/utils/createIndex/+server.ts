import { createSearchIndex } from '$lib/db';
import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';

export async function GET() {
	let status = [];
	await redis.connect();
	status.push('Redis connected');
	try {
		status.push('Creating index');
		let message = await createSearchIndex();
		status.push(message);
		await redis.quit();
		status.push('Redis disconnected');
		return json(status);
	} catch (e) {
		console.log(e);
		status.push('Failed to create index');
		status.push(JSON.stringify(e));
		await redis.quit();
		status.push('Redis disconnected');
		return json(status);
	}
}
