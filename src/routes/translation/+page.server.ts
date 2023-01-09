import { json } from 'stream/consumers';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		console.log('working.');
		const ref = 'Brachot';
		const num = '9b';
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
