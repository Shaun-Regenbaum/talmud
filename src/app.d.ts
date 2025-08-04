// See https://svelte.dev/docs/kit/types#app
// for information about these interfaces

// Cloudflare Workers global bindings
declare global {
	const HEBREWBOOKS_KV: KVNamespace;
	const STORIES_KV: KVNamespace;
	const SUMMARIES_KV: KVNamespace;
	const BROWSER: Browser;
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface Platform {
			env: {
				HEBREWBOOKS_KV: KVNamespace;
				STORIES_KV: KVNamespace;
				SUMMARIES_KV: KVNamespace;
				BROWSER: Browser;
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};