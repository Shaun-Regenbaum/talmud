import type { NavBarData } from '$lib/types';

export function load() {
	const navBarData: NavBarData[] = [
		{ index: 1, name: 'Store OGS Texts', link: '/utils/getGroupTexts' },
		{ index: 2, name: 'Get Completion', link: '/utils/createCompletion' },
		{ index: 3, name: 'Create Indices', link: '/utils/createIndex' },
		{ index: 4, name: 'Create Embeddings', link: '/utils/createEmbeds' },
		{ index: 5, name: 'API Tester', link: '/utils/useApi' },
	];
	return {
		navBar: navBarData,
	};
}
