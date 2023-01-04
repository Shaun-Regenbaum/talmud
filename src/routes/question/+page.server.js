import { createCompletion } from '$lib/openai';
import { json } from '@sveltejs/kit';
/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const question = data.get('question');
		if (!question) return { status: 400, body: 'No question provided' };
		let completion = await createCompletion(question);
		return json(completion);
	},
};
