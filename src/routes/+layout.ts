import type { NavBarData } from '$lib/types';

export function load() {
	const items: NavBarData[] = [
		{ index: 1, name: 'Utilities', link: '/utils' },
		{ index: 2, name: 'Home', link: '/' },
		{ index: 3, name: 'Q&A', link: '/torahgpt' },
	];
	return {
		items: items,
	};
}
