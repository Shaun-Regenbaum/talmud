import { createCompletion } from '$lib/openai';

export function load({}) {
	return {
		thing: 'hello',
	};
}

export const actions = {
	//@ts-ignore
	default: async (event) => {
		const debug = true;
		/**
		 * @type {string[]}
		 */
		let status = [];
		const data = await event.request.formData();
		const statement = data.get('statement');
		if (debug) status.push('Got Statement');
		status.push(statement);

		const completion = await createCompletion(statement, debug).catch((e) => {
			if (debug) console.log(e);
			status.push('Completion Failed');
			return status;
		});
		status.push('Created Completion');
		status.push(completion);
		return status;
	},
};
