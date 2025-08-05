import { marked } from 'marked';

/**
 * Render markdown to HTML with Tailwind classes
 */
export function renderMarkdown(markdown: string): string {
	// Handle the case where markdown might be undefined or null
	if (!markdown || typeof markdown !== 'string') {
		console.error('Invalid markdown input:', markdown);
		return '';
	}
	
	try {
		// Configure marked options
		marked.setOptions({
			breaks: true, // Convert line breaks to <br>
			gfm: true, // GitHub Flavored Markdown
		});
		
		// Parse markdown to HTML
		const html = marked.parse(markdown);
		
		// Since marked v4+, parse is sync by default
		return html as string;
	} catch (error) {
		console.error('Error parsing markdown:', error);
		return markdown; // Return original text as fallback
	}
}