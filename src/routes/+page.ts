import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	// Get parameters from URL
	const tractate = url.searchParams.get('tractate') || 'Berakhot';
	const page = url.searchParams.get('page') || '2';
	const amud = url.searchParams.get('amud') || 'a';
	
	return {
		tractate,
		page,
		amud
	};
};