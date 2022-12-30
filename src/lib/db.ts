import { createClient as createSupa } from '@supabase/auth-helpers-sveltekit';
import {
	SchemaFieldTypes,
	VectorAlgorithms,
	createClient as createRedis,
} from 'redis';
import { env } from '$env/dynamic/public';
import type { StandardResponse } from './types';

export const supabase = createSupa(
	env.PUBLIC_SUPABASE_URL,
	env.PUBLIC_SUPABASE_ANON_KEY
);

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

export async function redisReconnect(redis: any, status: string[]) {
	if (!redis.isOpen) {
		console.log('Redis was disconnected');
		status.push('Redis was disconnected');
		try {
			await redis.connect().then(() => {
				console.log('Redis reconnected');
				status.push('Redis reconnected');
			});
		} catch {
			console.log('Failure to reconnect');
			status.push('Failure to reconnect');
			throw Error('Failure to reconnect');
		}
	}
	return status;
}

export async function redisConnect(redis: any, status: string[]) {
	await redis
		.connect()
		.then(() => {
			status.push('Redis connected');
			console.log('Redis connected');
		})
		.catch(() => {
			if (!redis.isOpen) {
				console.log("Redis didn't connect");
				throw Error("Redis didn't connect");
			}
			console.log('Redis already connected');
			status.push('Redis already connected');
		});
	return status;
}

export async function getKeys(command: string = 'group:'): Promise<any> {
	const keys = redis.keys(command);
	return keys;
}

export async function createSearchIndex(debug: boolean = false) {
	const indexName = 'searchIndex';

	const response = await redis.ft
		.create(
			indexName,
			{
				'$.embedding': {
					type: SchemaFieldTypes.VECTOR,
					TYPE: 'FLOAT64',
					AS: 'id',
					ALGORITHM: VectorAlgorithms.HNSW,
					DIM: 1536,
					DISTANCE_METRIC: 'COSINE',
					EF_RUNTIME: 10,
				},
			},
			{
				ON: 'JSON',
				PREFIX: 'group:',
			}
		)
		.catch((e) => {
			if (debug) console.log(e);
			throw new Error('Failure to Create Index');
		});
	return JSON.stringify(response);
}

export async function createFlatSearchIndex(debug: boolean = false) {
	const indexName = 'flatSearchIndex';

	const response = await redis.ft
		.create(
			indexName,
			{
				'$.embedding': {
					type: SchemaFieldTypes.VECTOR,
					TYPE: 'FLOAT64',
					AS: 'id',
					ALGORITHM: VectorAlgorithms.FLAT,
					DIM: 1536,
					DISTANCE_METRIC: 'COSINE',
					BLOCK_SIZE: 10,
					INITIAL_CAP: 100,
				},
			},
			{
				ON: 'JSON',
				PREFIX: 'group:',
			}
		)
		.catch((e) => {
			if (debug) console.log(e);
			throw new Error('Failure to Create Index');
		});
	return JSON.stringify(response);
}

export async function createHashSearchIndex(debug: boolean = false) {
	const indexName = 'hashSearchIndex';
	const response = await redis.ft
		.create(
			indexName,
			{
				embedding: {
					type: SchemaFieldTypes.VECTOR,
					TYPE: 'FLOAT64',
					AS: 'id',
					ALGORITHM: VectorAlgorithms.FLAT,
					DIM: 1536,
					DISTANCE_METRIC: 'COSINE',
					BLOCK_SIZE: 10,
					INITIAL_CAP: 100,
				},
			},
			{
				ON: 'HASH',
				PREFIX: 'hash:',
			}
		)
		.catch((e) => {
			if (debug) console.log(e);
			throw new Error('Failure to Create Index');
		});
	return JSON.stringify(response);
}

export async function searchIndex(
	embed: any,
	debug: boolean = false,
	mode: 'FLAT' | 'HNSW' | 'HASH' = 'HASH'
) {
	const indexName =
		mode === 'FLAT'
			? 'flatSearchIndex'
			: mode === 'HASH'
			? 'hashSearchIndex'
			: 'searchIndex';
	debug = true;
	if (debug) console.log('Embed:', embed);
	if (debug) console.log('Converting...');
	const queryBlob = convertEmbedding(embed, debug);
	if (debug) console.log('Converted:', queryBlob);
	try {
		// It took me so long to get this working...
		if (debug) console.log('Searching...');
		const results = await redis.ft.search(indexName, `*=>[KNN 10 @id $BLOB]`, {
			PARAMS: { BLOB: queryBlob },
			DIALECT: 2,
		});
		if (debug) console.log('Results:', results);
		let groupedTextArray = [];
		return results;
		// for (let i = 0; i < results.total; i++) {
		// 	let groupedText = JSON.parse(String(results.documents[i].value['$']));
		// 	let score = results.documents[i].value['__id_score'];
		// 	console.log('score:', score);
		// 	groupedTextArray.push({ score: score, groupedText: groupedText });
		// }
		// if (debug) console.log('Finished.');
		// return groupedTextArray;
	} catch (e) {
		console.log(e);
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
export async function replaceEmbed(key: string): Promise<StandardResponse> {
	const embedding = await redis.json.get(key, { path: '$.embedding' });
	try {
		// @ts-ignore
		const arr = JSON.parse(embedding);
		const floatArr = arr.map((x: any) => parseFloat(x));
		console.log(floatArr);
		await redis.json.set(key, '$.embedding', floatArr, { XX: true });
		return { data: embedding, error: null };
	} catch (e) {
		//@ts-ignore
		console.log(e.message);
		//@ts-ignore
		return { data: null, error: { message: e.message } };
	}

	return { data: null, error: null };
}

export async function storeEmbedding(
	key: string,
	embedding: Array<any>,
	debug: boolean = false
): Promise<StandardResponse> {
	await redis.json.set(key, '$.embedding', `[[${embedding}]]`, { NX: true });
	console.log(embedding);
	return { data: embedding, error: null };
}

export async function getEmbedding(
	key: string,
	debug: boolean = false
): Promise<StandardResponse> {
	const embedding = await redis.json.get(key, { path: '$.embedding' });
	if (debug) console.log(embedding);
	return { data: embedding, error: null };
}

export async function storeHash(
	key: string,
	embed: any,
	debug: boolean = false
) {
	// replace group: with hash: for the key
	key = key.replace('group:', 'hash:');
	console.log(key);
	const newValue = convertEmbedding(JSON.parse(JSON.stringify(embed)), debug);
	redis.hSet(key, 'embedding', newValue);
	return { data: newValue, error: null };
}

export async function deleteHash(key: string) {
	// replace group: with hash: for the key
	key = key.replace('group:', 'hash:');
	redis.del(key);
	return { data: 'Success with Deleting', error: null };
}

function convertEmbedding(array: number[], debug: boolean = false): string {
	const float64Array = new Float32Array(array);
	if (debug) console.log(float64Array);

	// Convert the Float32Array to a Buffer object
	const buffer = Buffer.from(float64Array.buffer);
	if (debug) console.log(buffer);

	// Convert the Buffer object to a hexadecimal string
	let hexString = buffer.toString('hex');

	// Insert \x characters into the hexadecimal string
	// hexString = hexString.replace(/(..)/g, '\\x$1');
	if (debug) console.log(hexString);

	return hexString;
}
