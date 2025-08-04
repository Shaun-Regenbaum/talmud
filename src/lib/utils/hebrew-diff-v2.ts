// Better Hebrew text diff algorithm that preserves spaces

export interface DiffResult {
  value: string;
  added?: boolean;
  removed?: boolean;
}

// Map of Hebrew abbreviations to their full forms
const HEBREW_ABBREVIATIONS = new Map([
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
  ['פי׳', 'פירוש'],
  ['עי׳', 'עיין'],
]);

// Normalize Hebrew text for comparison only (not for display)
function normalizeForComparison(text: string): string {
  // Remove nikud (vowel points) and special marks
  let normalized = text.replace(/[\u0591-\u05C7]/g, '');
  
  // Normalize quotes
  normalized = normalized
    .replace(/[״""״]/g, '"')
    .replace(/[׳''׳]/g, "'");
  
  // Expand abbreviations
  for (const [abbrev, full] of HEBREW_ABBREVIATIONS) {
    normalized = normalized.replace(new RegExp(abbrev, 'g'), full);
  }
  
  return normalized;
}

// Tokenize text while preserving all whitespace and structure
function tokenizeWithSpaces(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  
  // Define separator patterns
  const separatorPattern = /(\r\n|\r|\n|<br\s*\/?>|\|)/gi;
  
  // Split by separators but keep them
  const parts = text.split(separatorPattern);
  
  for (const part of parts) {
    if (part.match(separatorPattern)) {
      // It's a separator
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(part);
    } else {
      // Split by word boundaries but keep spaces
      const wordBoundary = /(\s+)/;
      const words = part.split(wordBoundary);
      
      for (const word of words) {
        if (word) {
          tokens.push(word);
        }
      }
    }
  }
  
  if (current) {
    tokens.push(current);
  }
  
  return tokens;
}

// Check if two tokens are equivalent (for separators)
function areTokensEquivalent(token1: string, token2: string): boolean {
  const separatorPattern = /^(\r\n|\r|\n|<br\s*\/?>|\|)$/i;
  
  // If both are separators, consider them equivalent
  if (token1.match(separatorPattern) && token2.match(separatorPattern)) {
    return true;
  }
  
  // Otherwise, they must be exactly equal
  return token1 === token2;
}

// Check if two words are similar enough (for Hebrew text)
function areWordsSimilar(word1: string, word2: string): boolean {
  // If they're exactly the same, they're similar
  if (word1 === word2) return true;
  
  // If one is just whitespace, they're not similar
  if (!word1.trim() || !word2.trim()) return word1 === word2;
  
  // Normalize and compare
  const norm1 = normalizeForComparison(word1);
  const norm2 = normalizeForComparison(word2);
  
  if (norm1 === norm2) return true;
  
  // Calculate similarity ratio using Levenshtein distance
  const distance = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  
  if (maxLen === 0) return true;
  
  const similarity = 1 - (distance / maxLen);
  return similarity > 0.85; // 85% similarity threshold
}

// Levenshtein distance calculation
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

// Main diff algorithm using dynamic programming
export function diffHebrewTexts(text1: string, text2: string): DiffResult[] {
  const tokens1 = tokenizeWithSpaces(text1);
  const tokens2 = tokenizeWithSpaces(text2);
  
  // Use Myers' diff algorithm approach
  const diffs: DiffResult[] = [];
  
  // Create a matrix for longest common subsequence
  const m = tokens1.length;
  const n = tokens2.length;
  const lcs: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Fill the LCS matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (areTokensEquivalent(tokens1[i - 1], tokens2[j - 1]) || 
          areWordsSimilar(tokens1[i - 1], tokens2[j - 1])) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find the diff
  let i = m, j = n;
  const result: DiffResult[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && 
        (areTokensEquivalent(tokens1[i - 1], tokens2[j - 1]) || 
         areWordsSimilar(tokens1[i - 1], tokens2[j - 1]))) {
      // Tokens match - add the one from text2 (target)
      result.unshift({ value: tokens2[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      // Token added in text2
      result.unshift({ value: tokens2[j - 1], added: true });
      j--;
    } else if (i > 0) {
      // Token removed from text1
      result.unshift({ value: tokens1[i - 1], removed: true });
      i--;
    }
  }
  
  return result;
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