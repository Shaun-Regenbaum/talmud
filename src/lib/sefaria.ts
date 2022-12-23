// function to fetch the text of a given ref
import type { GroupedText, OriginalText, SingleText } from './types';
import { v4 as uuid } from 'uuid';
import { redis } from './db';

/** Used to get the text of a given ref
 * @async This is an async function for fetch calls
 * @param {string} ref - the ref of the text
 * @param {string} num - the number of the text
 * @returns {Promise<SingleText[]>} - an array of SingleTexts
 * @example getText('Genesis 1', '1')
 */
export async function getText(ref: string, num: string): Promise<SingleText[]> {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	const url = `https://www.sefaria.org/api/texts/${ref}.${num}?context=0`;
	const response = await fetch(url);
	const data = await response.json();
	const text = data.text;
	const he = data.he;
	const heRef = data.heRef;
	const index = Number(redis.get('originalIndex'));

	const original: OriginalText = {
		id: uuid(),
		name: '',
		en: text,
		he: he,
		index: index,
		source: heRef,
		heSource: heRef,
	};
	redis.set('originalIndex', index + 1);

	let splits = await splitTexts(
		original.id,
		original.en[0],
		original.he[0],
		original.source,
		original.heSource
	);

	return splits;
}

/** Used to group an array of texts into a single text
 * @async This is an async function for redis calls
 * @param {string} id - the id of the parent text
 * @param {SingleText[]} texts - the texts to group
 * @returns {Promise<GroupedText>} - the grouped text
 */
export async function groupTexts(
	id: string,
	texts: SingleText[]
): Promise<GroupedText> {
	let text = '';
	let he = '';
	let source: string[] = [];
	let index = 0;
	try {
		let index = Number(redis.get('groupIndex'));
	} catch {
		redis.set('groupIndex', 0);
	}
	for (let i = 0; i < texts.length; i++) {
		text += texts[i].en[0];
		he += texts[i].he[0];
		source.push(texts[i].source);
	}
	source = source.filter((item, index) => source.indexOf(item) === index);
	let group: GroupedText = {
		id: id,
		contains: texts.map((text) => text.id),
		text: text,
		source: source,
		index: index,
	};
	redis.set('groupIndex', index + 1);
	return group;
}

/** Used to split a text into N texts
 * @param {string} id - the id of the parent text
 * @param {string} text - the english text to split
 * @param {string} he - the hebrew text to split
 * @param {string} source - the source of the text
 * @param {string} heRef - the hebrew ref of the text
 * @returns {SingleText[]} - an array of SingleTexts
 */
async function splitTexts(
	id: string,
	text: string,
	he: string,
	source: string,
	heRef: string
): Promise<SingleText[]> {
	let texts: SingleText[] = [];
	let en = text.split(/(?<=\.)\s/);
	let hebrew = he.split(/(?<=\.)\s/);
	let index = Number(await redis.get('splitIndex'));

	for (let i = 0; i < en.length; i++) {
		texts.push({
			id: uuid(),
			name: '',
			parent: id,
			en: [en[i]],
			he: [hebrew[i]],
			source: source,
			heSource: heRef,
			index: index + i,
		});
	}
	redis.set('splitIndex', index + en.length);

	return texts;
}

/** Used to get the length of a given ref
 * @param {string} ref - the ref of the text to get the length of
 */
async function getLength(ref: string): Promise<number> {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	const url = `https://www.sefaria.org/api/texts/${ref}?commentary=0`;
	const response = await fetch(url);
	const data = await response.json();
	const length = data.length;
	return Number(length);
}
