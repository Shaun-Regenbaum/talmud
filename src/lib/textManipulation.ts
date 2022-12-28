import type { GroupedText, SingleText, StandardResponse } from './types';
import { v4 as uuid } from 'uuid';
import { redis, supabase } from './db';

/** Used to group an array of texts into a single text
 * @async This is an async function for redis calls
 * @param {number} n - the number of the sentences to group
 * @param {SingleText[]} texts - the texts to group
 * @param {boolean} debug - whether or not to log debug messages
 * @returns {Promise<StandardResponse>} - the grouped text
 */
export async function groupTexts(
	n: number = 3,
	texts: SingleText[],
	debug: boolean = false
): Promise<GroupedText[]> {
	debug = false;
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
	if (debug) console.log('Setting Group Index.');
	try {
		index = Number(await redis.get('count:groupIndex'));
	} catch {
		redis.set('count:groupIndex', 0);
	}
	if (debug) console.log('Indices Set.');

	// If we have enough sentences to make at least two groups of N sentences
	if (debug) console.log(`Texts: ${texts.length}`);
	if (n < texts.length) {
		if (debug) console.log('Normal Case');
		//Making as many groups as we can of N sentences from the texts
		for (let i = 0; i <= texts.length - n; i++) {
			if (debug) console.log(`group:i: ${i}`);
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
				if (debug) console.log(`group:j: ${j}`);
				const newString = group.text + texts[i + j].en[0];
				group.id = uuid();
				group.contains.push(texts[i + j].id);
				group.text = newString;
				group.source.push(texts[i + j].source);
				group.source = group.source.filter(
					(item, index) => group.source.indexOf(item) === index
				);
			}
			// Once we've made a group we want to set its index and push it to the groups array
			group.index = index + i;
			groups.push(group);
			const supabaseResponse = await supabase.from('groupTexts').upsert([
				{
					id: group.id,
					contains: group.contains,
					text: group.text,
					source: group.source,
					index: group.index,
				},
			]);
			if (debug) console.log('Stored in supabase', supabaseResponse);
		}
	}
	// When we can only make one group of N sentences or less...
	else {
		if (debug) console.log('Alternative Case');
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
		if (debug) console.log('Size:' + groups.length);
	}
	// Set the index to the index + the number of groups we made
	redis.set('count:groupIndex', index + groups.length);
	return groups;
}

/** Used to split a text into N texts
 * @async This is an async function for redis calls
 * @param {string} id - the id of the parent text
 * @param {string} text - the english text to split
 * @param {string} source - the source of the text
 * @param {boolean} debug - whether or not to log debug messages
 * @returns {Promise<SingleText[]>} - an array of SingleTexts
 */
export async function splitTexts(
	id: string,
	text: string,
	source: string,
	debug: boolean = false
): Promise<SingleText[]> {
	let texts: SingleText[] = [];
	let index: number = 0;
	let en: string[] = [];
	let hebrew: string[] = [];
	// Not sure if this is enough to split everything up into sentences.
	try {
		if (debug) console.log('Splitting Texts');
		en = text.split(/(?<=\.)\s/);
		hebrew = en;
		if (debug) console.log('Texts Split');
	} catch {
		console.log(
			"Error splitting text, the provided text probably doesn't have a english translation."
		);
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
		if (debug) console.log(`Single:i: ${i}`);
		const newId = uuid();
		const newEn = en[i];
		const newHe = hebrew[i];
		const newSource = source;
		const newIndex = index + i;
		try {
			texts.push({
				id: newId,
				name: '',
				parent: id,
				en: [newEn],
				he: [newHe],
				source: source,
				index: newIndex,
			});

			try {
				const supabaseResponse = await supabase.from('splitTexts').upsert([
					{
						id: newId,
						name: '',
						parent: id,
						en: newEn,
						he: newHe,
						source: newSource,
						index: newIndex,
					},
				]);
				if (debug) console.log('Stored in supabase', supabaseResponse);
			} catch (e) {
				console.log('SupabaseFailed: ', JSON.stringify(e));
			}
		} catch (e) {
			console.log(JSON.stringify(e));
		}
	}
	redis.set('count:splitIndex', index + texts.length);

	return texts;
}

/** Used to get the length of a given ref
 * @param {string} ref - the ref of the text to get the length of
 * @param {boolean} debug - whether or not to log debug messages
 */
export async function getLength(
	ref: string,
	debug: boolean = false
): Promise<number> {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	if (debug) console.log(`Ref: ${ref}`);
	const url = `https://www.sefaria.org/api/texts/${ref}?commentary=0`;
	const response = await fetch(url);
	const data = await response.json();
	const length = data.length;
	if (debug) console.log(`Length: ${length}`);
	return Number(length);
}
