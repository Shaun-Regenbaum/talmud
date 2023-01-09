import { json } from '@sveltejs/kit';
import { createTranslation } from '$lib/openai';
import type { Actions } from './$types';

export async function POST({ request }: any) {
	const debug: boolean = true;
	const body = await request.json();
	const { aramaic, english, word } = body;

	const translation = await createTranslation(aramaic, english, word, debug);
	return json(translation);
}