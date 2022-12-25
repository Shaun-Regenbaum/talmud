import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/public';
import { redis } from './db';

const configuration = new Configuration({
	apiKey: env.PUBLIC_OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export async function createEmbedding(text: string): Promise<any> {
	const response = await openai.createEmbedding({
		model: 'text-embedding-ada-002',
		input: text,
	});
	console.log(response.data.data[0]);
	return response.data.data[0].embedding;
}

export async function storeEmbedding(key: string, embedding: Array<any>) {
	await redis.json.set(key, '$.embedding', embedding, { NX: true });
}

export async function createCompletion(text: string): Promise<any> {
	const response = await openai.createCompletion({
		model: 'text-davinci-003',
		prompt: 'Say this is a test',
		max_tokens: 7,
		temperature: 0,
	});
	console.log(response.data.choices[0].text);
	return response.data.choices[0].text;
}
