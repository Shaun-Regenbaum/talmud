// import { createClient as createSupa } from '@supabase/auth-helpers-sveltekit';
import {
	SchemaFieldTypes,
	VectorAlgorithms,
	createClient as createRedis,
} from 'redis';
import { env } from '$env/dynamic/public';

import { Blob } from 'buffer';

// export const supabase = createSupa(
// 	env.PUBLIC_SUPABASE_URL,
// 	env.PUBLIC_SUPABASE_ANON_KEY
// );

export const redis = createRedis({
	url: env.PUBLIC_REDIS_URL,
});

export const resetIndices = async () => {
	try {
		await redis.set('count:originalIndex', 0);
		await redis.set('count:splitIndex', 0);
		await redis.set('count:groupIndex', 0);
	} catch (e) {
		throw new Error(JSON.stringify(e));
	}
};

export async function getKeys(command: string = 'group:'): Promise<any> {
	const keys = redis.keys(command);
	return keys;
}

export async function createSearchIndex() {
	const indexName = 'searchIndex';
	try {
		const response = await redis.ft.create(
			indexName,
			{
				'$.embedding': {
					type: SchemaFieldTypes.VECTOR,
					TYPE: 'FLOAT64',
					AS: 'id',
					ALGORITHM: VectorAlgorithms.HNSW,
					DIM: 1536,
					DISTANCE_METRIC: 'COSINE',
					EF_RUNTIME: 20,
				},
			},
			{
				ON: 'JSON',
				PREFIX: 'group:',
			}
		);
		return JSON.stringify(response);
	} catch (e) {
		let message = 'Unknown Error';
		let status = null;
		if (e instanceof Error) message = e.message;
		if (e instanceof Response) {
			status = e.status;
			message = e.statusText;
		}
		// we'll proceed, but let's report it
		return `Something failed with status ${status}: ${message}`;
	}
}

export async function searchIndex(embed: any, debug: boolean = false) {
	// convert array of emebds of float64 to bytes:
	if (debug) console.log('Converting to bytes...');
	let floatArray = new Float64Array(embed);
	console.log(floatArray.length);
	// Convert the Float32Array to a bytes object
	let bytes = new Uint8Array(floatArray.buffer).slice();
	const queryBlob = Buffer.from(bytes);
	if (debug) console.log('Converted.');
	// get rid of commas
	try {
		// It took me so long to get this working...
		if (debug) console.log('Searching...');
		const results = await redis.ft.search(
			'searchIndex',
			`*=>[KNN 10 @id $BLOB]`,
			{ PARAMS: { BLOB: queryBlob }, DIALECT: 2 }
		);
		if (debug) console.log('Finished.');
		return results;
	} catch (e) {
		if (debug) console.log('Error.');
		let message = 'Unknown Error Type';
		let status = null;
		if (e instanceof Error) message = e.message;
		if (e instanceof Response) {
			status = e.status;
			message = e.statusText;
		}
		// we'll proceed, but let's report it
		return `Something failed with status ${status}: ${message}`;
	}
}
