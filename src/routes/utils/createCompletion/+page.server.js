import { createCompletion } from '$lib/openai';
import { redis } from '$lib/db';

export function load({}) {
	return {
		thing: 'hello',
	};
}

export const actions = {
	//@ts-ignore
	default: async (event) => {
		let status = [];
		const data = await event.request.formData();
		const statement = data.get('statement');
		status.push('Got Statement');
		status.push(statement);
		try {
			await redis.connect();
			status.push('Connected to Redis');
		} catch (e) {
			if (!redis.isOpen) {
				status.push("Redis didn't connect");
				return status;
			}
		}

		try {
			let completion = await createCompletion(statement, true);
			status.push('Created Completion');
			status.push(completion);
			await redis.quit();
			status.push('Disconnected from Redis');
			return status;
		} catch (e) {
			await redis.quit();
			status.push('Completion Failed');
			return status;
		}
	},
};
