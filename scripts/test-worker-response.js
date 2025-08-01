// Test the worker response to see what we're getting

async function testWorker() {
  const url = 'https://daf-supplier.402.workers.dev?mesechta=1&daf=2';
  
  console.log('Testing worker:', url);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('\n=== RESPONSE STRUCTURE ===');
    console.log('Keys:', Object.keys(data));
    console.log('Tractate:', data.tractate, 'Daf:', data.daf, data.amud);
    
    console.log('\n=== TEXT CONTENT ===');
    console.log('Main text length:', data.mainText?.length || 0);
    console.log('Rashi length:', data.rashi?.length || 0);
    console.log('Tosafot length:', data.tosafot?.length || 0);
    
    if (data.mainText) {
      console.log('\n=== MAIN TEXT PREVIEW ===');
      console.log(data.mainText.substring(0, 200));
    }
    
    if (data.rashi) {
      console.log('\n=== RASHI PREVIEW ===');
      console.log(data.rashi.substring(0, 200));
    }
    
    if (data.tosafot) {
      console.log('\n=== TOSAFOT PREVIEW ===');
      console.log(data.tosafot.substring(0, 200));
    }
    
    // Check if we're getting HTML or text
    if (data.mainText && data.mainText.includes('<')) {
      console.log('\n=== WARNING: HTML DETECTED IN RESPONSE ===');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testWorker();