import type { GroupedText, SingleText } from './types';

// Take in 5 SingleTexts and return a GroupedText
export function groupTexts(
	id: string,
	text1: SingleText,
	text2: SingleText,
	text3: SingleText,
	text4: SingleText,
	text5: SingleText
): GroupedText {
	// remove duplications fropm the source
	let source = [
		text1.source,
		text2.source,
		text3.source,
		text4.source,
		text5.source,
	];
	source = source.filter((item, index) => source.indexOf(item) === index);

	return {
		id: id,
		contains: [text1.id, text2.id, text3.id, text4.id, text5.id],
		text: text1.en[0] + text2.en[0] + text3.en[0] + text4.en[0] + text5.en[0],
		source: source,
		index: text1.index,
	};
}
