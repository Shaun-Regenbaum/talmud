import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/public';
import { redis } from './db';
import { SchemaFieldTypes, VectorAlgorithms } from '@redis/search';

import type { RediSearchSchema } from '@redis/search';

const configuration = new Configuration({
	apiKey: env.PUBLIC_OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export async function createEmbedding(text: string): Promise<any> {
	const embedding = await openai.createEmbedding({
		model: 'text-embedding-ada-002',
		input: text,
	});
	console.log(embedding.data.data[0]);
	return embedding.data.data[0].embedding;
}

export async function storeEmbedding(key: string, embedding: Array<any>) {
	await redis.json.set(key, '$.embedding', embedding, { NX: true });
}

export async function createSearchIndex() {
	const indexName = 'searchIndex';

	const schema: RediSearchSchema = {
		'$.id': {
			type: SchemaFieldTypes.TEXT,
			SORTABLE: 'UNF',
		},
		'$.embedding': {
			//@ts-ignore
			type: SchemaFieldTypes.VECTOR,
			//@ts-ignore
			ALGORITHM: VectorAlgorithms.FLAT,
			//@ts-ignore
			VECTOR_DIMENSION: 1024,
		},
	};
	await redis.ft.create(indexName, schema, {
		ON: 'JSON',
		PREFIX: 'group:',
	});
}

export async function searchIndex(embed: any) {
	await redis.ft.search('idx:embeds', `@embedding:{${embed}}`);
}
