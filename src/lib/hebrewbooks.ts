import sanitizeHtml from 'sanitize-html';
import { parse } from 'node-html-parser';
import fs from 'fs';

const options = {
	lowerCaseTagName: false, // convert tag name to lower case (hurts performance heavily)
	comment: false, // retrieve comments (hurts performance slightly)
	voidTag: {
		tags: [
			'area',
			'base',
			'br',
			'col',
			'embed',
			'hr',
			'img',
			'input',
			'link',
			'meta',
			'param',
			'source',
			'track',
			'wbr',
		], // optional and case insensitive, default value is ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']
		addClosingSlash: true, // optional, default false. void tag serialisation, add a final slash <br/>
	},
	blockTextElements: {
		script: false, // keep text content when parsing
		noscript: false, // keep text content when parsing
		style: false, // keep text content when parsing
		pre: false, // keep text content when parsing
	},
};

/** We are using this to scrape the html from hebrewbooks.org
 * @param {string} masechet The masechet we are scraping
 * @param {number} daf The daf we are scraping
 * @param {number} page The page we are scraping, a=1 b=2
 * @returns {string, string, string} The html of the page
 */
export async function getHtml(
	masechet: string,
	daf: number,
	page: number
): Promise<any> {
	const secondPage = page === 2 ? 'b' : '';
	const constructedUrl = `https://hebrewbooks.org/shas.aspx?mesechta=${convertMasechetToNumber(
		masechet
	)}&daf=${daf}${secondPage}&format=text`;
	// fetch the html from the url
	const response = await fetch(constructedUrl);
	console.log(await response.clone().text());
	let body = parse(await response.clone().text(), options);
	const shastext2 = body.querySelector('.shastext2')?.toString();
	const shastext3 = body.querySelector('.shastext3')?.toString();
	const shastext4 = body.querySelector('.shastext4')?.toString();
	// console.log(shastext3);

	const clean = sanitizeHtml(await response.text(), {
		allowedTags: ['div', 'span', 'strong', 'fieldset'],
		disallowedTagsMode: 'discard',
		allowedAttributes: false,
		allowedClasses: {
			div: ['shastext1', 'shastext2', 'shastext3', 'shastext4'],
		}, // Lots of these won't come up by default because we don't allow them
		selfClosing: [
			'img',
			'br',
			'hr',
			'area',
			'base',
			'basefont',
			'input',
			'link',
			'meta',
		],
		// URL schemes we permit
		allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'tel'],
		allowedSchemesByTag: {},
		allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
		allowProtocolRelative: true,
		enforceHtmlBoundary: true,
	});
	// create new  file with the html
	fs.writeFileSync('src/lib/test.html', clean);
	const regex1 = new RegExp(
		/<div class="shastext2">((?!<\/div>)[\s\S])*<\/div>/g
	);
	const regex2 = new RegExp(
		/<div class="shastext3">((?!<\/div>)[\s\S])*<\/div>/g
	);
	const regex3 = new RegExp(
		/<div class="shastext4">((?!<\/fieldset>)[\s\S])*<\/fieldset>/g
	);
	const main = clean.match(regex1);
	const rashi = clean.match(regex2);
	const tosafot = clean.match(regex3);

	// return the html
	return {
		main: shastext2,
		rashi: shastext3,
		tosafot: shastext4,
	};
}

function convertMasechetToNumber(masechet: string): number {
	const masechtot = {
		Brachot: 1,
		Shabbat: 2,
		Eruvin: 3,
		Pesachim: 4,
		Shekalim: 5,
		Yoma: 6,
		Sukkah: 7,
		Beitzah: 8,
		RoshHashana: 9,
		Taanit: 10,
		Megillah: 11,
		MoedKatan: 12,
		Chagigah: 13,
		Yevamos: 14,
		Kesuvos: 15,
		Nedarim: 16,
		Nazir: 17,
		Gittin: 18,
		Kiddushin: 19,
		BavaKamma: 20,
		BavaMetzia: 21,
		BavaBasra: 22,
		Sanhedrin: 23,
		Makot: 24,
		Shevuot: 25,
		AvodahZarah: 26,
		Horayot: 27,
		Zevachim: 28,
		Menachot: 29,
		Chullin: 30,
		Bechorot: 31,
		Arachin: 32,
		Temurah: 33,
		Kerisot: 34,
		Meilah: 35,
		Tamid: 36,
		Middot: 37,
		Niddah: 38,
	};
	try {
		//@ts-ignore because we deal with the error of not finding the masechet
		return masechtot[masechet];
	} catch {
		return 1;
	}
}
