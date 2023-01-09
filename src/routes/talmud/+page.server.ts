import { getHtml } from '$lib/hebrewbooks';
import type { DafData, DafSelect } from '$lib/types';

export async function load(): Promise<DafData> {
	const masechet = 'Brachot';
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
	if (masechet in masechtot) {
		const { main, rashi, tosafot } = await getHtml(masechet, 16, 2);
		return {
			main: main,
			rashi: rashi,
			tosafot: tosafot,
			amud: 'b',
		} satisfies DafData;
	} else {
		return {
			main: 'Invalid Masechet',
			rashi: 'Invalid Masechet',
			tosafot: 'Invalid Masechet',
		} satisfies DafData;
	}
}

export const actions = {
	default: async ({ request }) => {
		const data: DafSelect = await request.formData();
		const masechet = data.tractate;
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
		if (masechet in masechtot) {
			const { main, rashi, tosafot } = await getHtml(masechet, 16, 2);
			return {
				main: main,
				rashi: rashi,
				tosafot: tosafot,
				amud: 'b',
			} satisfies DafData;
		} else {
			return {
				main: 'Invalid Masechet',
				rashi: 'Invalid Masechet',
				tosafot: 'Invalid Masechet',
			} satisfies DafData;
		}
	},
};
