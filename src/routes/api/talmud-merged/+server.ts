import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Diff algorithm implementation (simplified version of what talmud-data uses)
interface DiffResult {
  value: string;
  added?: boolean;
  removed?: boolean;
}

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

// Normalize separators - treat \n, \r\n, <br>, and | as equivalent
function normalizeSeparators(text: string): { normalized: string; separatorMap: Map<number, string> } {
  const separatorMap = new Map<number, string>();
  let position = 0;
  
  // Replace all separator types with a unified marker, but remember what they were
  const normalized = text
    .replace(/\r\n|[\r\n]|<br\s*\/?>|\|/gi, (match, offset) => {
      separatorMap.set(position, match);
      position++;
      return '\u0000'; // Use null character as unified separator
    });
    
  return { normalized, separatorMap };
}

// Split text into words and separators
function tokenizeText(text: string): Array<{ value: string; type: 'word' | 'separator' | 'space' }> {
  const tokens: Array<{ value: string; type: 'word' | 'separator' | 'space' }> = [];
  const { normalized, separatorMap } = normalizeSeparators(text);
  
  let sepIndex = 0;
  let currentWord = '';
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    
    if (char === '\u0000') {
      // Found a separator
      if (currentWord) {
        tokens.push({ value: currentWord, type: 'word' });
        currentWord = '';
      }
      tokens.push({ value: separatorMap.get(sepIndex) || '|', type: 'separator' });
      sepIndex++;
    } else if (/\s/.test(char)) {
      // Space character
      if (currentWord) {
        tokens.push({ value: currentWord, type: 'word' });
        currentWord = '';
      }
      tokens.push({ value: char, type: 'space' });
    } else {
      // Part of a word
      currentWord += char;
    }
  }
  
  if (currentWord) {
    tokens.push({ value: currentWord, type: 'word' });
  }
  
  return tokens;
}

// Sophisticated diff that handles words and formatting
function diffTexts(text1: string, text2: string): DiffResult[] {
  const tokens1 = tokenizeText(text1);
  const tokens2 = tokenizeText(text2);
  const diffs: DiffResult[] = [];
  
  let i = 0, j = 0;
  
  while (i < tokens1.length || j < tokens2.length) {
    if (i >= tokens1.length) {
      // Remaining tokens in text2
      while (j < tokens2.length) {
        diffs.push({ value: tokens2[j].value, added: true });
        j++;
      }
      break;
    } else if (j >= tokens2.length) {
      // Remaining tokens in text1
      while (i < tokens1.length) {
        diffs.push({ value: tokens1[i].value, removed: true });
        i++;
      }
      break;
    }
    
    const token1 = tokens1[i];
    const token2 = tokens2[j];
    
    // If both are separators, treat them as equivalent
    if (token1.type === 'separator' && token2.type === 'separator') {
      // Use the HebrewBooks separator in the output
      diffs.push({ value: token2.value });
      i++;
      j++;
    }
    // If both are spaces or both are the same word
    else if ((token1.type === 'space' && token2.type === 'space') || 
             (token1.type === 'word' && token2.type === 'word' && token1.value === token2.value)) {
      diffs.push({ value: token1.value });
      i++;
      j++;
    }
    // Look ahead for matching words
    else {
      let found = false;
      
      // Try to find a matching word within the next few tokens
      const lookAhead = 10;
      
      // Check if token1 appears soon in tokens2
      for (let k = 1; k < Math.min(lookAhead, tokens2.length - j); k++) {
        const futureToken2 = tokens2[j + k];
        if (futureToken2 && token1.type === 'word' && futureToken2.type === 'word' && token1.value === futureToken2.value) {
          // Add intervening tokens as additions
          for (let m = 0; m < k; m++) {
            diffs.push({ value: tokens2[j + m].value, added: true });
          }
          diffs.push({ value: token1.value });
          i++;
          j += k + 1;
          found = true;
          break;
        }
      }
      
      if (!found) {
        // Check if token2 appears soon in tokens1
        for (let k = 1; k < Math.min(lookAhead, tokens1.length - i); k++) {
          const futureToken1 = tokens1[i + k];
          if (futureToken1 && token2.type === 'word' && futureToken1.type === 'word' && token2.value === futureToken1.value) {
            // Add intervening tokens as removals
            for (let m = 0; m < k; m++) {
              diffs.push({ value: tokens1[i + m].value, removed: true });
            }
            diffs.push({ value: token2.value });
            i += k + 1;
            j++;
            found = true;
            break;
          }
        }
      }
      
      if (!found) {
        // No match found, treat as different
        diffs.push({ value: token1.value, removed: true });
        diffs.push({ value: token2.value, added: true });
        i++;
        j++;
      }
    }
  }
  
  // Merge adjacent diffs of the same type
  const mergedDiffs: DiffResult[] = [];
  let current: DiffResult | null = null;
  
  for (const diff of diffs) {
    if (current && current.added === diff.added && current.removed === diff.removed) {
      current.value += diff.value;
    } else {
      if (current) mergedDiffs.push(current);
      current = { ...diff };
    }
  }
  
  if (current) mergedDiffs.push(current);
  
  return mergedDiffs;
}

function processHebrew(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replaceAll("–", "")
    .replaceAll("׳", "'")
    .trim();
}

function diffsToString(diffs: DiffResult[]): string {
  let merged = "";
  
  diffs.forEach((part) => {
    if (part.removed) {
      // Skip removed content (we prefer HebrewBooks formatting)
      // But we might want to keep some structural elements
    } else if (part.added || !part.removed) {
      // Keep added content and agreements
      merged += part.value;
    }
  });
  
  return merged;
}

async function fetchSefariaCommentary(tractate: string, daf: string, commentaryType: 'rashi' | 'tosafot') {
  // Convert daf format - HebrewBooks appears to use page numbers directly
  const dafNum = parseInt(daf);
  const pageNum = dafNum;
  const amud = 'a'; // Default to 'a' for now
  const sefariaRef = `${pageNum}${amud}`;
  
  const commentaryName = commentaryType === 'rashi' ? 'Rashi' : 'Tosafot';
  
  try {
    // First, get the main text to understand the structure
    const mainRef = `${tractate}.${sefariaRef}`;
    const relatedUrl = `https://www.sefaria.org/api/related/${mainRef}`;
    
    console.log(`Fetching related texts for ${mainRef} to find all ${commentaryName} segments`);
    
    const relatedResponse = await fetch(relatedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TalmudMerged/1.0)',
      }
    });
    
    if (!relatedResponse.ok) {
      console.log(`Related API error:`, relatedResponse.status);
      return { hebrew: [], english: [] };
    }
    
    const relatedData = await relatedResponse.json();
    
    // Find all commentary links for this type
    const commentaryLinks = relatedData.links?.filter((link: any) => 
      link.index_title === `${commentaryName} on ${tractate}` && 
      link.type === 'commentary'
    ) || [];
    
    console.log(`Found ${commentaryLinks.length} ${commentaryName} links for ${mainRef}`);
    
    // Fetch all commentary segments
    const allSegments = await Promise.all(
      commentaryLinks.map(async (link: any) => {
        try {
          const url = `https://www.sefaria.org/api/texts/${link.ref}`;
          const resp = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; TalmudMerged/1.0)',
            }
          });
          
          if (!resp.ok) return { hebrew: [], english: [] };
          
          const data = await resp.json();
          
          // Extract Hebrew text
          let hebrew = [];
          if (data.he) {
            if (typeof data.he === 'string') {
              hebrew = [data.he];
            } else if (Array.isArray(data.he)) {
              hebrew = data.he.flat(2).filter((s: any) => s && typeof s === 'string');
            }
          }
          
          // Extract English text
          let english = [];
          if (data.text) {
            if (typeof data.text === 'string') {
              english = [data.text];
            } else if (Array.isArray(data.text)) {
              english = data.text.flat(2).filter((s: any) => s && typeof s === 'string');
            }
          }
          
          return { hebrew, english };
        } catch (error) {
          console.error(`Failed to fetch ${link.ref}:`, error);
          return { hebrew: [], english: [] };
        }
      })
    );
    
    // Combine all segments
    const allHebrew = allSegments.flatMap(s => s.hebrew);
    const allEnglish = allSegments.flatMap(s => s.english);
    
    console.log(`Total ${commentaryName} segments: ${allHebrew.length} Hebrew, ${allEnglish.length} English`);
    
    return {
      hebrew: allHebrew,
      english: allEnglish
    };
    
  } catch (error) {
    console.error(`Failed to fetch ${commentaryName} commentary:`, error);
    return { hebrew: [], english: [] };
  }
}

async function fetchSefaria(tractate: string, daf: string, type: 'main' | 'rashi' | 'tosafot') {
  if (type === 'rashi' || type === 'tosafot') {
    return fetchSefariaCommentary(tractate, daf, type);
  }
  
  // Main text fetching remains the same
  const dafNum = parseInt(daf);
  const pageNum = dafNum;
  const amud = 'a'; // Default to 'a' for now
  const sefariaRef = `${pageNum}${amud}`;
  
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

function mergeTexts(sefariaLines: string[], hebrewBooksText: string): MergeResult {
  const sentenceSep = '|';
  
  // Process Sefaria text - join with pipe separator
  const sefariaString = processHebrew(sefariaLines.join(sentenceSep));
  
  // Process HebrewBooks text - keep original formatting
  const hbString = processHebrew(hebrewBooksText);
  
  // Perform sophisticated diff
  const diffs = diffTexts(sefariaString, hbString);
  const merged = diffsToString(diffs);
  
  // Calculate statistics
  const stats = {
    agreements: 0,
    additions: 0,
    removals: 0,
    totalChars: 0
  };
  
  diffs.forEach(diff => {
    const charCount = diff.value.length;
    stats.totalChars += charCount;
    
    if (diff.added) {
      stats.additions += charCount;
    } else if (diff.removed) {
      stats.removals += charCount;
    } else {
      stats.agreements += charCount;
    }
  });
  
  return {
    merged: merged,
    diffs,
    issues: { sefaria: [], hb: [] }, // Simplified for now
    stats
  };
}

async function fetchHebrewBooks(mesechta: string, daf: string, options: any = {}) {
  const searchParams = new URLSearchParams({
    mesechta,
    daf,
    ...options
  });
  
  try {
    // Try local HebrewBooks API first
    const localUrl = `/api/hebrewbooks?${searchParams.toString()}`;
    console.log('Trying local HebrewBooks API:', localUrl);
    
    const response = await fetch(localUrl);
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

export const GET: RequestHandler = async ({ url }) => {
  const mesechta = url.searchParams.get('mesechta');
  const daf = url.searchParams.get('daf');
  
  if (!mesechta || !daf) {
    return json({ error: 'Missing required parameters: mesechta and daf' }, { status: 400 });
  }
  
  const tractate = TRACTATE_MAPPING[mesechta];
  if (!tractate) {
    return json({ error: `Unknown mesechta: ${mesechta}` }, { status: 400 });
  }
  
  // Extract daf-supplier options from query parameters
  const dafSupplierOptions: Record<string, string> = {};
  const optionKeys = [
    'br',        // Enable <br> tag conversion
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
      fetchHebrewBooks(mesechta, daf, dafSupplierOptions),
      fetchSefaria(tractate, daf, 'main'),
      fetchSefaria(tractate, daf, 'rashi'), 
      fetchSefaria(tractate, daf, 'tosafot')
    ]);
    
    console.log('Data fetched, merging texts...');
    
    // Merge the texts using diff algorithm
    const mainMerged = sefariaMain.hebrew.length > 0 
      ? mergeTexts(sefariaMain.hebrew, hebrewBooksData.mainText || '') 
      : { 
          merged: hebrewBooksData.mainText || '', 
          diffs: [], 
          issues: { sefaria: [], hb: [] },
          stats: { agreements: 0, additions: 0, removals: 0, totalChars: 0 }
        };
      
    const rashiMerged = sefariaRashi.hebrew.length > 0 
      ? mergeTexts(sefariaRashi.hebrew, hebrewBooksData.rashi || '') 
      : { 
          merged: hebrewBooksData.rashi || '', 
          diffs: [], 
          issues: { sefaria: [], hb: [] },
          stats: { agreements: 0, additions: 0, removals: 0, totalChars: 0 }
        };
      
    const tosafotMerged = sefariaTosafot.hebrew.length > 0 
      ? mergeTexts(sefariaTosafot.hebrew, hebrewBooksData.tosafot || '') 
      : { 
          merged: hebrewBooksData.tosafot || '', 
          diffs: [], 
          issues: { sefaria: [], hb: [] },
          stats: { agreements: 0, additions: 0, removals: 0, totalChars: 0 }
        };
    
    const dafNum = parseInt(daf);
    const pageNum = dafNum;
    const amud = 'a'; // Default to 'a' for now
    
    const response = {
      mesechta: parseInt(mesechta),
      daf: dafNum,
      dafDisplay: pageNum.toString(),
      amud,
      tractate,
      
      // Merged content with both sources
      mainText: mainMerged.merged,
      rashi: rashiMerged.merged,
      tosafot: tosafotMerged.merged,
      
      // Original sources for comparison
      sources: {
        hebrewBooks: {
          mainText: hebrewBooksData.mainText,
          rashi: hebrewBooksData.rashi,
          tosafot: hebrewBooksData.tosafot
        },
        sefaria: {
          mainText: sefariaMain.hebrew,
          rashi: sefariaRashi.hebrew,
          tosafot: sefariaTosafot.hebrew,
          english: {
            mainText: sefariaMain.english,
            rashi: sefariaRashi.english,
            tosafot: sefariaTosafot.english
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
    console.error('Talmud merge error:', error);
    return json({ 
      error: 'Failed to merge Talmud sources', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
};