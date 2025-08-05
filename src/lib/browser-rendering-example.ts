/**
 * Cloudflare Browser Rendering API - Complete Usage Examples
 * 
 * This file demonstrates the correct way to use the Browser Rendering API
 * in Cloudflare Workers with proper error handling and resource cleanup.
 */

import puppeteer from '@cloudflare/puppeteer';
import type { Browser, Page } from '@cloudflare/puppeteer';

/**
 * Example 1: Basic Screenshot
 * Takes a screenshot of a webpage
 */
export async function takeScreenshot(
	browserBinding: Fetcher, 
	url: string
): Promise<Buffer> {
	let browser: Browser | null = null;
	let page: Page | null = null;
	
	try {
		// 1. Launch browser using Puppeteer with the BROWSER binding
		browser = await puppeteer.launch(browserBinding);
		
		// 2. Create a new page
		page = await browser.newPage();
		
		// 3. Set viewport and user agent
		await page.setViewport({ width: 1280, height: 800 });
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
		
		// 4. Navigate to URL
		await page.goto(url, { 
			waitUntil: 'networkidle0', 
			timeout: 30000 
		});
		
		// 5. Take screenshot
		const screenshot = await page.screenshot({
			type: 'png',
			fullPage: true
		});
		
		return screenshot as Buffer;
		
	} finally {
		// 6. Always clean up resources
		if (page) await page.close();
		if (browser) await browser.close();
	}
}

/**
 * Example 2: Extract Text Content
 * Scrapes text content from a webpage with proper selectors
 */
export async function extractTextContent(
	browserBinding: Fetcher,
	url: string,
	selectors: string[] = ['body']
): Promise<{ [selector: string]: string }> {
	let browser: Browser | null = null;
	let page: Page | null = null;
	
	try {
		browser = await puppeteer.launch(browserBinding);
		page = await browser.newPage();
		
		// Set reasonable viewport
		await page.setViewport({ width: 1280, height: 800 });
		
		// Navigate to page
		await page.goto(url, { 
			waitUntil: 'networkidle0', 
			timeout: 30000 
		});
		
		// Wait for content to load
		await page.waitForTimeout(2000);
		
		// Extract text using provided selectors
		const results = await page.evaluate((selectorList: string[]) => {
			const extractedData: { [selector: string]: string } = {};
			
			selectorList.forEach(selector => {
				const elements = document.querySelectorAll(selector);
				const text = Array.from(elements)
					.map(el => el.textContent || el.innerText || '')
					.join('\n')
					.trim();
				extractedData[selector] = text;
			});
			
			return extractedData;
		}, selectors);
		
		return results;
		
	} finally {
		if (page) await page.close();
		if (browser) await browser.close();
	}
}

/**
 * Example 3: Advanced Scraping with Wait Conditions
 * Demonstrates waiting for specific elements and handling dynamic content
 */
export async function advancedScraping(
	browserBinding: Fetcher,
	url: string,
	options: {
		waitForSelector?: string;
		waitForTimeout?: number;
		extractors?: { [key: string]: string };
	} = {}
): Promise<{ [key: string]: string }> {
	let browser: Browser | null = null;
	let page: Page | null = null;
	
	const {
		waitForSelector,
		waitForTimeout = 5000,
		extractors = { body: 'body' }
	} = options;
	
	try {
		browser = await puppeteer.launch(browserBinding);
		page = await browser.newPage();
		
		// Configure page
		await page.setViewport({ width: 1280, height: 800 });
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
		
		// Navigate and wait for initial load
		await page.goto(url, { 
			waitUntil: 'networkidle0', 
			timeout: 30000 
		});
		
		// Wait for specific selector if provided
		if (waitForSelector) {
			await page.waitForSelector(waitForSelector, { timeout: waitForTimeout });
		}
		
		// Additional wait for dynamic content
		await page.waitForTimeout(waitForTimeout);
		
		// Extract data using multiple selectors
		const results = await page.evaluate((extractorMap: { [key: string]: string }) => {
			const data: { [key: string]: string } = {};
			
			Object.entries(extractorMap).forEach(([key, selector]) => {
				const elements = document.querySelectorAll(selector);
				data[key] = Array.from(elements)
					.map(el => el.textContent || el.innerText || '')
					.join('\n')
					.trim();
			});
			
			// Add metadata
			data._url = window.location.href;
			data._title = document.title;
			data._timestamp = new Date().toISOString();
			
			return data;
		}, extractors);
		
		return results;
		
	} finally {
		if (page) await page.close();
		if (browser) await browser.close();
	}
}

/**
 * Example 4: Error Handling Patterns
 * Demonstrates proper error handling for common Browser Rendering issues
 */
export async function robustScraping(
	browserBinding: Fetcher,
	url: string
): Promise<{ success: boolean; data?: any; error?: string }> {
	let browser: Browser | null = null;
	let page: Page | null = null;
	
	try {
		// Launch browser with error handling
		try {
			browser = await puppeteer.launch(browserBinding);
		} catch (launchError) {
			return {
				success: false,
				error: `Failed to launch browser: ${launchError instanceof Error ? launchError.message : 'Unknown error'}`
			};
		}
		
		// Create page
		try {
			page = await browser.newPage();
		} catch (pageError) {
			return {
				success: false,
				error: `Failed to create page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`
			};
		}
		
		// Set up page with error handling
		try {
			await page.setViewport({ width: 1280, height: 800 });
			await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
		} catch (setupError) {
			console.warn('Page setup warning:', setupError);
			// Continue anyway as these are not critical
		}
		
		// Navigate with retry logic
		let navigationSuccess = false;
		let lastError: Error | null = null;
		
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				await page.goto(url, { 
					waitUntil: 'networkidle0', 
					timeout: 20000 
				});
				navigationSuccess = true;
				break;
			} catch (navError) {
				lastError = navError instanceof Error ? navError : new Error('Navigation failed');
				console.warn(`Navigation attempt ${attempt} failed:`, lastError.message);
				
				if (attempt < 3) {
					await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
				}
			}
		}
		
		if (!navigationSuccess) {
			return {
				success: false,
				error: `Failed to navigate after 3 attempts: ${lastError?.message || 'Unknown error'}`
			};
		}
		
		// Extract data with fallbacks
		const data = await page.evaluate(() => {
			// Primary extraction method
			try {
				const mainContent = document.querySelector('main, .content, #content, .main');
				if (mainContent) {
					return {
						content: mainContent.textContent || mainContent.innerText || '',
						method: 'main-content-selector'
					};
				}
			} catch (e) {
				console.warn('Main content extraction failed:', e);
			}
			
			// Fallback to body
			try {
				const bodyText = document.body.textContent || document.body.innerText || '';
				return {
					content: bodyText.substring(0, 5000), // Limit size
					method: 'body-fallback'
				};
			} catch (e) {
				console.warn('Body extraction failed:', e);
			}
			
			// Last resort
			return {
				content: document.documentElement.textContent?.substring(0, 1000) || '',
				method: 'document-fallback'
			};
		});
		
		return {
			success: true,
			data: {
				...data,
				url,
				extractedAt: new Date().toISOString()
			}
		};
		
	} catch (generalError) {
		return {
			success: false,
			error: `General scraping error: ${generalError instanceof Error ? generalError.message : 'Unknown error'}`
		};
	} finally {
		// Always clean up, with individual error handling
		if (page) {
			try {
				await page.close();
			} catch (pageCloseError) {
				console.warn('Error closing page:', pageCloseError);
			}
		}
		
		if (browser) {
			try {
				await browser.close();
			} catch (browserCloseError) {
				console.warn('Error closing browser:', browserCloseError);
			}
		}
	}
}

/**
 * Common Browser Rendering Errors and Solutions
 */
export const COMMON_ERRORS = {
	'The receiver is not an RPC object': {
		cause: 'Trying to call methods directly on the browser binding instead of using Puppeteer',
		solution: 'Use puppeteer.launch(browserBinding) first, then call methods on the returned browser'
	},
	'Target closed': {
		cause: 'Page or browser was closed while operations were still running',
		solution: 'Ensure proper async/await usage and check if page/browser is still open before operations'
	},
	'Navigation timeout': {
		cause: 'Page took too long to load or network issues',
		solution: 'Increase timeout, use different waitUntil conditions, or implement retry logic'
	},
	'Protocol error': {
		cause: 'Communication issues with the browser instance',
		solution: 'Implement proper error handling and cleanup, check for resource limits'
	}
};

/**
 * Performance Tips and Best Practices
 */
export const PERFORMANCE_TIPS = {
	browserManagement: {
		reuseSessions: 'Use browser.disconnect() instead of browser.close() for session reuse',
		resourceCleanup: 'Always close pages and browsers in finally blocks',
		concurrency: 'Limit concurrent browser instances to avoid resource exhaustion'
	},
	pageOptimization: {
		viewport: 'Set appropriate viewport size for your use case',
		userAgent: 'Use realistic user agent strings to avoid blocking',
		waitConditions: 'Choose appropriate waitUntil conditions (networkidle0, domcontentloaded, etc.)'
	},
	dataExtraction: {
		selectors: 'Use specific CSS selectors for better performance',
		textLimits: 'Limit extracted text size to avoid memory issues',
		evaluation: 'Keep page.evaluate() functions simple and focused'
	}
};

/**
 * Resource Limits and Constraints
 */
export const CLOUDFLARE_LIMITS = {
	cpuTime: '10ms for free plan, 50ms for paid (per request)',
	memory: '128MB maximum',
	timeout: '30 seconds maximum execution time',
	concurrentSessions: 'Limited by CPU and memory constraints',
	responseSize: '25MB maximum response size'
};