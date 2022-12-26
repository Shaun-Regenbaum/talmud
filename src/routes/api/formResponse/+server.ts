import type { BodyForCompletion, GroupedText } from '$lib/types';
import { searchIndex } from '$lib/db';
import { createCompletion } from '$lib/openai';
import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';
interface SearchResults {
	score: number;
	groupedText: GroupedText;
}

export async function POST({ request }: any) {
	const body: BodyForCompletion = await request.json();
	const revisedText =
		'Answer the following question with the following source text: ' +
		body.question +
		body.context +
		'Answer: ';
	const completion = await createCompletion(revisedText, true);
	return json(completion);
}
