// function to fetch the text of a given ref
import type { GroupedText, OriginalText, SingleText } from './types';
import { v4 as uuid } from 'uuid';
import { redis, supabase } from './db';
import { splitTexts } from './textManipulation';

/** Used to get the text of a given ref
 * @async This is an async function for fetch calls
 * @param {string} ref - the ref of the text
 * @param {string} num - the number of the text
 * @returns {Promise<SingleText[]>} - an array of SingleTexts
 * @example getText('Genesis 1', '1')
 */
export async function getText(
	ref: string,
	num: string,
	debug: boolean = false
): Promise<SingleText[]> {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	if (debug) console.log(`Ref: ${ref}`);
	if (ref.includes('undefined')) {
		throw new Error(
			'ref was undefined, something went wrong in previous function'
		);
	}
	if (num === '0') {
		throw new Error('Invalid number, needs to be greater than 0');
	}
	const url = `https://www.sefaria.org/api/texts/${ref}.${num}?context=0`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(response.statusText);
	}
	const data = await response.json();
	if (debug) console.log('Fetch Recieved.');

	const text: string[] = data.text;
	const he: string[] = data.he;
	let index: number = 0;
	try {
		index = Number(await redis.get('count:originalIndex'));
	} catch {
		try {
			redis.set('count:originalIndex', 0);
		} catch (e) {
			throw new Error(JSON.stringify(e));
		}
	}
	if (debug) console.log('Indices Set.');

	const original: OriginalText = {
		id: uuid(),
		name: '',
		en: text,
		he: he,
		index: Number(index),
		source: data.ref,
	};

	const supabaseResponse = await supabase
		.from('originalTexts')
		.upsert([{ id: original.id, originalText: original }]);
	if (debug) console.log('Stored in supabase', supabaseResponse);

	if (original.source === undefined) {
		throw new Error(`Invalid url: ${url}`);
	}

	if (debug) console.log('Splitting Texts...');
	let splits = await splitTexts(
		original.id,
		original.en[0],
		original.source,
		debug
	);
	if (debug) console.log('Splits Done.');
	return splits;
}

/** Used to get the TOC of a given ref
 * @async This is an async function for fetch calls
 * @param {string} ref - the ref of the text
 * @returns {Promise<any>} - the TOC of the text
 * @example getTOC('Genesis')
 */
export async function getIndex(ref: string, debug: boolean = false) {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	if (debug) console.log(`Ref: ${ref}`);
	try {
		const url = `https://www.sefaria.org/api/index`;
		const response = await fetch(url);
		const data = await response.json();
		if (debug) console.log('Fetch Recieved.');
		return data;
	} catch (e) {
		console.log(e);
	}
}

export async function storeText(
	groupedText: GroupedText,
	debug: boolean = false
) {
	if (debug) console.log('Storing Text...');
	await redis.json.set(`group:${groupedText.id}`, '$', {
		id: groupedText.id,
		contains: groupedText.contains,
		text: groupedText.text,
		source: groupedText.source,
		index: groupedText.index,
	});
	if (debug) console.log('Text Stored.');
}
