import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/public';
import { redis } from './db';

const configuration = new Configuration({
	apiKey: env.PUBLIC_OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export async function createEmbedding(
	text: string,
	debug: boolean = false
): Promise<any> {
	const response = await openai.createEmbedding({
		model: 'text-embedding-ada-002',
		input: text,
	});
	if (debug) console.log('Embedding Created');
	return response.data.data[0].embedding;
}

export async function createCompletion(
	text: string,
	debug: boolean = false
): Promise<any> {
	const response = await openai.createCompletion({
		model: 'text-davinci-003',
		prompt: text,
		max_tokens: 1500,
		temperature: 0,
	});
	if (debug) console.log('Completion Created');
	if (debug) console.log(response.data.choices[0].text);
	return response.data.choices[0].text;
}
