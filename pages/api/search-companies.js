// API endpoint to search for ANY company and get their CIK
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { query } = req.query;

  if (!query || query.length < 2) {
    return res.status(400).json({ message: 'Search query too short' });
  }

  try {
    const headers = {
      'User-Agent': 'SEC Converter support@example.com',
      'Accept': 'application/json'
    };

    // Get SEC company tickers file (updated daily by SEC)
    const tickersUrl = 'https://www.sec.gov/files/company_tickers.json';
    const tickersResponse = await fetch(tickersUrl, { headers });
    
    if (!tickersResponse.ok) {
      throw new Error(`SEC Tickers API error: ${tickersResponse.status}`);
    }
    
    const tickersData = await tickersResponse.json();

    // Search through all companies
    const searchTerm = query.toLowerCase();
    const results = [];

    Object.values(tickersData).forEach(company => {
      const ticker = company.ticker?.toLowerCase() || '';
      const title = company.title?.toLowerCase() || '';
      
      if (ticker.includes(searchTerm) || title.includes(searchTerm)) {
        results.push({
          ticker: company.ticker,
          name: company.title,
          cik: company.cik_str.toString().padStart(10, '0'),
          exchange: 'Public' // SEC doesn't provide exchange in this API
        });
      }
    });

    // Limit results and sort by relevance
    const limitedResults = results
      .sort((a, b) => {
        // Prioritize exact ticker matches
        if (a.ticker.toLowerCase() === searchTerm) return -1;
        if (b.ticker.toLowerCase() === searchTerm) return 1;
        return a.ticker.localeCompare(b.ticker);
      })
      .slice(0, 10);

    res.status(200).json(limitedResults);

  } catch (error) {
    console.error('Company Search Error:', error);
    res.status(500).json({ 
      message: 'Failed to search companies', 
      error: error.message 
    });
  }
}
