// Sophisticated Hebrew text diff algorithm

export interface DiffResult {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface Token {
  value: string;
  type: 'word' | 'separator' | 'space' | 'punctuation';
  normalizedValue?: string;
}

// Common Hebrew abbreviations and their expansions
const ABBREVIATION_MAP = new Map([
  ['מתני׳', 'מתניתין'],
  ['גמ׳', 'גמרא'],
  ['ר׳', 'רבי'],
  ['ר"י', 'רבי יצחק'],
  ['ר"ש', 'רבי שמעון'],
  ['רשב"ם', 'רבי שמואל בן מאיר'],
  ['וכו׳', 'וכולי'],
  ['כו׳', 'כולי'],
  ['דכ׳', 'דכתיב'],
  ['א"ר', 'אמר רבי'],
  ['א"ל', 'אמר לו'],
  ['ת"ר', 'תנו רבנן'],
  ['ת"ש', 'תא שמע'],
  ['וגו׳', 'וגומר'],
  // Add more as needed
]);

// Normalize Hebrew text for comparison
function normalizeHebrew(text: string): string {
  let normalized = text
    // Remove nikud (vowel points)
    .replace(/[\u0591-\u05C7]/g, '')
    // Normalize quotes
    .replace(/[״""״]/g, '"')
    .replace(/[׳''׳]/g, "'")
    // Remove special characters but keep basic punctuation
    .replace(/[^\u05D0-\u05EA\s.,;:!?'"־]/g, '')
    .trim();
    
  // Check if it's an abbreviation
  for (const [abbrev, full] of ABBREVIATION_MAP) {
    if (normalized === abbrev) {
      return full;
    }
  }
  
  return normalized;
}

// Calculate similarity between two Hebrew words
function hebrewSimilarity(word1: string, word2: string): number {
  const norm1 = normalizeHebrew(word1);
  const norm2 = normalizeHebrew(word2);
  
  // Exact match after normalization
  if (norm1 === norm2) return 1.0;
  
  // Check abbreviations
  if (ABBREVIATION_MAP.get(word1) === word2 || ABBREVIATION_MAP.get(word2) === word1) {
    return 0.9;
  }
  
  // Levenshtein distance for fuzzy matching
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(norm1, norm2);
  const similarity = 1 - (distance / maxLen);
  
  // If words are very similar (>80% match), consider them matching
  return similarity;
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Tokenize text preserving structure
export function tokenizeText(text: string): Token[] {
  const tokens: Token[] = [];
  const separatorRegex = /\r\n|\r|\n|<br\s*\/?>|\|/gi;
  const punctuationRegex = /[.,:;!?]/;
  
  // Split by separators but keep them
  const parts = text.split(separatorRegex);
  const separators = text.match(separatorRegex) || [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Tokenize each part
    const words = part.split(/\s+/).filter(w => w.length > 0);
    
    for (const word of words) {
      // Check if word ends with punctuation
      const punctMatch = word.match(/(.+?)([.,:;!?]+)$/);
      if (punctMatch) {
        tokens.push({
          value: punctMatch[1],
          type: 'word',
          normalizedValue: normalizeHebrew(punctMatch[1])
        });
        tokens.push({
          value: punctMatch[2],
          type: 'punctuation'
        });
      } else if (word) {
        tokens.push({
          value: word,
          type: 'word',
          normalizedValue: normalizeHebrew(word)
        });
      }
    }
    
    // Add separator if exists
    if (i < separators.length) {
      tokens.push({
        value: separators[i],
        type: 'separator'
      });
    }
  }
  
  return tokens;
}

// Find longest common subsequence of tokens
function findLCS(tokens1: Token[], tokens2: Token[], start1: number, start2: number, maxLen: number): { length: number; pos1: number; pos2: number } {
  let bestLength = 0;
  let bestPos1 = -1;
  let bestPos2 = -1;
  
  for (let i = start1; i < Math.min(tokens1.length, start1 + maxLen); i++) {
    for (let j = start2; j < Math.min(tokens2.length, start2 + maxLen); j++) {
      let length = 0;
      
      while (i + length < tokens1.length && 
             j + length < tokens2.length &&
             tokens1[i + length].type === 'word' &&
             tokens2[j + length].type === 'word' &&
             hebrewSimilarity(tokens1[i + length].value, tokens2[j + length].value) > 0.8) {
        length++;
      }
      
      if (length > bestLength) {
        bestLength = length;
        bestPos1 = i;
        bestPos2 = j;
      }
    }
  }
  
  return { length: bestLength, pos1: bestPos1, pos2: bestPos2 };
}

// Sophisticated diff algorithm for Hebrew text
export function diffHebrewTexts(text1: string, text2: string): DiffResult[] {
  const tokens1 = tokenizeText(text1);
  const tokens2 = tokenizeText(text2);
  const diffs: DiffResult[] = [];
  
  let i = 0, j = 0;
  
  while (i < tokens1.length || j < tokens2.length) {
    // End of one text
    if (i >= tokens1.length) {
      while (j < tokens2.length) {
        diffs.push({ value: tokens2[j].value, added: true });
        j++;
      }
      break;
    }
    if (j >= tokens2.length) {
      while (i < tokens1.length) {
        diffs.push({ value: tokens1[i].value, removed: true });
        i++;
      }
      break;
    }
    
    const token1 = tokens1[i];
    const token2 = tokens2[j];
    
    // Handle separators - treat all separator types as equivalent
    if (token1.type === 'separator' && token2.type === 'separator') {
      diffs.push({ value: token2.value }); // Use target format
      i++;
      j++;
      continue;
    }
    
    // Handle punctuation
    if (token1.type === 'punctuation' && token2.type === 'punctuation' && token1.value === token2.value) {
      diffs.push({ value: token1.value });
      i++;
      j++;
      continue;
    }
    
    // Handle words with fuzzy matching
    if (token1.type === 'word' && token2.type === 'word') {
      const similarity = hebrewSimilarity(token1.value, token2.value);
      
      if (similarity > 0.8) {
        // Words match (exactly or fuzzy)
        diffs.push({ value: token1.value });
        i++;
        j++;
        continue;
      }
    }
    
    // Words don't match - try to find resync point
    const lcs = findLCS(tokens1, tokens2, i, j, 50); // Look ahead up to 50 tokens
    
    if (lcs.length >= 3) { // Found a good match of at least 3 words
      // Add everything before the match as differences
      while (i < lcs.pos1) {
        diffs.push({ value: tokens1[i].value, removed: true });
        i++;
      }
      while (j < lcs.pos2) {
        diffs.push({ value: tokens2[j].value, added: true });
        j++;
      }
    } else {
      // No good resync point found, just mark as different
      if (token1.type === 'separator' || token2.type === 'separator') {
        // One is separator, other isn't
        if (token1.type === 'separator') {
          diffs.push({ value: token1.value, removed: true });
          i++;
        } else {
          diffs.push({ value: token2.value, added: true });
          j++;
        }
      } else {
        // Both are words/punctuation but don't match
        diffs.push({ value: token1.value, removed: true });
        diffs.push({ value: token2.value, added: true });
        i++;
        j++;
      }
    }
  }
  
  // Merge adjacent diffs of the same type
  return mergeDiffs(diffs);
}

// Merge adjacent diffs of the same type
function mergeDiffs(diffs: DiffResult[]): DiffResult[] {
  const merged: DiffResult[] = [];
  let current: DiffResult | null = null;
  
  for (const diff of diffs) {
    if (current && 
        current.added === diff.added && 
        current.removed === diff.removed) {
      // Same type, merge
      current.value += diff.value;
    } else {
      // Different type or first diff
      if (current) merged.push(current);
      current = { ...diff };
    }
  }
  
  if (current) merged.push(current);
  
  return merged;
}

// Calculate statistics from diffs
export function calculateDiffStats(diffs: DiffResult[]) {
  const stats = {
    agreements: 0,
    additions: 0,
    removals: 0,
    totalChars: 0
  };
  
  for (const diff of diffs) {
    const chars = diff.value.length;
    stats.totalChars += chars;
    
    if (diff.added) {
      stats.additions += chars;
    } else if (diff.removed) {
      stats.removals += chars;
    } else {
      stats.agreements += chars;
    }
  }
  
  return stats;
}