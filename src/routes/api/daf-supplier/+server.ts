import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRACTATE_IDS } from '$lib/hebrewbooks';

// Map mesechta numbers to tractate names
const MESECHTA_MAP: Record<string, string> = {
	'1': 'Berakhot',
	'2': 'Shabbat',
	'3': 'Eruvin',
	'4': 'Pesachim',
	'5': 'Shekalim',
	'6': 'Yoma',
	'7': 'Sukkah',
	'8': 'Beitzah',
	'9': 'Rosh Hashanah',
	'10': 'Taanit',
	'11': 'Megillah',
	'12': 'Moed Katan',
	'13': 'Chagigah',
	'14': 'Yevamot',
	'15': 'Ketubot',
	'16': 'Nedarim',
	'17': 'Nazir',
	'18': 'Sotah',
	'19': 'Gittin',
	'20': 'Kiddushin',
	'21': 'Bava Kamma',
	'22': 'Bava Metzia',
	'23': 'Bava Batra',
	'24': 'Sanhedrin',
	'25': 'Makkot',
	'26': 'Shevuot',
	'27': 'Avodah Zarah',
	'28': 'Horayot',
	'29': 'Zevachim',
	'30': 'Menachot',
	'31': 'Chullin',
	'32': 'Bekhorot',
	'33': 'Arakhin',
	'34': 'Temurah',
	'35': 'Keritot',
	'36': 'Meilah',
	'37': 'Niddah'
};

export const GET: RequestHandler = async ({ url, platform, fetch }) => {
	const mesechta = url.searchParams.get('mesechta');
	const daf = url.searchParams.get('daf');
	const br = url.searchParams.get('br') === 'true';
	
	if (!mesechta || !daf) {
		return json({ error: 'Missing required parameters: mesechta, daf' }, { status: 400 });
	}
	
	const tractate = MESECHTA_MAP[mesechta];
	if (!tractate) {
		return json({ error: 'Invalid mesechta number' }, { status: 400 });
	}
	
	// Convert daf number to page and amud
	// daf-supplier uses sequential numbering: 3 = 2a, 4 = 2b, 5 = 3a, 6 = 3b
	const dafNum = parseInt(daf);
	const pageNum = Math.floor((dafNum + 1) / 2);
	const amud = dafNum % 2 === 1 ? 'a' : 'b';
	const dafDisplay = pageNum.toString();
	
	try {
		// Fetch from HebrewBooks API (internal endpoint)
		const hebrewBooksUrl = new URL('/api/hebrewbooks', url.origin);
		hebrewBooksUrl.searchParams.set('tractate', tractate);
		hebrewBooksUrl.searchParams.set('page', pageNum.toString());
		hebrewBooksUrl.searchParams.set('amud', amud);
		
		const response = await fetch(hebrewBooksUrl.toString());
		
		if (!response.ok) {
			const error = await response.json();
			return json({
				error: 'Failed to fetch from HebrewBooks',
				details: error
			}, { status: response.status });
		}
		
		const data = await response.json();
		
		// Transform to daf-supplier format
		const result = {
			mesechta: parseInt(mesechta),
			daf: dafNum,
			dafDisplay,
			amud,
			tractate,
			mainText: data.mainText || '',
			rashi: data.rashi || '',
			tosafot: data.tosafot || '',
			otherCommentaries: data.otherCommentaries || {},
			timestamp: Date.now(),
			source: 'hebrewbooks.org',
			debug: {
				browserAvailable: !!platform?.env?.BROWSER,
				extractionMethod: data.extractionMethod || 'unknown'
			}
		};
		
		// If br=true, convert newlines to <br> tags
		if (br) {
			result.mainText = result.mainText.replace(/\r?\n/g, '<br>');
			result.rashi = result.rashi.replace(/\r?\n/g, '<br>');
			result.tosafot = result.tosafot.replace(/\r?\n/g, '<br>');
		}
		
		return json(result);
		
	} catch (error) {
		console.error('Error in daf-supplier:', error);
		return json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};