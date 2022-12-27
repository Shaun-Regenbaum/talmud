import type { NavBarData } from '$lib/types';

export function load() {
	const navBarData: NavBarData[] = [
		{ index: 1, name: 'Store OGS Texts', link: '/utils/getGroupTexts' },
		{ index: 2, name: 'Get Completion', link: '/utils/createCompletion' },
	];
	return {
		navBar: navBarData,
	};
}
