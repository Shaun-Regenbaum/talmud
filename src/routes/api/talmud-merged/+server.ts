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
  return text
    .replace(/<[^>]*>/g, "")
    .replaceAll("–", "")
    .replaceAll("׳", "'")
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
  // HebrewBooks format: "2" means 2a, "2b" means 2b, "3" means 3a, "3b" means 3b
  let sefariaRef: string;
  if (daf.includes('b')) {
    // Already has amud designation
    sefariaRef = daf;
  } else {
    // Plain number means 'a' side
    sefariaRef = `${daf}a`;
  }
  
  const commentaryName = commentaryType === 'rashi' ? 'Rashi' : 'Tosafot';
  
  try {
    // Use the related API to find all commentary segments for this daf
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
    
    // Also collect linking information
    const linkingInfo: Record<string, string[]> = {};
    
    // Fetch all commentary segments and collect linking info
    const allSegments = await Promise.all(
      commentaryLinks.map(async (link: any, index: number) => {
        try {
          const url = `https://www.sefaria.org/api/texts/${link.ref}`;
          const resp = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; TalmudMerged/1.0)',
            }
          });
          
          if (!resp.ok) return { hebrew: [], english: [], linkInfo: null };
          
          const data = await resp.json();
          
          // Extract Hebrew text
          let hebrew = [];
          if (data.he) {
            if (typeof data.he === 'string') {
              hebrew = [data.he];
            } else if (Array.isArray(data.he)) {
              hebrew = data.he.flat().filter((s: any) => s && typeof s === 'string' && s.trim().length > 5);
            }
          }
          
          // Extract English text
          let english = [];
          if (data.text) {
            if (typeof data.text === 'string') {
              english = [data.text];
            } else if (Array.isArray(data.text)) {
              english = data.text.flat().filter((s: any) => s && typeof s === 'string');
            }
          }
          
          // Store linking information
          const linkInfo = {
            commentaryRef: link.ref,
            mainTextRef: link.anchorRef,
            segmentIndex: index
          };
          
          // Build linking map: mainTextRef -> commentarySegmentIndexes
          if (link.anchorRef) {
            // Parse the sentence index from anchorRef (e.g., "Berakhot 3a:5" -> 5)
            const parts = link.anchorRef.split(':');
            if (parts.length >= 2) {
              const sentenceIndex = parseInt(parts[1]) - 1; // Convert to 0-based
              const baseRef = parts[0]; // e.g., "Berakhot 3a"
              
              if (!linkingInfo[baseRef]) {
                linkingInfo[baseRef] = {};
              }
              if (!linkingInfo[baseRef][sentenceIndex]) {
                linkingInfo[baseRef][sentenceIndex] = [];
              }
              linkingInfo[baseRef][sentenceIndex].push(index);
            }
          }
          
          return { hebrew, english, linkInfo };
        } catch (error) {
          console.error(`Failed to fetch ${link.ref}:`, error);
          return { hebrew: [], english: [], linkInfo: null };
        }
      })
    );
    
    // Combine all segments
    const allHebrew = allSegments.flatMap(s => s.hebrew);
    const allEnglish = allSegments.flatMap(s => s.english);
    
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
  
  // HebrewBooks format: "2" means 2a, "2b" means 2b, "3" means 3a, "3b" means 3b
  let sefariaRef: string;
  if (daf.includes('b')) {
    // Already has amud designation
    sefariaRef = daf;
  } else {
    // Plain number means 'a' side
    sefariaRef = `${daf}a`;
  }
  
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
  const hbString = processHebrew(hebrewBooksText);
  
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
    
    // Merge the texts using HebrewBooks as source of truth, Sefaria as supplemental
    const mainMerged = mergeTexts(sefariaMain.hebrew, hebrewBooksData.mainText || '');
      
    const rashiMerged = mergeTexts(sefariaRashi.hebrew, hebrewBooksData.rashi || '');
    const tosafotMerged = mergeTexts(sefariaTosafot.hebrew, hebrewBooksData.tosafot || '');
    
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
    console.error('Talmud merge error:', error);
    return json({ 
      error: 'Failed to merge Talmud sources', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
};