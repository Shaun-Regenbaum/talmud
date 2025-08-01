// Test what structure HebrewBooks actually has

async function testStructure() {
  const url = 'https://www.hebrewbooks.org/shas.aspx?mesechta=1&daf=2&format=text';
  
  console.log('Fetching:', url);
  
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    console.log('\n=== CHECKING FOR SHASTEXT DIVS ===');
    
    // Check for shastext2
    if (html.includes('class="shastext2"')) {
      console.log('✓ Found shastext2 (Gemara)');
      const match = html.match(/<div class="shastext2"[^>]*>([\s\S]{0,200})/);
      if (match) {
        console.log('Preview:', match[1].replace(/<[^>]*>/g, '').trim().substring(0, 100) + '...');
      }
    } else {
      console.log('✗ No shastext2 found');
    }
    
    // Check for shastext3
    if (html.includes('class="shastext3"')) {
      console.log('✓ Found shastext3 (Rashi)');
      const match = html.match(/<div class="shastext3"[^>]*>([\s\S]{0,200})/);
      if (match) {
        console.log('Preview:', match[1].replace(/<[^>]*>/g, '').trim().substring(0, 100) + '...');
      }
    } else {
      console.log('✗ No shastext3 found');
    }
    
    // Check for shastext4
    if (html.includes('class="shastext4"')) {
      console.log('✓ Found shastext4 (Tosafot)');
      const match = html.match(/<div class="shastext4"[^>]*>([\s\S]{0,200})/);
      if (match) {
        console.log('Preview:', match[1].replace(/<[^>]*>/g, '').trim().substring(0, 100) + '...');
      }
    } else {
      console.log('✗ No shastext4 found');
    }
    
    // Check for fieldsets
    console.log('\n=== CHECKING FOR FIELDSETS ===');
    const fieldsetMatches = html.match(/<fieldset[^>]*>[\s\S]*?<legend[^>]*>(.*?)<\/legend>/g);
    if (fieldsetMatches) {
      console.log(`Found ${fieldsetMatches.length} fieldsets`);
      fieldsetMatches.forEach((match, i) => {
        const legendMatch = match.match(/<legend[^>]*>(.*?)<\/legend>/);
        if (legendMatch) {
          console.log(`Fieldset ${i + 1}: ${legendMatch[1]}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testStructure();