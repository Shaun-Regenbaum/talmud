import { createSearchIndex } from '$lib/openai';
import { json } from '@sveltejs/kit';

export async function GET() {
	let status = [];
	try {
		status.push('Creating index');
		let message = await createSearchIndex();
		status.push(message);
		return json(status);
	} catch (e) {
		console.log(e);
		status.push('Failed to create index');
		status.push(JSON.stringify(e));
		return status;
	}
}
