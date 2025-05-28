// API endpoint to fetch SEC financial data
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

    // Helper function to get most recent value with better error handling
    const getRecentValue = (factKey, units = 'USD') => {
      try {
        const fact = usgaap[factKey];
        if (!fact || !fact.units || !fact.units[units]) return null;
        
        const values = fact.units[units];
        if (!values || values.length === 0) return null;
        
        // Get most recent annual value (not quarterly)
        const annualValues = values.filter(v => 
          v.form && 
          (v.form === '10-K' || v.form === '10-K/A') && 
          v.fp === 'FY' &&
          v.val !== null &&
          v.val !== undefined &&
          !isNaN(v.val)
        );
        
        if (annualValues.length === 0) {
          const mostRecent = values[values.length - 1];
          return mostRecent?.val || null;
        }
        
        return annualValues[annualValues.length - 1]?.val || null;
      } catch (error) {
        console.error(`Error getting ${factKey}:`, error);
        return null;
      }
    };

    // Extract financial data with multiple field attempts
    const revenues = getRecentValue('Revenues') || 
                   getRecentValue('RevenueFromContractWithCustomerExcludingAssessedTax') ||
                   getRecentValue('SalesRevenueNet') ||
                   getRecentValue('RevenuesNetOfInterestExpense');

    const costOfRevenues = getRecentValue('CostOfGoodsAndServicesSold') || 
                          getRecentValue('CostOfRevenue') ||
                          getRecentValue('CostOfGoodsSold');

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

    // Calculate ratios with null checks
    const calculateRatio = (numerator, denominator) => {
      if (!numerator || !denominator || denominator === 0) return null;
      return (numerator / denominator) * 100;
    };

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

    // Log successful extraction for debugging
    console.log(`Successfully extracted data for ${ticker} (CIK: ${cik})`);

    res.status(200).json(data);

  } catch (error) {
    console.error('SEC API Error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch SEC data', 
      error: error.message 
    });
  }
}
