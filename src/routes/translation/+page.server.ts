import { json } from 'stream/consumers';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		console.log('working.');
		const ref = (await request.formData()).get('ref');
		console.log(ref);
		const num = '9b';
		console.log(ref);
		const url = `https://www.sefaria.org/api/texts/${ref}.${num}?context=0`;
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(response.statusText);
		}
		console.log('Finished');
		const data = await response.json();
		console.log(data.text);
		return data;
	},
};
