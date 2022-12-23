// function to fetch the text of a given ref
import type { OriginalText, SingleText } from './types';
import { v4 as uuid } from 'uuid';

export async function getText(
	ref: string,
	index: string
): Promise<OriginalText> {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	const url = `https://www.sefaria.org/api/texts/${ref}.${index}?context=0`;
	const response = await fetch(url);
	const data = await response.json();
	const text = data.text;
	const he = data.he;
	const heRef = data.heRef;
    
	const original: OriginalText = {
		id: uuid(),
		name: '',
		en: text,
		he: he,
		index: index,
		source: heRef,
		heSource: heRef,
	};

	return original;
}

function splitTexts(text: string, he: string, heRef: string): SingleText[] {
	let texts: SingleText[] = [];
	let en = text.split(/(?<=\.)\s/);
	let hebrew = he.split(/(?<=\.)\s/);
	let heRefSplit = heRef.split(/(?<=\.)\s/);

	for (let i = 0; i < en.length; i++) {
		texts.push({
			id: uuid(),
			name: '',
			parent: '',
			en: [en[i]],
			he: [hebrew[i]],
			source: heRefSplit[i],
			heSource: heRefSplit[i],
			index: i,
		});
	}

	return texts;
}
