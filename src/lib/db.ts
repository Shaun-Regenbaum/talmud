import { createClient as createSupa } from '@supabase/auth-helpers-sveltekit';
import { createClient as createRedis } from 'redis';
import { env } from '$env/dynamic/public';

export const supabase = createSupa(
	//@ts-ignore
	env.PUBLIC_SUPABASE_URL,
	env.PUBLIC_SUPABASE_ANON_KEY
);

export const redis = createRedis({
	url: env.PUBLIC_REDIS_URL,
});
