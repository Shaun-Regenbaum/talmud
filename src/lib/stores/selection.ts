import { writable } from 'svelte/store';

export interface DafLocation {
	tractate: string;
	daf: string;
}

export interface SentenceSelection {
	daf: DafLocation;
	index: number;
}

export interface CommentarySelection {
	daf: DafLocation;
	index: number;
	text: 'rashi' | 'tosafot';
}

// Selection stores
export const selectedSentence = writable<SentenceSelection>({ 
	daf: { tractate: '', daf: '' }, 
	index: -1 
});

export const selectedCommentaries = writable<CommentarySelection[]>([]);

// Helper functions
export function selectSentence(daf: DafLocation, index: number) {
	selectedSentence.set({ daf, index });
	console.log('Selected sentence:', { daf, index });
}

export function selectCommentary(daf: DafLocation, index: number, text: 'rashi' | 'tosafot') {
	selectedCommentaries.update(commentaries => {
		// Remove existing selection of same type for this daf
		const filtered = commentaries.filter(c => 
			!(c.daf.tractate === daf.tractate && c.daf.daf === daf.daf && c.text === text)
		);
		// Add new selection
		return [...filtered, { daf, index, text }];
	});
	console.log('Selected commentary:', { daf, index, text });
}

export function clearSelections() {
	selectedSentence.set({ daf: { tractate: '', daf: '' }, index: -1 });
	selectedCommentaries.set([]);
}

export function dafEquals(daf1: DafLocation, daf2: DafLocation): boolean {
	return daf1.tractate === daf2.tractate && daf1.daf === daf2.daf;
}