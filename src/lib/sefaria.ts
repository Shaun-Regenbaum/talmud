// function to fetch the text of a given ref
import type { OriginalText, SingleText } from './types';
import { v4 as uuid } from 'uuid';
import { redis } from './db';

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
