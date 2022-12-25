import type { GroupedText, SingleText } from './types';
import { v4 as uuid } from 'uuid';
import { redis } from './db';

/** Used to group an array of texts into a single text
 * @async This is an async function for redis calls
 * @param {string} id - the id of the parent text
 * @param {number} n - the number of the sentences to group
 * @param {SingleText[]} texts - the texts to group
 * @returns {Promise<GroupedText>} - the grouped text
 */
export async function groupTexts(
	n: number = 5,
	texts: SingleText[]
): Promise<GroupedText[]> {
	let groups: GroupedText[] = [];
	let group: GroupedText = {
		id: '',
		contains: [],
		text: '',
		source: [],
		index: 0,
	};

	let index = 0;
	// Get the latest index from redis, and create it if it doesn't exist
	try {
		index = Number(await redis.get('count:groupIndex'));
	} catch {
		redis.set('count:groupIndex', 0);
	}

	// If we have enough sentences to make at least two groups of N sentences
	if (n < texts.length) {
		//Making as many groups as we can of N sentences from the texts
		for (let i = 0; i < texts.length - n; i++) {
			// Reset the group to an empty group
			group = {
				id: '',
				contains: [],
				text: '',
				source: [],
				index: 0,
			};
			// Making one group of N sentences
			for (let j = 0; j < n; j++) {
				group.id = uuid();
				group.contains.push(texts[i + j].id);
				group.text += texts[i + j].en[0];
				group.source.push(texts[i + j].source);
				group.source = group.source.filter(
					(item, index) => group.source.indexOf(item) === index
				);
			}
			// Once we've made a group we want to set its index and push it to the groups array
			group.index = index + i;
			groups.push(group);
		}
	}
	// When we can only make one group of N sentences or less...
	else {
		for (let i = 0; i < texts.length; i++) {
			group.id = uuid();
			group.contains.push(texts[i].id);
			group.text += texts[i].en[0];
			group.source.push(texts[i].source);
			group.source = group.source.filter(
				(item, index) => group.source.indexOf(item) === index
			);
		}
		// Once we've made a group we want to set its index and push it to the groups array
		group.index = index;
		groups.push(group);
		console.log('Size', group.contains.length);
	}
	// Set the index to the index + the number of groups we made
	redis.set('count:groupIndex', index + groups.length);
	return groups;
}

/** Used to split a text into N texts
 * @async This is an async function for redis calls
 * @param {string} id - the id of the parent text
 * @param {string} text - the english text to split
 * @param {string} he - the hebrew text to split
 * @param {string} source - the source of the text
 * @returns {Promise<SingleText[]>} - an array of SingleTexts
 */
export async function splitTexts(
	id: string,
	text: string,
	he: string,
	source: string
): Promise<SingleText[]> {
	let texts: SingleText[] = [];
	let index: number = 0;
	let en: string[] = [];
	let hebrew: string[] = [];
	// Not sure if this is enough to split everything up into sentences.
	try {
		en = text.split(/(?<=\.)\s/);
		hebrew = en;
	} catch {
		console.log(text);
		throw new Error(
			'Error splitting text, the provided text probably does not have a english translation.'
		);
	}

	// let hebrew = he.split(/(?<=\.)\s/);
	//For now we are not splting hebrew

	// Get the latest index from redis, and create it if it doesn't exist
	try {
		index = Number(await redis.get('count:splitIndex'));
	} catch {
		redis.set('count:splitIndex', 0);
	}

	// Create a SingleText Object for each sentence
	for (let i = 0; i < en.length; i++) {
		try {
			texts.push({
				id: uuid(),
				name: '',
				parent: id,
				en: [en[i]],
				he: [hebrew[i]],
				source: source,
				index: index + i,
			});
		} catch (e) {
			console.log(JSON.stringify(e));
		}
	}
	redis.set('count:splitIndex', index + texts.length);

	return texts;
}

/** Used to get the length of a given ref
 * @param {string} ref - the ref of the text to get the length of
 */
export async function getLength(ref: string): Promise<number> {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	const url = `https://www.sefaria.org/api/texts/${ref}?commentary=0`;
	const response = await fetch(url);
	const data = await response.json();
	const length = data.length;
	return Number(length);
}
