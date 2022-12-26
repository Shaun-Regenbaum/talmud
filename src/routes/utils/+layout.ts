import type { NavBarData } from '$lib/types';

export function load() {
	const navBarData: NavBarData[] = [
		{ index: 1, name: 'Create Embeddings', link: '/utils/createEmbeds' },
		{ index: 2, name: 'Create Searchable Index', link: '/utils/createIndex' },
		{ index: 3, name: 'Search Index', link: '/utils/searchIndex' },
		{ index: 4, name: 'Get Available Index', link: '/utils/getIndex' },
		{ index: 5, name: 'Store Sefaria Texts', link: '/utils/storeText' },
		{ index: 6, name: 'Get Sources from Question', link: '/utils/getSources' },
		{ index: 7, name: 'Get Completion', link: '/utils/createCompletion' },
	];
	return {
		navBar: navBarData,
	};
}
