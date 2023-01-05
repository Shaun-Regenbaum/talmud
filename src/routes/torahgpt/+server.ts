import { json } from '@sveltejs/kit';
import { redis } from '$lib/db';
import { v4 as uuid } from 'uuid';
import { createCompletion } from '$lib/openai';
export async function POST({ request }: any) {
	const debug: boolean = false;
	const body = await request.json();
	const { question } = body;
	const id = uuid();
	redis
		.set(`question:${id}`, question)
		.then(() => {
			if (debug) console.log('Question Stored');
		})
		.catch(() => {
			if (debug) console.log('Failure to Store Question');
		});

	const text = await createCompletion(question);
	redis
		.set(`answer:${id}`, text.slice(4, -1))
		.then(() => {
			if (debug) console.log('Answer Stored');
		})
		.catch(() => {
			if (debug) console.log('Failure to Store Answer');
		});

	//Todo, store the answer
	return json(text);
}
