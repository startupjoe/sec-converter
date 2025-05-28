import React, { useState, useEffect, useCallback } from 'react';
import { 
  Download, AlertCircle, CheckCircle, Loader, Search, 
  FileSpreadsheet, Building2, TrendingUp,
  Database, Zap, Shield, Activity, Target, BarChart,
  AlertTriangle
} from 'lucide-react';

const SECConverter = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [recentDownloads, setRecentDownloads] = useState([]);
  const [dataQuality, setDataQuality] = useState(null);

  // Debounced search function
  const searchCompanies = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/search-companies?query=${encodeURIComponent(query)}`);
      if (response.ok) {
        const results = await response.json();
        setSearchResults(results);
      } else {
        console.error('Search failed');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchCompanies(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchCompanies]);

  // Enhanced company selection
  const selectCompany = async (company) => {
    setSelectedCompany(company);
    setSearchQuery(company.ticker);
    setSearchResults([]);
    setDataQuality(null);

    // Get additional company info
    try {
      const response = await fetch(`/api/company-info?cik=${company.cik}`);
      if (response.ok) {
        const detailedInfo = await response.json();
        setSelectedCompany({ ...company, ...detailedInfo });
      }
    } catch (error) {
      console.error('Failed to fetch company details:', error);
    }
  };

  // Format large numbers
  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (absNum >= 1e9) {
      return `${sign}$${(absNum / 1e9).toFixed(2)}B`;
    } else if (absNum >= 1e6) {
      return `${sign}$${(absNum / 1e6).toFixed(2)}M`;
    } else if (absNum >= 1e3) {
      return `${sign}$${(absNum / 1e3).toFixed(2)}K`;
    } else {
      return `${sign}$${absNum.toFixed(2)}`;
    }
  };

  // Enhanced SEC data processing
  const processCompanyData = async () => {
    if (!selectedCompany) {
      setError('Please select a company first');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setAnalysisProgress(0);
    setDataQuality(null);

    const steps = [
      'Validating company information...',
      'Connecting to SEC EDGAR database...',
      'Downloading latest 10-K filing...',
      'Extracting financial statements...',
      'Processing income statement...',
      'Processing balance sheet...',
      'Processing cash flow statement...',
      'Calculating financial ratios...',
      'Validating data accuracy...',
      'Generating Excel workbook...'
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(steps[i]);
        setAnalysisProgress(((i + 1) / steps.length) * 100);

        if (i === 3) {
          // Actual SEC data extraction
          const response = await fetch(`/api/sec-data?ticker=${selectedCompany.ticker}&cik=${selectedCompany.cik}`);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch SEC data: ${response.status}`);
          }

          const secData = await response.json();
          
          // Check data quality
          if (secData.dataQuality) {
            setDataQuality(secData.dataQuality);
            
            if (secData.dataQuality.score < 50) {
              throw new Error('Data quality too low. Please try another company or report this issue.');
            }
          }

          // Generate Excel content
          const excelContent = generateEnhancedExcel(selectedCompany, secData);

          // Download file
          const blob = new Blob([excelContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', `${selectedCompany.ticker}_SEC_Financial_Data_${new Date().toISOString().split('T')[0]}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Track download
          const newDownload = {
            id: Date.now(),
            ticker: selectedCompany.ticker,
            company: selectedCompany.name,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            dataYear: secData.metadata?.dataYear || 'N/A',
            dataQuality: secData.dataQuality?.score || 0
          };

          setRecentDownloads(prev => [newDownload, ...prev.slice(0, 9)]);
          setSuccess(`✅ Successfully extracted SEC data for ${selectedCompany.ticker} (${selectedCompany.name})!`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 600));
      }

    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      setAnalysisProgress(0);
      setCurrentStep('');
    }
  };

  // Enhanced Excel generation with validated data
  const generateEnhancedExcel = (company, secData) => {
    const { metadata, incomeStatement, balanceSheet, cashFlowStatement, keyMetrics } = secData;
    
    let content = '';

    // Header with metadata
    content += `SEC 10-K FINANCIAL DATA EXTRACT\n`;
    content += `Company: ${company.name}\n`;
    content += `Ticker: ${company.ticker}\n`;
    content += `CIK: ${company.cik}\n`;
    content += `Industry: ${company.sicDescription || 'N/A'}\n`;
    content += `State of Incorporation: ${company.stateOfIncorporation || 'N/A'}\n`;
    content += `Fiscal Year End: ${company.fiscalYearEnd || 'N/A'}\n`;
    content += `Data Year: ${metadata?.dataYear || 'N/A'}\n`;
    content += `Filing Date: ${metadata?.filingDate || 'N/A'}\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `Data Quality Score: ${secData.dataQuality?.score || 'N/A'}/110\n\n`;

    // Income Statement
    content += `INCOME STATEMENT (in USD)\n`;
    content += `Revenue,${incomeStatement?.revenues?.toLocaleString() || 'N/A'}\n`;
    content += `Cost of Revenue,${incomeStatement?.costOfRevenues?.toLocaleString() || 'N/A'}\n`;
    content += `Gross Profit,${incomeStatement?.grossProfit?.toLocaleString() || 'N/A'}\n`;
    
    if (incomeStatement?.operatingExpenses) {
      content += `Selling General & Admin,${incomeStatement.operatingExpenses.sga?.toLocaleString() || 'N/A'}\n`;
      content += `Research & Development,${incomeStatement.operatingExpenses.rd?.toLocaleString() || 'N/A'}\n`;
      content += `Total Operating Expenses,${incomeStatement.operatingExpenses.total?.toLocaleString() || 'N/A'}\n`;
    }
    
    content += `Operating Income,${incomeStatement?.operatingIncome?.toLocaleString() || 'N/A'}\n`;
    content += `Net Income,${incomeStatement?.netIncome?.toLocaleString() || 'N/A'}\n`;
    content += `Earnings Per Share,$${incomeStatement?.earningsPerShare || 'N/A'}\n`;
    content += `Shares Outstanding,${incomeStatement?.sharesOutstanding?.toLocaleString() || 'N/A'}\n\n`;

    // Balance Sheet
    content += `BALANCE SHEET (in USD)\n`;
    content += `ASSETS\n`;
    content += `Current Assets,${balanceSheet?.currentAssets?.toLocaleString() || 'N/A'}\n`;
    content += `Cash and Cash Equivalents,${balanceSheet?.cashAndCashEquivalents?.toLocaleString() || 'N/A'}\n`;
    content += `Total Assets,${balanceSheet?.totalAssets?.toLocaleString() || 'N/A'}\n`;
    content += `\n`;
    content += `LIABILITIES\n`;
    content += `Current Liabilities,${balanceSheet?.currentLiabilities?.toLocaleString() || 'N/A'}\n`;
    content += `Total Liabilities,${balanceSheet?.totalLiabilities?.toLocaleString() || 'N/A'}\n`;
    content += `\n`;
    content += `EQUITY\n`;
    content += `Stockholders Equity,${balanceSheet?.stockholdersEquity?.toLocaleString() || 'N/A'}\n`;
    content += `Working Capital,${balanceSheet?.workingCapital?.toLocaleString() || 'N/A'}\n\n`;

    // Cash Flow Statement
    content += `CASH FLOW STATEMENT (in USD)\n`;
    content += `Operating Cash Flow,${cashFlowStatement?.operatingCashFlow?.toLocaleString() || 'N/A'}\n`;
    content += `Investing Cash Flow,${cashFlowStatement?.investingCashFlow?.toLocaleString() || 'N/A'}\n`;
    content += `Financing Cash Flow,${cashFlowStatement?.financingCashFlow?.toLocaleString() || 'N/A'}\n`;
    content += `Free Cash Flow,${cashFlowStatement?.freeCashFlow?.toLocaleString() || 'N/A'}\n\n`;

    // Financial Ratios
    content += `FINANCIAL RATIOS\n`;
    content += `PROFITABILITY\n`;
    content += `Gross Margin %,${keyMetrics?.grossMargin || 'N/A'}\n`;
    content += `Operating Margin %,${keyMetrics?.operatingMargin || 'N/A'}\n`;
    content += `Net Profit Margin %,${keyMetrics?.netMargin || 'N/A'}\n`;
    content += `Return on Assets %,${keyMetrics?.returnOnAssets || 'N/A'}\n`;
    content += `Return on Equity %,${keyMetrics?.returnOnEquity || 'N/A'}\n`;
    content += `\n`;
    content += `LIQUIDITY\n`;
    content += `Current Ratio,${keyMetrics?.currentRatio || 'N/A'}\n`;
    content += `Quick Ratio,${keyMetrics?.quickRatio || 'N/A'}\n`;
    content += `\n`;
    content += `LEVERAGE\n`;
    content += `Debt to Equity,${keyMetrics?.debtToEquity || 'N/A'}\n`;
    content += `Debt to Assets %,${keyMetrics?.debtToAssets || 'N/A'}\n`;
    content += `\n`;
    content += `EFFICIENCY\n`;
    content += `Asset Turnover,${keyMetrics?.assetTurnover || 'N/A'}\n`;
    content += `\n`;
    content += `PER SHARE METRICS\n`;
    content += `Book Value per Share,$${keyMetrics?.bookValuePerShare || 'N/A'}\n`;
    content += `Revenue per Share,$${keyMetrics?.revenuePerShare || 'N/A'}\n\n`;

    // Quarterly Trends
    if (secData.trends && secData.trends.quarterlyRevenue && secData.trends.quarterlyRevenue.length > 0) {
      content += `QUARTERLY REVENUE TREND\n`;
      secData.trends.quarterlyRevenue.forEach(q => {
        content += `${q.period} ${q.year},${q.value?.toLocaleString() || 'N/A'}\n`;
      });
      content += `\n`;
    }

    // Company Address
    if (company.businessAddress) {
      content += `BUSINESS ADDRESS\n`;
      content += `${company.businessAddress.street1 || ''}\n`;
      if (company.businessAddress.street2) {
        content += `${company.businessAddress.street2}\n`;
      }
      content += `${company.businessAddress.city || ''}, ${company.businessAddress.stateOrCountry || ''} ${company.businessAddress.zipCode || ''}\n`;
      content += `Phone: ${company.phone || 'N/A'}\n\n`;
    }

    // Data quality notes
    if (secData.dataQuality && secData.dataQuality.issues.length > 0) {
      content += `DATA QUALITY NOTES\n`;
      secData.dataQuality.issues.forEach(issue => {
        content += `- ${issue}\n`;
      });
      content += `\n`;
    }

    content += `Data Source: SEC EDGAR Database (XBRL)\n`;
    content += `Generated by: Universal SEC 10-K Converter\n`;

    return content;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-2 shadow-lg">
                <FileSpreadsheet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Universal SEC 10-K Converter</h1>
                <p className="text-xs text-gray-500">Search ANY Public Company • Real SEC Data • Free Forever</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Extract SEC Data from
            <span className="block text-blue-600">ANY Public Company</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Search over 10,000+ public companies. Get real financial data from SEC 10-K filings instantly.
          </p>
          
          <div className="flex items-center justify-center space-x-8 text-sm text-gray-500 mb-8">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Real SEC Data</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>10,000+ Companies</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Instant Excel Download</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>100% Free</span>
            </div>
          </div>
        </div>

        {/* Enhanced Search */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-16 border border-gray-200">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Universal Company Search</h2>
            <p className="text-gray-600">Search by ticker symbol or company name</p>
          </div>
          
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any company... (e.g., Apple, TSLA, Microsoft, AMZN)"
                className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
              {searchLoading && (
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                  <Loader className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              )}
            </div>
            
            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                {searchResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => selectCompany(result)}
                    className="w-full p-4 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">{result.ticker}</div>
                        <div className="text-gray-700">{result.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">CIK: {result.cik}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Company */}
            {selectedCompany && (
              <div className="mt-4 bg-blue-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center space-x-3">
                  <Building2 className="w-8 h-8 text-blue-600" />
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900">{selectedCompany.name}</h3>
                    <p className="text-sm text-gray-600">{selectedCompany.sicDescription || 'Public Company'}</p>
                    <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                      <span>Ticker: {selectedCompany.ticker}</span>
                      <span>CIK: {selectedCompany.cik}</span>
                      {selectedCompany.stateOfIncorporation && (
                        <span>Inc: {selectedCompany.stateOfIncorporation}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Progress */}
            {loading && (
              <div className="mt-6 bg-blue-50 rounded-xl p-6 border border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-blue-900 font-semibold">Processing SEC Filing</span>
                  <span className="text-blue-600 font-bold">{Math.round(analysisProgress)}%</span>
                </div>
                
                <div className="w-full bg-blue-200 rounded-full h-3 mb-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${analysisProgress}%` }}
                  ></div>
                </div>
                
                <div className="flex items-center space-x-2 text-blue-700">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{currentStep}</span>
                </div>
              </div>
            )}
            
            {/* Data Quality Indicator */}
            {dataQuality && !loading && (
              <div className="mt-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {dataQuality.score >= 80 ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : dataQuality.score >= 50 ? (
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-semibold text-gray-700">Data Quality Score</span>
                  </div>
                  <span className={`font-bold ${
                    dataQuality.score >= 80 ? 'text-green-600' : 
                    dataQuality.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {dataQuality.score}/110
                  </span>
                </div>
                {dataQuality.issues.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    <p className="font-medium">Data limitations:</p>
                    <ul className="list-disc list-inside">
                      {dataQuality.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Extract Button */}
            <button
              onClick={processCompanyData}
              disabled={loading || !selectedCompany}
              className="w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center justify-center space-x-3 text-lg font-semibold transition-all duration-200 shadow-lg"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Extracting Data...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Extract SEC Data to Excel</span>
                </>
              )}
            </button>
            
            <p className="text-center text-sm text-gray-500 mt-3">
              10,000+ companies available • Real SEC EDGAR data • No registration required
            </p>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="mt-6 max-w-2xl mx-auto p-4 bg-red-50 border-l-4 border-red-400 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-400 mr-3" />
                <span className="text-red-700">{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="mt-6 max-w-2xl mx-auto p-4 bg-green-50 border-l-4 border-green-400 rounded-lg">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                <span className="text-green-700">{success}</span>
              </div>
            </div>
          )}
        </div>

        {/* Recent Downloads */}
        {recentDownloads.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-16 border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Recent Downloads</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentDownloads.map((download) => (
                <div key={download.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center space-x-3 mb-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-semibold text-gray-900">{download.ticker}</div>
                      <div className="text-sm text-gray-500 truncate">{download.company}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>FY {download.dataYear}</span>
                    <span>{download.date}</span>
                  </div>
                  <div className="mt-1">
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">Quality:</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            download.dataQuality >= 80 ? 'bg-green-500' :
                            download.dataQuality >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${(download.dataQuality / 110) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-600">{download.dataQuality}/110</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Features Grid */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-16 border border-gray-200">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">What You Get</h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <div className="flex items-center space-x-3 mb-3">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                <h4 className="font-semibold text-gray-900">Income Statement</h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Revenue & expenses</li>
                <li>• Gross & operating profit</li>
                <li>• Net income & EPS</li>
                <li>• Operating metrics</li>
              </ul>
            </div>
            
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <div className="flex items-center space-x-3 mb-3">
                <BarChart className="w-6 h-6 text-green-600" />
                <h4 className="font-semibold text-gray-900">Balance Sheet</h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Assets & liabilities</li>
                <li>• Cash position</li>
                <li>• Working capital</li>
                <li>• Stockholders equity</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <div className="flex items-center space-x-3 mb-3">
                <Activity className="w-6 h-6 text-purple-600" />
                <h4 className="font-semibold text-gray-900">Cash Flow</h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Operating cash flow</li>
                <li>• Investment activities</li>
                <li>• Financing activities</li>
                <li>• Free cash flow</li>
              </ul>
            </div>
            
            <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-200">
              <div className="flex items-center space-x-3 mb-3">
                <Target className="w-6 h-6 text-yellow-600" />
                <h4 className="font-semibold text-gray-900">Financial Ratios</h4>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Profitability metrics</li>
                <li>• Liquidity ratios</li>
                <li>• Leverage metrics</li>
                <li>• Efficiency ratios</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Data Accuracy Notice</p>
                <p>We extract data directly from SEC XBRL filings. Different companies use different accounting field names, which may occasionally result in missing or incomplete data. We continuously improve our extraction algorithms.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500">
          <p className="mb-2">✅ Over 10,000 Public Companies ✅ Real SEC EDGAR Data ✅ Instant Excel Downloads</p>
          <p className="text-sm">
            Popular searches: AAPL, TSLA, AMZN, GOOGL, MSFT, NVDA, META, JPM, JNJ, V, WMT, HD, PG, BAC, KO, DIS, NFLX, CRM, ORCL
          </p>
        </div>
      </div>
    </div>
  );
};

export default SECConverter;
