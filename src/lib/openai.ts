import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/public';

const configuration = new Configuration({
	apiKey: env.PUBLIC_OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const completion = await openai.createCompletion({
	model: 'text-davinci-002',
	prompt: 'Hello world',
});
console.log(completion.data.choices[0].text);

export async function createEmbeddings(text: string) {}
