import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { diffHebrewTexts, calculateDiffStats, type DiffResult } from '$lib/utils/hebrew-diff-v2';

interface MergeResult {
  merged: string;
  diffs: DiffResult[];
  issues: any;
  stats: {
    agreements: number;
    additions: number;
    removals: number;
    totalChars: number;
  };
}


function processHebrew(text: string): string {
  if (!text) return '';
  
  return text
    // Remove <script> and <style> blocks entirely (including content)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove all HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove JavaScript-like content (functions, variables, etc.)
    .replace(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
    .replace(/var\s+\w+\s*[=;][\s\S]*?;/g, '')
    .replace(/if\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
    .replace(/window\.\w+[\s\S]*?;/g, '')
    .replace(/document\.\w+[\s\S]*?;/g, '')
    // Remove CSS-like content
    .replace(/\{[\s\S]*?\}/g, '')
    .replace(/#[\w-]+\s*\{[\s\S]*?\}/g, '')
    .replace(/\.[\w-]+\s*\{[\s\S]*?\}/g, '')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/www\.[^\s]+/g, '')
    // Remove email addresses
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '')
    // Remove phone numbers
    .replace(/\(\d{2,3}\)\s*\d{3}-\d{4}/g, '')
    .replace(/\d{3}-\d{3}-\d{4}/g, '')
    // Remove copyright and metadata
    .replace(/©\d{4}.*$/gm, '')
    .replace(/Copyright.*$/gm, '')
    // Remove HTML entities and Unicode issues
    .replace(/&[a-zA-Z]+;/g, '')
    .replace(/&#\d+;/g, '')
    // Clean up Hebrew-specific issues
    .replaceAll("–", "")
    .replaceAll("׳", "'")
    // Remove excessive whitespace and newlines
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    // Remove English text blocks (basic heuristic)
    .replace(/\b[a-zA-Z]{10,}\b/g, '')
    .trim();
}

function diffsToString(diffs: DiffResult[]): string {
  // Since we're using HebrewBooks as source of truth, 
  // just return the agreements and HebrewBooks-only content
  let merged = "";
  
  diffs.forEach((part) => {
    if (!part.removed && !part.added) {
      // Agreement between sources
      merged += part.value;
    } else if (part.added) {
      // HebrewBooks-only content (since HebrewBooks is first parameter in diff)
      merged += part.value;
    }
    // Skip removed content (Sefaria-only content)
  });
  
  return merged;
}

async function fetchSefariaCommentary(tractate: string, daf: string, commentaryType: 'rashi' | 'tosafot') {
  // The daf parameter already includes the amud (e.g., "2a" or "2b")
  const sefariaRef = daf;
  
  const commentaryName = commentaryType === 'rashi' ? 'Rashi' : 'Tosafot';
  
  try {
    // Use the links API to get detailed commentary connections
    const mainRef = `${tractate}.${sefariaRef}`;
    const linksUrl = `https://www.sefaria.org/api/links/${mainRef}`;
    
    console.log(`Fetching links for ${mainRef} to find all ${commentaryName} segments`);
    
    const linksResponse = await fetch(linksUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TalmudMerged/1.0)',
      }
    });
    
    if (!linksResponse.ok) {
      console.log(`Links API error:`, linksResponse.status);
      return { hebrew: [], english: [], linking: {} };
    }
    
    const allLinks = await linksResponse.json();
    
    // Filter for the specific commentary type
    const commentaryLinks = allLinks.filter((link: any) => 
      link.index_title === `${commentaryName} on ${tractate}` && 
      link.type === 'commentary'
    );
    
    console.log(`Found ${commentaryLinks.length} ${commentaryName} links for ${mainRef}`);
    
    // Build linking information and collect segments
    const linkingInfo: Record<string, any> = {};
    const allHebrew: string[] = [];
    const allEnglish: string[] = [];
    
    // Group links by their base reference (without sub-parts)
    const groupedLinks = new Map<string, any[]>();
    
    commentaryLinks.forEach((link: any) => {
      // For refs like "Rashi on Berakhot 2a:1:1", extract "Rashi on Berakhot 2a:1"
      const refParts = link.ref.split(':');
      const baseCommentRef = refParts.slice(0, -1).join(':');
      
      if (!groupedLinks.has(baseCommentRef)) {
        groupedLinks.set(baseCommentRef, []);
      }
      groupedLinks.get(baseCommentRef)!.push(link);
    });
    
    // Process each group as a single commentary segment
    let segmentIndex = 0;
    groupedLinks.forEach((links, baseCommentRef) => {
      // Combine Hebrew and English text from all sub-parts
      const hebrewTexts = links.map(l => l.he).filter(Boolean);
      const englishTexts = links.map(l => l.text).filter(Boolean);
      
      if (hebrewTexts.length > 0) {
        allHebrew.push(hebrewTexts.join(' '));
      }
      if (englishTexts.length > 0) {
        allEnglish.push(englishTexts.join(' '));
      }
      
      // Use the anchorRef from the first link for mapping
      const anchorRef = links[0].anchorRef;
      if (anchorRef) {
        // Parse the sentence index from anchorRef (e.g., "Berakhot 2a:1" -> 1)
        const parts = anchorRef.split(':');
        if (parts.length >= 2) {
          const sentenceIndex = parseInt(parts[1]) - 1; // Convert to 0-based
          const baseRef = parts[0]; // e.g., "Berakhot 2a"
          
          if (!linkingInfo[baseRef]) {
            linkingInfo[baseRef] = {};
          }
          if (!linkingInfo[baseRef][sentenceIndex]) {
            linkingInfo[baseRef][sentenceIndex] = [];
          }
          linkingInfo[baseRef][sentenceIndex].push(segmentIndex);
          
          console.log(`🔗 ${commentaryName} segment ${segmentIndex} (${links.length} parts) links to ${baseRef} sentence ${sentenceIndex}`);
        }
      }
      
      segmentIndex++;
    });
    
    console.log(`Total ${commentaryName} segments: ${allHebrew.length} Hebrew, ${allEnglish.length} English`);
    
    return {
      hebrew: allHebrew,
      english: allEnglish,
      linking: linkingInfo
    };
    
  } catch (error) {
    console.error(`Failed to fetch ${commentaryName} commentary:`, error);
    return { hebrew: [], english: [], linking: {} };
  }
}

async function fetchSefaria(tractate: string, daf: string, type: 'main' | 'rashi' | 'tosafot') {
  if (type === 'rashi' || type === 'tosafot') {
    return fetchSefariaCommentary(tractate, daf, type);
  }
  
  // The daf parameter already includes the amud (e.g., "2a" or "2b")
  const sefariaRef = daf;
  
  console.log(`Fetching Sefaria main text for ${tractate} ${sefariaRef}`);
  
  const sefariaUrl = `https://www.sefaria.org/api/texts/${tractate}.${sefariaRef}?vhe=William_Davidson_Edition_-_Aramaic`;
  
  try {
    console.log(`Fetching from Sefaria: ${sefariaUrl}`);
    const response = await fetch(sefariaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TalmudMerged/1.0)',
      }
    });
    
    if (!response.ok) {
      console.log(`Sefaria API error for main text:`, response.status);
      return { hebrew: [], english: [] };
    }
    
    const data = await response.json();
    console.log(`Sefaria main text response:`, {
      ref: data.ref,
      heLength: data.he?.length,
      textLength: data.text?.length,
      heTitle: data.heTitle
    });
    
    // Handle both array and nested array structures
    let hebrewText = [];
    if (data.he) {
      if (Array.isArray(data.he) && data.he.length > 0) {
        // Check if it's a simple array (like main text)
        if (typeof data.he[0] === 'string') {
          hebrewText = data.he.filter((str: any) => str && typeof str === 'string' && str.length > 0);
        } 
        // Check if it's an array of arrays (like commentary with daf structure)
        else if (Array.isArray(data.he[0])) {
          // For commentary, flatten all levels and filter out empty values
          hebrewText = data.he
            .flat(2) // Flatten twice to handle [daf][line][subsection] structure
            .filter((str: any) => str && typeof str === 'string' && str.length > 0);
        }
      }
    }
    
    console.log(`Processed main text: ${hebrewText.length} segments`);
    
    return {
      hebrew: hebrewText,
      english: data.text || []
    };
  } catch (error) {
    console.error(`Failed to fetch Sefaria main text:`, error);
    return { hebrew: [], english: [] };
  }
}

function filterLinkedCommentarySegments(
  commentarySegments: string[], 
  linking: Record<string, any>
): string[] {
  if (!commentarySegments || commentarySegments.length === 0) {
    return [];
  }
  
  // Build a map: commentaryIndex -> mainTextSegmentIndex (for ordering)
  const commentaryToMainTextOrder: Record<number, number> = {};
  Object.values(linking).forEach((sentenceLinks: any) => {
    if (typeof sentenceLinks === 'object') {
      Object.entries(sentenceLinks).forEach(([mainSegmentIndex, commentaryIndexes]: [string, any]) => {
        if (Array.isArray(commentaryIndexes)) {
          commentaryIndexes.forEach(commentaryIndex => {
            // Use the first (earliest) main text reference for ordering
            if (!(commentaryIndex in commentaryToMainTextOrder)) {
              commentaryToMainTextOrder[commentaryIndex] = parseInt(mainSegmentIndex);
            }
          });
        }
      });
    }
  });
  
  const linkedIndexes = Object.keys(commentaryToMainTextOrder).map(k => parseInt(k));
  console.log(`🔗 Filtering commentary: ${commentarySegments.length} total → ${linkedIndexes.length} linked`);
  
  // Create ordered array of linked segments
  const linkedSegmentsWithOrder = linkedIndexes
    .map(commentaryIndex => {
      const segment = commentarySegments[commentaryIndex];
      if (segment && segment.trim().length > 5) {
        return {
          segment,
          mainTextOrder: commentaryToMainTextOrder[commentaryIndex]
        };
      }
      return null;
    })
    .filter(item => item !== null);
  
  // Sort by main text order
  linkedSegmentsWithOrder.sort((a, b) => a.mainTextOrder - b.mainTextOrder);
  
  return linkedSegmentsWithOrder.map(item => item.segment);
}

function createLinkedCommentary(
  commentarySegments: string[], 
  linking: Record<string, any>, 
  type: 'rashi' | 'tosafot'
): string {
  console.log(`🔗 Creating linked ${type} commentary`);
  
  if (!commentarySegments || commentarySegments.length === 0) {
    console.log(`⚠️ No ${type} segments available`);
    return '';
  }
  
  // Build a map: commentaryIndex -> mainTextSegmentIndex (for ordering)
  const commentaryToMainTextOrder: Record<number, number> = {};
  Object.entries(linking).forEach(([baseRef, sentenceLinks]: [string, any]) => {
    if (typeof sentenceLinks === 'object') {
      Object.entries(sentenceLinks).forEach(([mainSegmentIndex, commentaryIndexes]: [string, any]) => {
        if (Array.isArray(commentaryIndexes)) {
          commentaryIndexes.forEach(commentaryIndex => {
            // Use the first (earliest) main text reference for ordering
            if (!(commentaryIndex in commentaryToMainTextOrder)) {
              commentaryToMainTextOrder[commentaryIndex] = parseInt(mainSegmentIndex);
            }
          });
        }
      });
    }
  });
  
  const linkedIndexes = Object.keys(commentaryToMainTextOrder).map(k => parseInt(k));
  console.log(`📊 ${type}: ${commentarySegments.length} total segments, ${linkedIndexes.length} linked to main text`);
  
  // Create array of linked segments with their order information
  const linkedSegmentsWithOrder = linkedIndexes
    .map(commentaryIndex => {
      const segment = commentarySegments[commentaryIndex];
      if (segment && segment.trim().length > 5) {
        return {
          commentaryIndex,
          mainTextOrder: commentaryToMainTextOrder[commentaryIndex],
          html: `<span class="sentence-${type}" data-commentary-index="${commentaryIndex}">${segment}</span>`
        };
      }
      return null;
    })
    .filter(item => item !== null);
  
  // Sort by main text order
  linkedSegmentsWithOrder.sort((a, b) => a.mainTextOrder - b.mainTextOrder);
  
  console.log(`✅ ${type}: ${linkedSegmentsWithOrder.length} linked segments ordered by main text sequence`);
  
  return linkedSegmentsWithOrder.map(item => item.html).join(' ');
}

function extractTalmudContent(text: string): string {
  if (!text) return '';
  
  // More aggressive cleaning specifically for Talmud text
  let cleaned = text
    // Remove everything before the actual Talmud content (look for common patterns)
    .replace(/^[\s\S]*?(?=גמרא|משנה|א\]|ב\]|ג\]|ד\])/i, '')
    // Remove everything after the Talmud content ends (look for common end patterns)
    .replace(/(?:במקומן|©\d{4}|window\.|function|var |document\.)[\s\S]*$/i, '')
    // Apply the general Hebrew processing
  
  return processHebrew(cleaned);
}

function createSegmentedMainText(hebrewBooksText: string, sefariaSegments: string[]): string {
  console.log('🔗 Creating segmented main text with sentence divisions');
  
  if (!hebrewBooksText || !sefariaSegments || sefariaSegments.length === 0) {
    console.log('⚠️ No segmentation possible - missing data');
    return hebrewBooksText || '';
  }
  
  console.log(`📊 Input: HebrewBooks text ${hebrewBooksText.length} chars, ${sefariaSegments.length} Sefaria segments`);
  
  // Clean HebrewBooks text with more aggressive cleaning and Sefaria segments
  const cleanHBText = extractTalmudContent(hebrewBooksText);
  const cleanSefariaSegments = sefariaSegments
    .filter(segment => segment && segment.trim().length > 5) // Filter out very short segments
    .map(segment => processHebrew(segment));
  
  console.log(`📊 After filtering: ${cleanSefariaSegments.length} usable Sefaria segments`);
  
  let workingText = cleanHBText;
  let segmentIndex = 0;
  
  // Try to find and wrap each Sefaria segment in the HebrewBooks text
  cleanSefariaSegments.forEach((segment, index) => {
    if (segment.length > 5) { // Lower threshold for meaningful segments
      // Try exact match first
      if (workingText.includes(segment)) {
        const wrappedSegment = `<span class="sentence-main" data-sentence-index="${segmentIndex}" data-sefaria-index="${index}">${segment}</span>`;
        workingText = workingText.replace(segment, wrappedSegment);
        segmentIndex++;
        console.log(`✅ Wrapped segment ${index}: "${segment.substring(0, 50)}..."`);
      } else {
        // Try finding key phrases from the segment (at least 50% match or 15 chars)
        const minMatchLength = Math.max(Math.floor(segment.length * 0.5), 15);
        let bestMatch = '';
        let bestMatchIndex = -1;
        
        // Split segment into words and try to find the longest common substring
        const segmentWords = segment.split(/\s+/).filter(w => w.length > 2);
        
        // Try different word combinations
        for (let wordCount = Math.min(segmentWords.length, 5); wordCount >= 2; wordCount--) {
          for (let start = 0; start <= segmentWords.length - wordCount; start++) {
            const phrase = segmentWords.slice(start, start + wordCount).join(' ');
            if (phrase.length >= 10 && workingText.includes(phrase)) {
              if (phrase.length > bestMatch.length) {
                bestMatch = phrase;
                bestMatchIndex = workingText.indexOf(phrase);
              }
            }
          }
        }
        
        // If no word-based match, try sliding window approach
        if (!bestMatch && segment.length >= 20) {
          for (let i = 0; i <= workingText.length - minMatchLength; i++) {
            for (let len = minMatchLength; len <= Math.min(segment.length, workingText.length - i); len++) {
              const substring = workingText.substring(i, i + len);
              if (segment.includes(substring) && substring.length > bestMatch.length) {
                bestMatch = substring;
                bestMatchIndex = i;
              }
            }
          }
        }
        
        if (bestMatch && bestMatch.length >= minMatchLength) {
          const wrappedSegment = `<span class="sentence-main" data-sentence-index="${segmentIndex}" data-sefaria-index="${index}">${bestMatch}</span>`;
          workingText = workingText.substring(0, bestMatchIndex) + wrappedSegment + workingText.substring(bestMatchIndex + bestMatch.length);
          segmentIndex++;
          console.log(`🔍 Wrapped partial match ${index}: "${bestMatch.substring(0, 50)}..." (${bestMatch.length}/${segment.length} chars)`);
        } else {
          console.log(`❌ No match found for segment ${index}: "${segment.substring(0, 50)}..." (${segment.length} chars)`);
        }
      }
    } else {
      console.log(`⚠️ Skipping short segment ${index}: "${segment}" (${segment.length} chars)`);
    }
  });
  
  console.log(`✅ Segmentation complete: wrapped ${segmentIndex} segments`);
  return workingText;
}

function mergeTexts(sefariaLines: string[], hebrewBooksText: string): MergeResult {
  // Use HebrewBooks as source of truth, Sefaria as supplemental
  if (!hebrewBooksText || hebrewBooksText.trim().length === 0) {
    // If no HebrewBooks data, fall back to Sefaria
    const sefariaString = processHebrew(sefariaLines.join('|'));
    return {
      merged: sefariaString,
      diffs: [{ value: sefariaString, added: true }],
      issues: { sefaria: [], hb: ['No HebrewBooks data available'] },
      stats: {
        agreements: 0,
        additions: 0,
        removals: sefariaString.length,
        totalChars: sefariaString.length
      }
    };
  }
  
  // HebrewBooks is primary source
  const hbString = extractTalmudContent(hebrewBooksText);
  
  if (!sefariaLines || sefariaLines.length === 0) {
    // Only HebrewBooks data available
    return {
      merged: hbString,
      diffs: [{ value: hbString }],
      issues: { sefaria: ['No Sefaria data available'], hb: [] },
      stats: {
        agreements: hbString.length,
        additions: 0,
        removals: 0,
        totalChars: hbString.length
      }
    };
  }
  
  // Both sources available - perform comparison for analysis
  const sefariaString = processHebrew(sefariaLines.join('|'));
  const diffs = diffHebrewTexts(hbString, sefariaString); // HebrewBooks first (primary)
  const stats = calculateDiffStats(diffs);
  
  return {
    merged: hbString, // Always use HebrewBooks as the merged result
    diffs,
    issues: { sefaria: [], hb: [] },
    stats
  };
}

async function fetchHebrewBooks(mesechta: string, daf: string, options: any = {}, fetchFn = fetch) {
  const searchParams = new URLSearchParams({
    mesechta,
    daf,
    ...options
  });
  
  try {
    // Try local HebrewBooks API first
    const localUrl = `/api/hebrewbooks?${searchParams.toString()}`;
    console.log('Trying local HebrewBooks API:', localUrl);
    
    const response = await fetchFn(localUrl);
    if (response.ok) {
      const data = await response.json();
      console.log('Local HebrewBooks API success:', data.source || 'success');
      return data;
    }
    
    console.log('Local API failed, trying daf-supplier worker...');
    throw new Error(`Local HebrewBooks API failed: ${response.status}`);
  } catch (error) {
    console.error('Local HebrewBooks fetch error:', error);
    
    // Fallback to direct fetch from daf-supplier worker
    const workerUrl = `https://daf-supplier.402.workers.dev/?${searchParams.toString()}`;
    console.log('Fetching from daf-supplier worker:', workerUrl);
    
    const response = await fetch(workerUrl);
    if (response.ok) {
      const data = await response.json();
      console.log('Daf-supplier worker success:', data.source || 'worker');
      return data;
    }
    
    console.error('Daf-supplier worker also failed:', response.status);
    throw new Error(`Both local and worker APIs failed: ${response.status}`);
  }
}

// Tractate name mapping (HebrewBooks mesechta ID to Sefaria tractate name)
const TRACTATE_MAPPING: Record<string, string> = {
  '1': 'Berakhot',
  '2': 'Shabbat', 
  '3': 'Eruvin',
  '4': 'Pesachim',
  '5': 'Shekalim',
  '6': 'Yoma',
  '7': 'Sukkah',
  '8': 'Beitzah',
  '9': 'Rosh_Hashanah',
  '10': 'Taanit',
  '11': 'Megillah',
  '12': 'Moed_Katan',
  '13': 'Chagigah',
  '14': 'Yevamot',
  '15': 'Ketubot',
  '16': 'Nedarim',
  '17': 'Nazir',
  '18': 'Sotah',
  '19': 'Gittin',
  '20': 'Kiddushin',
  '21': 'Bava_Kamma',
  '22': 'Bava_Metzia',
  '23': 'Bava_Batra',  
  '24': 'Sanhedrin',
  '25': 'Makkot',
  '26': 'Shevuot',
  '27': 'Avodah_Zarah',
  '28': 'Horayot',
  '29': 'Zevachim',
  '30': 'Menachot',
  '31': 'Chullin',
  '32': 'Bekhorot',
  '33': 'Arakhin',
  '34': 'Temurah',
  '35': 'Keritot',
  '36': 'Meilah',
  '37': 'Niddah'
};

export const GET: RequestHandler = async ({ url, fetch, platform }) => {
  console.log('🚀 Talmud-merged API GET request received:', url.pathname, url.searchParams.toString());
  
  const mesechta = url.searchParams.get('mesechta');
  const daf = url.searchParams.get('daf');
  
  console.log('📝 Talmud-merged request params:', { mesechta, daf });
  
  if (!mesechta || !daf) {
    console.error('❌ Missing required parameters:', { mesechta, daf });
    return json({ error: 'Missing required parameters: mesechta and daf' }, { status: 400 });
  }
  
  const tractate = TRACTATE_MAPPING[mesechta];
  if (!tractate) {
    return json({ error: `Unknown mesechta: ${mesechta}` }, { status: 400 });
  }
  
  // Extract daf-supplier options from query parameters
  const dafSupplierOptions: Record<string, string> = {};
  const optionKeys = [
    'br',        // Enable <wbr> tag conversion
    'nocache',   // Bypass cache
    'format',    // Response format
    'debug'      // Debug mode
  ];
  
  for (const key of optionKeys) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      dafSupplierOptions[key] = value;
    }
  }
  
  console.log(`Fetching merged data for ${tractate} ${daf} with options:`, dafSupplierOptions);
  
  try {
    // Fetch from both sources in parallel
    const [hebrewBooksData, sefariaMain, sefariaRashi, sefariaTosafot] = await Promise.all([
      fetchHebrewBooks(mesechta, daf, dafSupplierOptions, fetch),
      fetchSefaria(tractate, daf, 'main'),
      fetchSefaria(tractate, daf, 'rashi'), 
      fetchSefaria(tractate, daf, 'tosafot')
    ]);
    
    // Filter Sefaria commentary to only include linked segments
    const filteredSefariaRashi = filterLinkedCommentarySegments(sefariaRashi.hebrew, sefariaRashi.linking || {});
    const filteredSefariaTosafot = filterLinkedCommentarySegments(sefariaTosafot.hebrew, sefariaTosafot.linking || {});
    
    console.log('Data fetched, merging texts...');
    
    // Merge the texts using HebrewBooks as source of truth, filtered Sefaria as supplemental
    const mainMerged = mergeTexts(sefariaMain.hebrew, hebrewBooksData.mainText || '');
      
    const rashiMerged = mergeTexts(filteredSefariaRashi, hebrewBooksData.rashi || '');
    const tosafotMerged = mergeTexts(filteredSefariaTosafot, hebrewBooksData.tosafot || '');
    
    // Parse daf format
    let dafDisplay: string;
    let amud: string;
    if (daf.includes('b')) {
      dafDisplay = daf.replace('b', '');
      amud = 'b';
    } else {
      dafDisplay = daf;
      amud = 'a';
    }
    
    const response = {
      mesechta: parseInt(mesechta),
      daf: parseInt(dafDisplay),
      dafDisplay,
      amud,
      tractate,
      
      // Merged content with both sources
      mainText: mainMerged.merged,
      rashi: rashiMerged.merged,
      tosafot: tosafotMerged.merged,
      
      // Segmented HTML versions using Sefaria sentence divisions
      segmented: {
        mainText: createSegmentedMainText(hebrewBooksData.mainText || '', sefariaMain.hebrew),
        rashi: createLinkedCommentary(sefariaRashi.hebrew, sefariaRashi.linking || {}, 'rashi'),
        tosafot: createLinkedCommentary(sefariaTosafot.hebrew, sefariaTosafot.linking || {}, 'tosafot')
      },
      
      // Original sources for comparison
      sources: {
        hebrewBooks: {
          mainText: hebrewBooksData.mainText,
          rashi: hebrewBooksData.rashi,
          tosafot: hebrewBooksData.tosafot
        },
        sefaria: {
          mainText: sefariaMain.hebrew,
          rashi: filteredSefariaRashi,
          tosafot: filteredSefariaTosafot,
          rashiOriginal: sefariaRashi.hebrew, // Keep original for comparison
          tosafotOriginal: sefariaTosafot.hebrew, // Keep original for comparison
          english: {
            mainText: sefariaMain.english,
            rashi: sefariaRashi.english,
            tosafot: sefariaTosafot.english
          },
          linking: {
            rashi: sefariaRashi.linking || {},
            tosafot: sefariaTosafot.linking || {}
          }
        }
      },
      
      // Merge analysis
      analysis: {
        main: mainMerged.issues,
        rashi: rashiMerged.issues,
        tosafot: tosafotMerged.issues
      },
      
      // Diff data for visualization
      diffs: {
        main: mainMerged.diffs,
        rashi: rashiMerged.diffs,
        tosafot: tosafotMerged.diffs
      },
      
      // Merge statistics
      mergeStats: {
        main: mainMerged.stats,
        rashi: rashiMerged.stats,
        tosafot: tosafotMerged.stats
      },
      
      timestamp: Date.now(),
      method: 'merged-diff-algorithm'
    };
    
    return json(response);
    
  } catch (error) {
    console.error('❌ Talmud merge error:', error);
    console.error('📊 Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      mesechta,
      daf,
      tractate: TRACTATE_MAPPING[mesechta]
    });
    
    return json({ 
      error: 'Failed to merge Talmud sources', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
};