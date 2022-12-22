// function to fetch the text of a given ref
import type { SingleText } from './types';

export async function getText(
	ref: string,
	index: string
): Promise<SingleText[]> {
	ref = ref.replace(' ', '_');
	ref = ref.replace(',', '%2C');
	const url = `https://www.sefaria.org/api/texts/${ref}.${index}?context=0`;
	const response = await fetch(url);
	const data = await response.json();
	const text = data.text;
	const he = data.he;
	const heRef = data.heRef;
	return data;
}
