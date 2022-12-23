import { redis } from '$lib/db';
import { getIndex } from '$lib/sefaria';
import { json } from '@sveltejs/kit';

export async function GET({ url }: { url: URL }) {
	let ref = url.searchParams.get('ref');
	console.log(JSON.stringify(ref));
	try {
		let toc = await getIndex('Halakhah/Mishneh%20Torah');
		return json(toc);
	} catch (e) {
		console.log(e);
	}
}
