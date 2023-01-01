import { createClient as createSupa } from '@supabase/auth-helpers-sveltekit';
import {
	SchemaFieldTypes,
	VectorAlgorithms,
	createClient as createRedis,
} from 'redis';
import { env } from '$env/dynamic/public';

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
	const float64Array = new Float32Array(embed);

	if (debug) console.log('Converted.');
	try {
		// It took me so long to get this working...
		if (debug) console.log('Searching...');
		const results = await redis.ft
			.search(indexName, `*=>[KNN 10 @id $BLOB]`, {
				PARAMS: { BLOB: queryBlob },
				DIALECT: 2,
			})
			.catch((e) => {
				if (debug) console.log(e);
				throw new Error(`Failure to Search ${indexName}`);
			});
		for (const result of results.documents) {
			const score = result.value['__id_score'];
			if (debug) console.log('Score:', score);
			//@ts-ignore
			const body = JSON.parse(result.value['$']);
			const text = body.text;
			const contains = body.contains;
			const source = body.source;
			// if (debug) console.log('Text:', text);
			if (debug) console.log('Contains:', contains);
			if (debug) console.log('Source:', source);
		}
		// if (debug) console.log('Results:', JSON.stringify(results.documents[0]));

		return results;
	} catch (e: any) {
		return `Something failed ${e.message}`;
	}
}

/** This function converts the embedding to an that can be properly indexed
 * @param key - The key of the embedding
 */
export async function replaceEmbed(
	key: string,
	debug: boolean = false
): Promise<string> {
	const embedding = await redis.json.get(key, { path: '$.embedding' });
	try {
		// @ts-ignore
		const arr = JSON.parse(embedding);
		let floatArr;
		if (arr.length !== 1536) {
			floatArr = arr[0].map((x: any) => parseFloat(x));
		} else {
			floatArr = arr.map((x: any) => parseFloat(x));
		}
		if (debug) console.log(floatArr);
		await redis.json.set(key, '$.embedding', floatArr);
		return 'Success';
	} catch (e) {
		console.log(e);
		throw new Error('Embed Failure');
	}
}

export async function storeEmbedding(
	key: string,
	embedding: Array<any>,
	debug: boolean = true
): Promise<string> {
	// const noReplace = { NX: true };
	// const onlyReplace = { XX: true };
	await redis.json.set(key, '$.embedding', embedding);
	if (debug) console.log(embedding);
	return 'Embedding Stored';
}

export async function getEmbedding(
	key: string,
	debug: boolean = false
): Promise<any> {
	const embedding = await redis.json.get(key, { path: '$.embedding' });
	if (debug) console.log(embedding);
	return embedding;
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

function convertEmbedding(array: number[], debug: boolean = false): Buffer {
	let floatArray = new Float64Array(array);
	if (debug) console.log(floatArray.length);
	// Convert the Float32Array to a bytes object
	let bytes = new Uint8Array(floatArray.buffer).slice();
	const queryBlob = Buffer.from(bytes);

	return queryBlob;
}
