import {
	createFlatSearchIndex,
	createHashSearchIndex,
	createSearchIndex,
	redisConnect,
} from '$lib/db';
import { createManualIndex } from '$lib/hnsw';
import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';

export async function GET() {
	// Can be HNSW MODE or HASH
	let mode: string;
	mode = 'FLAT';
	const debug: boolean = false;
	let status: string[] = [];
	let message: string;
	status = await redisConnect(redis, status);
	try {
		if (debug) console.log('Creating index');
		status.push('Creating index');
		switch (mode) {
			case 'FLAT':
				if (debug) console.log('Creating flat index');
				status.push('Creating flat index');
				message = await createFlatSearchIndex(debug);
				break;
			case 'HNSW':
				if (debug) console.log('Creating HNSW index');
				status.push('Creating HNSW index');
				message = await createSearchIndex(debug);
				break;
			case 'HASH':
				if (debug) console.log('Creating HASH index');
				status.push('Creating HASH index');
				message = await createHashSearchIndex(debug);
				break;
			case 'MANUAL':
				if (debug) console.log('Getting keys');
				status.push('Getting keys');
				const keys = await redis.keys('group:*');
				status.push('Get keys');
				if (debug) console.log('Got Keys');
				if (debug) console.log('Creating manual index');
				status.push('Creating manual index');
				message = await createManualIndex(keys, debug);
				break;
			default:
				if (debug) console.log('Invalid mode');
				message = 'Invalid mode';
		}

		if (debug) console.log(message);
		status.push(message);

		// No need to await here unless we are running low on connections
		redis.quit().catch(() => {
			if (debug) console.log('Error quitting redis');
		});
		return json(status);
	} catch (e) {
		if (debug) console.log('Failure to create index.');
		if (debug) console.log(e);

		status.push('Failed to create index');
		status.push(JSON.stringify(e));
		redis.quit().catch(() => {
			if (debug) console.log('Error quitting redis');
		});
		return json(status);
	}
}
