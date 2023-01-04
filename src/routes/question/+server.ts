import { json } from '@sveltejs/kit';
import { createCompletion } from '$lib/openai';
export async function POST({ request }: any) {
	const body = await request.json();
	const { question } = body;
	const text = await createCompletion(question);
	return json(text);
}
