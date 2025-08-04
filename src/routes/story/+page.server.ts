import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	// Get tractate, page, and amud from URL parameters, defaulting to Berakhot 3a
	const tractate = url.searchParams.get('tractate') || 'Berakhot';
	const page = url.searchParams.get('page') || '3';
	const amud = url.searchParams.get('amud') || 'a';

	return {
		tractate,
		page,
		amud
	};
};