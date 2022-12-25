import { createClient as createSupa } from '@supabase/auth-helpers-sveltekit';
import { createClient as createRedis } from 'redis';
import { env } from '$env/dynamic/public';

// export const supabase = createSupa(
// 	env.PUBLIC_SUPABASE_URL,
// 	env.PUBLIC_SUPABASE_ANON_KEY
// );

export const redis = createRedis({
	url: env.PUBLIC_REDIS_URL,
});

export const resetIndices = async () => {
	try {
		await redis.set('count:originalIndex', 0);
		await redis.set('count:splitIndex', 0);
		await redis.set('count:groupIndex', 0);
	} catch (e) {
		throw new Error(JSON.stringify(e));
	}
};

export async function getKeys(command: string = 'group:'): Promise<any> {
	const keys = redis.keys(command);
	return keys;
}
