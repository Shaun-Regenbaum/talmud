import {
	createFlatSearchIndex,
	createHashSearchIndex,
	createSearchIndex,
} from '$lib/db';
import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';

export async function GET() {
	const mode: 'FLAT' | 'HNSW' | 'HASH' = 'HASH';
	let status = [];
	let message: string;
	await redis.connect();
	console.log('Redis connected');
	status.push('Redis connected');
	try {
		console.log('Creating index');
		status.push('Creating index');
		if (mode === 'FLAT') {
			console.log('Creating flat index');
			status.push('Creating flat index');
			message = await createFlatSearchIndex();
		} else if (mode === 'HNSW') {
			console.log('Creating HNSW index');
			status.push('Creating HNSW index');
			message = await createSearchIndex();
		} else if (mode === 'HASH') {
			console.log('Creating HASH index');
			status.push('Creating HASH index');
			message = await createHashSearchIndex();
		} else {
			console.log('Invalid mode');
			message = 'Invalid mode';
		}
		console.log(message);
		status.push(message);
		await redis.quit();
		console.log('Redis disconnected');
		status.push('Redis disconnected');
		return json(status);
	} catch (e) {
		console.log(e);
		console.log('!!!! Failed to create index !!!!');
		status.push('Failed to create index');
		status.push(JSON.stringify(e));
		await redis.quit();
		console.log('Redis disconnected');
		status.push('Redis disconnected');
		return json(status);
	}
}
