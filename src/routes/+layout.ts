import type { NavBarData } from '$lib/types';

export function load() {
	const items: NavBarData[] = [
		{ index: 1, name: 'Chat', link: '/chat' },
		{ index: 2, name: 'Utilities', link: '/utils' },
		{ index: 3, name: 'Home', link: '/' },
		{ index: 4, name: 'Components', link: '/components' },
		{ index: 5, name: 'Q&A', link: '/question' },
	];
	return {
		items: items,
	};
}
