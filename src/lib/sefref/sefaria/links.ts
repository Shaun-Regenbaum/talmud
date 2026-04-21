/**
 * Sefaria Links API client for getting commentary connections
 * Based on talmud-vue-reference approach
 */

export interface SefariaLink {
  daf: string;
  sentenceIndexStart: number;
  sentenceIndexEnd?: number;
  ref: string;
  category: string;
  title: {
    en: string;
    he: string;
  };
  commentaryType: 'rashi' | 'tosafot' | 'traditional' | 'tanakh' | 'halakhah';
}

export interface LinkingData {
  rashi: Record<string, Record<number, number[]>>;
  tosafot: Record<string, Record<number, number[]>>;
  traditional: Record<string, Record<number, SefariaLink[]>>;
  crossReferences: Record<string, Record<number, SefariaLink[]>>;
}

const commentaryIncludes = {
  "Chidushei Agadot": "traditional",
  "Rashba": "traditional", 
  "Ritva": "traditional",
  "Rosh": "traditional",
  "Ramban": "traditional",
  "Rashi": "rashi",
  "Tosafot": "tosafot"
} as const;

function parseLink(daf: string, linkObj: any): SefariaLink | null {
  try {
    const anchorRef = linkObj.anchorRef;
    if (!anchorRef || !anchorRef.includes(':')) return null;
    
    const sentenceIndex = anchorRef.split(':')[1];
    let sentenceIndexStart: number;
    let sentenceIndexEnd: number | undefined;
    
    if (sentenceIndex.includes('-')) {
      const indices = sentenceIndex.split('-');
      sentenceIndexStart = parseInt(indices[0]) - 1; // Convert to 0-based
      sentenceIndexEnd = parseInt(indices[1]) - 1;
    } else {
      sentenceIndexStart = parseInt(sentenceIndex) - 1; // Convert to 0-based
    }
    
    // Determine commentary type
    let commentaryType: SefariaLink['commentaryType'] = 'traditional';
    
    if (linkObj.category === "Commentary") {
      const key = Object.keys(commentaryIncludes).find(name => 
        linkObj.collectiveTitle?.en?.includes(name)
      );
      if (key) {
        commentaryType = commentaryIncludes[key as keyof typeof commentaryIncludes];
      }
    } else if (linkObj.category === "Tanakh") {
      commentaryType = 'tanakh';
    } else if (linkObj.category === "Halakhah") {
      commentaryType = 'halakhah';
    }
    
    return {
      daf,
      sentenceIndexStart,
      sentenceIndexEnd,
      category: linkObj.category,
      ref: linkObj.ref,
      title: linkObj.collectiveTitle || { en: linkObj.ref, he: linkObj.ref },
      commentaryType
    };
  } catch (error) {
    console.warn('Failed to parse link:', linkObj, error);
    return null;
  }
}

function includeLink(link: SefariaLink): boolean {
  if (link.category === "Tanakh") return true;
  if (link.category === "Halakhah") return true;
  if (link.category === "Commentary") {
    return Object.keys(commentaryIncludes).some(name => 
      link.title.en.includes(name)
    );
  }
  return false;
}

export async function getSefariaLinks(tractate: string, daf: string): Promise<SefariaLink[]> {
  try {
    const ref = `${tractate} ${daf}`; // e.g., "Berakhot 3a"
    const url = `https://www.sefaria.org/api/related/${ref.replace(' ', '_')}`;
    
    console.log('🔗 Fetching Sefaria links for:', ref);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.links || !Array.isArray(data.links)) {
      console.warn('No links data found in Sefaria response');
      return [];
    }
    
    const links = data.links
      .map((linkObj: any) => parseLink(ref, linkObj))
      .filter((link: SefariaLink | null): link is SefariaLink => link !== null)
      .filter(includeLink);
    
    console.log(`✅ Found ${links.length} relevant links for ${ref}`);
    return links;
    
  } catch (error) {
    console.error('Failed to fetch Sefaria links:', error);
    return [];
  }
}

export function linksToLinkingData(links: SefariaLink[], baseRef: string): LinkingData {
  const linking: LinkingData = {
    rashi: { [baseRef]: {} },
    tosafot: { [baseRef]: {} },
    traditional: { [baseRef]: {} },
    crossReferences: { [baseRef]: {} }
  };
  
  // Group links by commentary type for better processing
  const rashiLinks = links.filter(link => link.commentaryType === 'rashi');
  const tosafotLinks = links.filter(link => link.commentaryType === 'tosafot');
  
  // Process Rashi links
  rashiLinks.forEach((link, linkIndex) => {
    const { sentenceIndexStart, sentenceIndexEnd } = link;
    const startIndex = sentenceIndexStart;
    const endIndex = sentenceIndexEnd ?? sentenceIndexStart;
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (!linking.rashi[baseRef][i]) {
        linking.rashi[baseRef][i] = [];
      }
      // Map to sequential commentary segment index
      linking.rashi[baseRef][i].push(linkIndex);
    }
  });
  
  // Process Tosafot links
  tosafotLinks.forEach((link, linkIndex) => {
    const { sentenceIndexStart, sentenceIndexEnd } = link;
    const startIndex = sentenceIndexStart;
    const endIndex = sentenceIndexEnd ?? sentenceIndexStart;
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (!linking.tosafot[baseRef][i]) {
        linking.tosafot[baseRef][i] = [];
      }
      // Map to sequential commentary segment index
      linking.tosafot[baseRef][i].push(linkIndex);
    }
  });
  
  // Process other commentaries
  links.forEach(link => {
    const { sentenceIndexStart, sentenceIndexEnd, commentaryType } = link;
    
    if (commentaryType !== 'rashi' && commentaryType !== 'tosafot') {
      const startIndex = sentenceIndexStart;
      const endIndex = sentenceIndexEnd ?? sentenceIndexStart;
      
      for (let i = startIndex; i <= endIndex; i++) {
        const targetCategory = commentaryType === 'traditional' ? 'traditional' : 'crossReferences';
        if (!linking[targetCategory][baseRef][i]) {
          linking[targetCategory][baseRef][i] = [];
        }
        linking[targetCategory][baseRef][i].push(link);
      }
    }
  });
  
  console.log('🔗 Converted links to linking data:', {
    baseRef,
    rashiSegments: Object.keys(linking.rashi[baseRef]).length,
    tosafotSegments: Object.keys(linking.tosafot[baseRef]).length,
    traditionalSegments: Object.keys(linking.traditional[baseRef]).length,
    crossRefSegments: Object.keys(linking.crossReferences[baseRef]).length,
    rashiLinksCount: rashiLinks.length,
    tosafotLinksCount: tosafotLinks.length
  });
  
  return linking;
}

// Utility function to get direct commentary connections
export async function getCommentaryLinks(tractate: string, daf: string): Promise<{
  rashi: Record<number, number[]>;
  tosafot: Record<number, number[]>;
}> {
  const links = await getSefariaLinks(tractate, daf);
  const baseRef = `${tractate} ${daf}`;
  const linkingData = linksToLinkingData(links, baseRef);
  
  console.log('📊 getCommentaryLinks returning:', {
    rashiKeys: Object.keys(linkingData.rashi[baseRef] || {}),
    tosafotKeys: Object.keys(linkingData.tosafot[baseRef] || {}),
    totalLinks: links.length
  });
  
  return {
    rashi: linkingData.rashi[baseRef] || {},
    tosafot: linkingData.tosafot[baseRef] || {}
  };
}