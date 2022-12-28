//Types for Backend Code:

/** The response from the backend
 * @param {SingleText | GroupedText | OriginalText | any | null} data - The data returned from the backend
 * @param {ErrorResponse | null} error - The error returned from the backend
 */
export interface StandardResponse {
	data: PossibleData | null;
	error: ErrorResponse | null;
}

export type PossibleData = SingleText | GroupedText | OriginalText | any;

/** The Error Response in Standard Response
 * @param {code} code - The error code
 * @param {message} message - The error message
 * @param {details} details - The error details
 * @param {timestamp} timestamp - The timestamp of the error
 * @param {uuid} uuid - The uuid of the error
 */
export interface ErrorResponse {
	code?: number;
	message: string;
	details?: string;
	timestamp?: string;
	uuid?: string;
}
/**
 * @param {id} id - uuid of the text
 * @param {name} name - optional name of the sentence
 * @param {parent} parent - parent of the sentence
 * @param {en} en - The english sentence
 * @param {he} he - The hebrew sentence
 * @param {source} source - The named source of the sentence
 * @param {heSource} heSource - The named source of the sentence
 * @param {index} index - to keep track of order
 */
export interface SingleText {
	id: string;
	name?: string;
	parent: string;
	en: string[];
	he: string[];
	source: string;
	index: number;
}

/**
 * @param {string} id - uuid of the text
 * @param {string[]} contains - array of the ids of the sentences that make up this text
 * @param {string} text - The group of N sentences
 * @param {string[]} source - The named source of the sentence
 * @param {number} index - to keep track of order
 */
export interface GroupedText {
	id: string;
	contains: string[];
	text: string;
	source: string[];
	index: number;
}
/**
 * @param {string} id - uuid of the text
 * @param {contains} contains - array of the ids of the sentences that make up this text
 * @param {string} text - The group of N sentences
 * @param {string} source - The named source of the sentence
 * @param {number} index - to keep track of order
 */
export interface OriginalText {
	id: string;
	name?: string;
	en: string[];
	he: string[];
	index: number;
	source: string;
}

//Types for components:

/** Data for the NavBar Component
 * @param {number} index - to keep track of order
 * @param {string} name - name of the page
 * @param {string} link - link to the page
 */
export interface NavBarData {
	index: number;
	name: string;
	link: string;
}

//Types for API:

/** Body for the Search API
 * @param {string} text - the text to search for
 */
export interface BodyForSearch {
	text: string;
}

/** Body for the Completion API
 * @param {string} question - the original question
 * @param {string} context - the context we searched for
 * @param {string[]} sources - the sources of the context
 */
export interface BodyForCompletion {
	question: string;
	context: string;
	sources: string[];
}
