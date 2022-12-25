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
	try {
		const schema: RediSearchSchema = {
			'$.id': {
				type: SchemaFieldTypes.TEXT,
				SORTABLE: 'UNF',
			},
		};
		const response = await redis.ft.create(indexName, schema, {
			ON: 'JSON',
			PREFIX: 'group:',
		});
		return JSON.stringify(response);
	} catch (e) {
		return 'Something failed: ' + JSON.stringify(e);
	}
}

export async function searchIndex(embed: any) {
	try {
		await redis.ft.search('idx:embeds', `@embedding:{${embed}}`);
		return 'Embeds Index Created';
	} catch (e) {
		console.log(e);
		return 'Embeds Index Already Exists';
	}
}
