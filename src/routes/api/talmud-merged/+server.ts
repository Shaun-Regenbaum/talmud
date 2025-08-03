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

function diffChars(text1: string, text2: string): DiffResult[] {
  // Simple character-level diff implementation
  const diffs: DiffResult[] = [];
  let i = 0, j = 0;
  
  while (i < text1.length || j < text2.length) {
    if (i >= text1.length) {
      // Remaining characters in text2 are additions
      diffs.push({ value: text2.slice(j), added: true });
      break;
    } else if (j >= text2.length) {
      // Remaining characters in text1 are removals
      diffs.push({ value: text1.slice(i), removed: true });
      break;
    } else if (text1[i] === text2[j]) {
      // Characters match
      let start = i;
      while (i < text1.length && j < text2.length && text1[i] === text2[j]) {
        i++;
        j++;
      }
      diffs.push({ value: text1.slice(start, i) });
    } else {
      // Find next matching character
      let found = false;
      for (let k = 1; k <= Math.min(50, Math.min(text1.length - i, text2.length - j)); k++) {
        if (text1[i + k] === text2[j]) {
          diffs.push({ value: text1.slice(i, i + k), removed: true });
          i += k;
          found = true;
          break;
        } else if (text1[i] === text2[j + k]) {
          diffs.push({ value: text2.slice(j, j + k), added: true });
          j += k;
          found = true;
          break;
        }
      }
      
      if (!found) {
        // No match found, treat as substitution
        diffs.push({ value: text1[i], removed: true });
        diffs.push({ value: text2[j], added: true });
        i++;
        j++;
      }
    }
  }
  
  return diffs;
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
  const lineSep = '<br>';
  const sentenceSep = '|';
  
  diffs.forEach((part) => {
    if (part.removed) {
      if (part.value.includes(sentenceSep)) {
        merged += sentenceSep;
      }
      // Skip other removed content (prefer HebrewBooks formatting)
    } else if (part.added) {
      let add = "";
      if (part.value.includes("}")) add += "} ";
      if (part.value.includes(lineSep)) add += lineSep;
      if (part.value.includes("{")) add += "{";
      merged += add || part.value;
    } else {
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
  
  // Process Sefaria text
  const sefariaString = processHebrew(sefariaLines.join(sentenceSep));
  
  // Process HebrewBooks text  
  const hbLines = hebrewBooksText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  const hbString = hbLines.join('<br>');
  
  // Perform diff and merge
  const diffs = diffChars(sefariaString, hbString);
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
    merged: merged.replaceAll(`${sentenceSep}.`, `.${sentenceSep}`),
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