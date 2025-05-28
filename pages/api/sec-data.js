// Fixed pages/api/sec-data.js with accurate data extraction
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
    const dei = facts['dei'] || {};

    // Get fiscal year end info
    const entityInfo = {
      fiscalYearEnd: dei?.CurrentFiscalYearEndDate?.units?.USD?.[0]?.val || 'Unknown'
    };

    console.log(`\n=== Processing ${ticker} (CIK: ${cik}) ===`);
    console.log(`Available US-GAAP fields: ${Object.keys(usgaap).length}`);

    // CRITICAL FIX: Get the most recent ANNUAL value with proper validation
    const getRecentAnnualValue = (fieldNames, units = 'USD', minYear = 2022) => {
      try {
        // Try multiple field names in order of preference
        const fieldArray = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
        
        for (const fieldName of fieldArray) {
          const fact = usgaap[fieldName];
          if (!fact || !fact.units || !fact.units[units]) continue;
          
          const values = fact.units[units];
          if (!values || values.length === 0) continue;
          
          // Filter for ANNUAL 10-K data only
          const annualValues = values.filter(v => {
            const isAnnual = v.form && (v.form === '10-K' || v.form === '10-K/A');
            const isFullYear = v.fp === 'FY';
            const hasValidValue = v.val !== null && v.val !== undefined && !isNaN(v.val);
            const hasEndDate = v.end;
            const year = v.end ? new Date(v.end).getFullYear() : 0;
            const isRecent = year >= minYear;
            
            return isAnnual && isFullYear && hasValidValue && hasEndDate && isRecent;
          });
          
          if (annualValues.length === 0) continue;
          
          // Sort by end date (most recent first)
          annualValues.sort((a, b) => new Date(b.end) - new Date(a.end));
          
          // Get the most recent value
          const mostRecent = annualValues[0];
          const year = new Date(mostRecent.end).getFullYear();
          
          console.log(`Found ${fieldName}: ${mostRecent.val.toLocaleString()} (FY${year})`);
          
          return {
            value: mostRecent.val,
            year: year,
            endDate: mostRecent.end,
            filingDate: mostRecent.filed
          };
        }
        
        console.log(`No data found for fields: ${fieldArray.join(', ')}`);
        return null;
        
      } catch (error) {
        console.error(`Error getting value for ${fieldNames}:`, error);
        return null;
      }
    };

    // Get quarterly values for trend analysis
    const getQuarterlyValues = (fieldNames, units = 'USD', quarters = 4) => {
      try {
        const fieldArray = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
        
        for (const fieldName of fieldArray) {
          const fact = usgaap[fieldName];
          if (!fact || !fact.units || !fact.units[units]) continue;
          
          const values = fact.units[units];
          if (!values || values.length === 0) continue;
          
          // Filter for quarterly data
          const quarterlyValues = values.filter(v => {
            const isQuarterly = v.form && (v.form === '10-Q' || v.form === '10-K');
            const isQuarter = ['Q1', 'Q2', 'Q3', 'Q4', 'FY'].includes(v.fp);
            const hasValidValue = v.val !== null && v.val !== undefined && !isNaN(v.val);
            const hasEndDate = v.end;
            
            return isQuarterly && isQuarter && hasValidValue && hasEndDate;
          });
          
          if (quarterlyValues.length === 0) continue;
          
          // Sort by end date (most recent first)
          quarterlyValues.sort((a, b) => new Date(b.end) - new Date(a.end));
          
          // Get the most recent quarters
          return quarterlyValues.slice(0, quarters).map(q => ({
            value: q.val,
            period: q.fp,
            endDate: q.end,
            year: new Date(q.end).getFullYear()
          }));
        }
        
        return [];
      } catch (error) {
        console.error(`Error getting quarterly values:`, error);
        return [];
      }
    };

    console.log('\n--- Extracting Financial Data ---');

    // COMPREHENSIVE REVENUE FIELD MAPPING
    const revenueFields = [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'RevenuesNetOfInterestExpense',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'SalesRevenueGoodsNet',
      'SalesRevenueServicesNet',
      'TotalRevenues',
      'Revenue',
      'NetRevenues',
      'OperatingRevenues',
      'RevenueFromSaleOfGoods',
      'RevenueFromServices'
    ];

    const revenueData = getRecentAnnualValue(revenueFields);
    const revenue = revenueData?.value || 0;

    // COMPREHENSIVE COST FIELD MAPPING
    const costFields = [
      'CostOfGoodsAndServicesSold',
      'CostOfRevenue',
      'CostOfGoodsSold',
      'CostOfSales',
      'CostOfServices',
      'CostOfProductRevenue',
      'CostOfServiceRevenue',
      'CostOfRevenueExcludingDepreciationAndAmortization'
    ];

    const costData = getRecentAnnualValue(costFields);
    const costOfRevenue = costData?.value || 0;

    // Calculate gross profit
    const grossProfit = revenue > 0 && costOfRevenue > 0 ? revenue - costOfRevenue : null;

    // Operating expenses
    const opExpenseFields = [
      'OperatingExpenses',
      'OperatingCostsAndExpenses',
      'CostsAndExpenses',
      'SellingGeneralAndAdministrativeExpense',
      'ResearchAndDevelopmentExpense'
    ];

    const sgaData = getRecentAnnualValue(['SellingGeneralAndAdministrativeExpense', 'GeneralAndAdministrativeExpense']);
    const rdData = getRecentAnnualValue(['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost']);
    
    // Operating income
    const operatingIncomeData = getRecentAnnualValue(['OperatingIncomeLoss', 'IncomeLossFromOperations']);
    const operatingIncome = operatingIncomeData?.value || 0;

    // Net income
    const netIncomeData = getRecentAnnualValue(['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic']);
    const netIncome = netIncomeData?.value || 0;

    // Balance sheet items
    const totalAssetsData = getRecentAnnualValue(['Assets', 'TotalAssets']);
    const totalAssets = totalAssetsData?.value || 0;

    const totalLiabilitiesData = getRecentAnnualValue(['Liabilities', 'TotalLiabilities']);
    const totalLiabilities = totalLiabilitiesData?.value || 0;

    const equityData = getRecentAnnualValue(['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'TotalEquity']);
    const stockholdersEquity = equityData?.value || 0;

    const currentAssetsData = getRecentAnnualValue(['AssetsCurrent', 'CurrentAssets']);
    const currentAssets = currentAssetsData?.value || 0;

    const currentLiabilitiesData = getRecentAnnualValue(['LiabilitiesCurrent', 'CurrentLiabilities']);
    const currentLiabilities = currentLiabilitiesData?.value || 0;

    const cashData = getRecentAnnualValue([
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsAndShortTermInvestments',
      'Cash',
      'CashAndCashEquivalents'
    ]);
    const cashAndEquivalents = cashData?.value || 0;

    // Cash flow items
    const operatingCashFlowData = getRecentAnnualValue([
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByOperatingActivities',
      'CashFlowsFromOperatingActivities'
    ]);
    const operatingCashFlow = operatingCashFlowData?.value || 0;

    const investingCashFlowData = getRecentAnnualValue([
      'NetCashProvidedByUsedInInvestingActivities',
      'NetCashUsedInInvestingActivities'
    ]);
    const investingCashFlow = investingCashFlowData?.value || 0;

    const financingCashFlowData = getRecentAnnualValue([
      'NetCashProvidedByUsedInFinancingActivities',
      'NetCashUsedInFinancingActivities'
    ]);
    const financingCashFlow = financingCashFlowData?.value || 0;

    // Shares and EPS
    const sharesData = getRecentAnnualValue([
      'WeightedAverageNumberOfSharesOutstandingBasic',
      'CommonStockSharesOutstanding',
      'EntityCommonStockSharesOutstanding'
    ]);
    const sharesOutstanding = sharesData?.value || 0;

    const epsData = getRecentAnnualValue([
      'EarningsPerShareBasic',
      'EarningsPerShareDiluted',
      'BasicEarningsPerShare'
    ]);
    const earningsPerShare = epsData?.value || 0;

    // VALIDATION CHECKS
    console.log('\n--- Validation Checks ---');
    
    // Check if we have core data
    if (!revenue || revenue === 0) {
      console.warn('⚠️  Warning: No revenue data found');
    }
    
    // Validate financial relationships
    if (grossProfit !== null && operatingIncome > grossProfit) {
      console.error('❌ ERROR: Operating Income > Gross Profit (impossible!)');
      console.log(`   Operating Income: ${operatingIncome.toLocaleString()}`);
      console.log(`   Gross Profit: ${grossProfit.toLocaleString()}`);
      // Attempt to fix by recalculating
      const fixedOperatingIncome = grossProfit - (sgaData?.value || 0) - (rdData?.value || 0);
      console.log(`   Attempting fix: ${fixedOperatingIncome.toLocaleString()}`);
    }

    // Validate margins
    const grossMargin = revenue > 0 && grossProfit ? (grossProfit / revenue) * 100 : null;
    const netMargin = revenue > 0 && netIncome ? (netIncome / revenue) * 100 : null;

    if (grossMargin && netMargin && netMargin > grossMargin) {
      console.error('❌ ERROR: Net Margin > Gross Margin (impossible!)');
    }

    // Get quarterly trend data for context
    const quarterlyRevenue = getQuarterlyValues(revenueFields);
    const quarterlyNetIncome = getQuarterlyValues(['NetIncomeLoss', 'ProfitLoss']);

    // Calculate key metrics with validation
    const calculateRatio = (numerator, denominator, decimals = 2) => {
      if (!numerator || !denominator || denominator === 0) return null;
      const ratio = (numerator / denominator) * 100;
      // Sanity check for ratios
      if (ratio > 1000 || ratio < -1000) {
        console.warn(`⚠️  Unusual ratio detected: ${ratio}%`);
        return null;
      }
      return Number(ratio.toFixed(decimals));
    };

    const calculateSimpleRatio = (numerator, denominator, decimals = 2) => {
      if (!numerator || !denominator || denominator === 0) return null;
      return Number((numerator / denominator).toFixed(decimals));
    };

    // Prepare response data
    const data = {
      metadata: {
        ticker: ticker,
        cik: cik,
        dataYear: revenueData?.year || 'N/A',
        filingDate: revenueData?.filingDate || 'N/A',
        fiscalYearEnd: entityInfo.fiscalYearEnd
      },
      incomeStatement: {
        revenues: revenue,
        costOfRevenues: costOfRevenue,
        grossProfit: grossProfit,
        operatingExpenses: {
          sga: sgaData?.value || null,
          rd: rdData?.value || null,
          total: (sgaData?.value || 0) + (rdData?.value || 0) || null
        },
        operatingIncome: operatingIncome,
        netIncome: netIncome,
        earningsPerShare: earningsPerShare,
        sharesOutstanding: sharesOutstanding
      },
      balanceSheet: {
        totalAssets: totalAssets,
        currentAssets: currentAssets,
        cashAndCashEquivalents: cashAndEquivalents,
        totalLiabilities: totalLiabilities,
        currentLiabilities: currentLiabilities,
        stockholdersEquity: stockholdersEquity,
        workingCapital: currentAssets && currentLiabilities ? currentAssets - currentLiabilities : null
      },
      cashFlowStatement: {
        operatingCashFlow: operatingCashFlow,
        investingCashFlow: investingCashFlow,
        financingCashFlow: financingCashFlow,
        freeCashFlow: operatingCashFlow && investingCashFlow ? operatingCashFlow + investingCashFlow : null
      },
      keyMetrics: {
        // Profitability metrics
        grossMargin: calculateRatio(grossProfit, revenue),
        operatingMargin: calculateRatio(operatingIncome, revenue),
        netMargin: calculateRatio(netIncome, revenue),
        
        // Return metrics
        returnOnAssets: calculateRatio(netIncome, totalAssets),
        returnOnEquity: calculateRatio(netIncome, stockholdersEquity),
        
        // Liquidity metrics
        currentRatio: calculateSimpleRatio(currentAssets, currentLiabilities),
        quickRatio: calculateSimpleRatio((currentAssets - (currentAssets * 0.3)), currentLiabilities), // Approximation
        
        // Leverage metrics
        debtToEquity: calculateSimpleRatio((totalLiabilities - currentLiabilities), stockholdersEquity),
        debtToAssets: calculateRatio((totalLiabilities - currentLiabilities), totalAssets),
        
        // Efficiency metrics
        assetTurnover: calculateSimpleRatio(revenue, totalAssets),
        
        // Valuation metrics (if we had market cap)
        priceToEarnings: null, // Would need stock price
        priceToBook: null, // Would need market cap
        
        // Per share metrics
        bookValuePerShare: sharesOutstanding > 0 ? (stockholdersEquity / sharesOutstanding).toFixed(2) : null,
        revenuePerShare: sharesOutstanding > 0 ? (revenue / sharesOutstanding).toFixed(2) : null
      },
      trends: {
        quarterlyRevenue: quarterlyRevenue,
        quarterlyNetIncome: quarterlyNetIncome
      }
    };

    // Final validation summary
    console.log('\n--- Final Data Summary ---');
    console.log(`Revenue: $${(revenue / 1e9).toFixed(2)}B`);
    console.log(`Gross Profit: $${(grossProfit / 1e9).toFixed(2)}B (${data.keyMetrics.grossMargin}%)`);
    console.log(`Operating Income: $${(operatingIncome / 1e9).toFixed(2)}B`);
    console.log(`Net Income: $${(netIncome / 1e9).toFixed(2)}B (${data.keyMetrics.netMargin}%)`);
    console.log(`Total Assets: $${(totalAssets / 1e9).toFixed(2)}B`);
    console.log(`Stockholders Equity: $${(stockholdersEquity / 1e9).toFixed(2)}B`);
    console.log(`ROE: ${data.keyMetrics.returnOnEquity}%`);
    
    // Add data quality score
    const dataQuality = {
      score: 0,
      issues: []
    };
    
    if (revenue > 0) dataQuality.score += 25;
    else dataQuality.issues.push('Missing revenue data');
    
    if (grossProfit !== null && grossProfit > 0) dataQuality.score += 25;
    else dataQuality.issues.push('Missing or invalid gross profit');
    
    if (totalAssets > 0) dataQuality.score += 25;
    else dataQuality.issues.push('Missing balance sheet data');
    
    if (operatingCashFlow !== 0) dataQuality.score += 25;
    else dataQuality.issues.push('Missing cash flow data');
    
    // Check for logical consistency
    if (grossProfit && operatingIncome && operatingIncome <= grossProfit) {
      dataQuality.score += 10;
    } else {
      dataQuality.issues.push('Inconsistent profitability metrics');
    }
    
    if (grossMargin && netMargin && netMargin <= grossMargin) {
      dataQuality.score += 10;
    } else {
      dataQuality.issues.push('Inconsistent margin calculations');
    }
    
    data.dataQuality = dataQuality;

    console.log(`\nData Quality Score: ${dataQuality.score}/110`);
    if (dataQuality.issues.length > 0) {
      console.log('Issues:', dataQuality.issues.join(', '));
    }

    res.status(200).json(data);

  } catch (error) {
    console.error('SEC API Error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch SEC data', 
      error: error.message 
    });
  }
}
