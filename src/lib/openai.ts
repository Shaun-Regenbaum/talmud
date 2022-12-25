import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/public';
import { redis } from './db';

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
