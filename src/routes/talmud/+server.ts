import { json } from '@sveltejs/kit';
import { getHtml } from '$lib/hebrewbooks';

export async function GET() {
	const { main, rashi, tosafot } = await getHtml('Brachot', 4, 1);
	return json({ main, rashi, tosafot });
}
