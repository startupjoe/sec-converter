// Fixed pages/api/sec-data.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { ticker, cik } = req.query;

  if (!ticker || !cik) {
    return res.status(400).json({ message: 'Ticker and CIK required' });
  }

  try {
    const headers = {
      'User-Agent': 'SEC Converter support@example.com',
      'Accept': 'application/json'
    };

    // Add rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Fetch company facts from SEC
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, '0')}.json`;
    const factsResponse = await fetch(factsUrl, { headers });
    
    if (!factsResponse.ok) {
      throw new Error(`SEC API error: ${factsResponse.status}`);
    }
    
    const factsData = await factsResponse.json();
    const facts = factsData.facts;
    const usgaap = facts['us-gaap'] || {};

    // DEBUG: Log available fields for troubleshooting
    console.log(`\nDEBUG - ${ticker} Available Fields:`, Object.keys(usgaap).filter(key => key.toLowerCase().includes('revenue')).slice(0, 10));

    // IMPROVED: Helper function to get most recent ANNUAL value with better filtering
    const getRecentValue = (factKey, units = 'USD') => {
      try {
        const fact = usgaap[factKey];
        if (!fact || !fact.units || !fact.units[units]) return null;
        
        const values = fact.units[units];
        if (!values || values.length === 0) return null;
        
        // CRITICAL FIX: Only get ANNUAL data from 10-K filings
        const annualValues = values.filter(v => 
          v.form && 
          (v.form === '10-K' || v.form === '10-K/A') && 
          v.fp === 'FY' &&  // Full Year only
          v.val !== null &&
          v.val !== undefined &&
          !isNaN(v.val) &&
          v.val > 0 &&  // Ensure positive values
          v.end  // Must have end date
        );
        
        if (annualValues.length === 0) {
          console.log(`No annual data found for ${factKey}`);
          return null;
        }
        
        // Sort by end date and get most recent
        annualValues.sort((a, b) => new Date(b.end) - new Date(a.end));
        const mostRecent = annualValues[0];
        
        console.log(`${factKey}: ${mostRecent.val} (period: ${mostRecent.end})`);
        return mostRecent.val;
        
      } catch (error) {
        console.error(`Error getting ${factKey}:`, error);
        return null;
      }
    };

    // IMPROVED: Try multiple revenue field names in order of preference
    const revenues = getRecentValue('Revenues') || 
                   getRecentValue('RevenueFromContractWithCustomerExcludingAssessedTax') ||
                   getRecentValue('SalesRevenueNet') ||
                   getRecentValue('RevenuesNetOfInterestExpense') ||
                   getRecentValue('TotalRevenues');

    console.log(`FINAL Revenue for ${ticker}: ${revenues}`);

    // IMPROVED: Try multiple cost field names
    const costOfRevenues = getRecentValue('CostOfGoodsAndServicesSold') || 
                          getRecentValue('CostOfRevenue') ||
                          getRecentValue('CostOfGoodsSold') ||
                          getRecentValue('CostOfSales');

    const grossProfit = revenues && costOfRevenues ? revenues - costOfRevenues : null;
    
    const operatingIncome = getRecentValue('OperatingIncomeLoss');
    const netIncome = getRecentValue('NetIncomeLoss');
    const totalAssets = getRecentValue('Assets');
    const totalLiabilities = getRecentValue('Liabilities');
    const stockholdersEquity = getRecentValue('StockholdersEquity');
    const currentAssets = getRecentValue('AssetsCurrent');
    const currentLiabilities = getRecentValue('LiabilitiesCurrent');
    const cashAndEquivalents = getRecentValue('CashAndCashEquivalentsAtCarryingValue') ||
                              getRecentValue('CashCashEquivalentsAndShortTermInvestments');

    // IMPROVED: Calculate ratios with better error handling
    const calculateRatio = (numerator, denominator) => {
      if (!numerator || !denominator || denominator === 0) return null;
      return (numerator / denominator) * 100;
    };

    // VALIDATION: Check if key numbers make sense
    if (revenues && revenues < 1000000) {
      console.warn(`Warning: Revenue seems too low for ${ticker}: ${revenues}`);
    }

    if (grossProfit && grossProfit < 0 && revenues && revenues > 1000000000) {
      console.warn(`Warning: Negative gross profit for major company ${ticker}: ${grossProfit}`);
    }

    const data = {
      incomeStatement: {
        revenues,
        costOfRevenues,
        grossProfit,
        operatingIncome,
        netIncome,
        earningsPerShare: getRecentValue('EarningsPerShareBasic'),
      },
      balanceSheet: {
        totalAssets,
        currentAssets,
        cashAndCashEquivalents: cashAndEquivalents,
        totalLiabilities,
        currentLiabilities,
        stockholdersEquity,
      },
      cashFlowStatement: {
        operatingCashFlow: getRecentValue('NetCashProvidedByUsedInOperatingActivities'),
        investingCashFlow: getRecentValue('NetCashProvidedByUsedInInvestingActivities'),
        financingCashFlow: getRecentValue('NetCashProvidedByUsedInFinancingActivities'),
      },
      keyMetrics: {
        grossMargin: calculateRatio(grossProfit, revenues),
        netMargin: calculateRatio(netIncome, revenues),
        returnOnAssets: calculateRatio(netIncome, totalAssets),
        returnOnEquity: calculateRatio(netIncome, stockholdersEquity),
        currentRatio: currentAssets && currentLiabilities ? currentAssets / currentLiabilities : null,
      }
    };

    // VALIDATION: Log final results for verification
    console.log(`\nFINAL RESULTS for ${ticker}:`);
    console.log(`Revenue: ${data.incomeStatement.revenues?.toLocaleString() || 'N/A'}`);
    console.log(`Net Income: ${data.incomeStatement.netIncome?.toLocaleString() || 'N/A'}`);
    console.log(`Total Assets: ${data.balanceSheet.totalAssets?.toLocaleString() || 'N/A'}`);
    console.log(`Gross Margin: ${data.keyMetrics.grossMargin?.toFixed(2) || 'N/A'}%`);

    res.status(200).json(data);

  } catch (error) {
    console.error('SEC API Error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch SEC data', 
      error: error.message 
    });
  }
}
