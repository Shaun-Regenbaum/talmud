import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/public';

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
): Promise<string> {
	const prompt = `
	I am a highly intelligent scholar who knows all of Jewish religious law. If you ask me a question that I know the source or sources for, I will give you the answer. If you ask me a question where I am not sure about the answer, I will respond with "I don't know".

	Q: What is the law according to the Rambam if the seventeenth of Marcheshvan has arrived and no rains have descended?
	A: The Rambam says that only the Torah scholars should begin fasting on Mondays and Thursday. Any scholar who is physically healthy should fast. (Mishneh Torah, Fasts, Chapter 3)
	
	Q: Where should I place my tefillin?
	A: Accoring to the Shulchan Aruch, you should place the tefillin shel yad on the left arm on the bicep between the elbow and the armpit, and the tefillin should be tilted towards the heart. (Shulchan Aruch, Orach Chaim, 23)
	
	Q: If the string of my tzitzit breaks at the loop on the corner of the garment, is it still kosher?
	A: Yes, as long as the loop is still intact, the tzitzit is still kosher. (Shulchan Aruch, Orach Chaim, 8:3)

	Q: 
	`;
	const response = await openai.createCompletion({
		model: 'text-davinci-003',
		prompt: prompt + text,
		max_tokens: 1500,
		temperature: 0,
	});
	if (debug) console.log('Completion Created');
	if (debug) console.log(response.data.choices[0].text);
	if (response.data.choices[0].text) {
		return response.data.choices[0].text;
	} else {
		throw new Error("Couldn't create completion");
	}
}
