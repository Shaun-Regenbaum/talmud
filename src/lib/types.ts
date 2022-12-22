export interface SingleText {
	id: string;
	name: string;
	parent: string;
	en: string[];
	he: string[];
	source: string;
	heSource: string;
	index: number;
}

export interface GroupedText {
	id: string;
	contains: string[];
	text: string;
	source: string[];
	index: number;
}
