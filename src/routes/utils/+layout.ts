import type { NavBarData } from '$lib/types';

export function load() {
	const navBarData: NavBarData[] = [
		{ index: 1, name: 'Home', link: '/utils' },
		{ index: 2, name: 'Store OGS Texts', link: '/utils/getGroupTexts' },
		{ index: 3, name: 'Get Completion', link: '/utils/createCompletion' },
		{ index: 4, name: 'Create Indices', link: '/utils/createIndex' },
		{ index: 5, name: 'Create Embeddings', link: '/utils/createEmbeds' },
		{ index: 6, name: 'API Tester', link: '/utils/useApi' },
	];
	return {
		items: navBarData,
	};
}
