// Get detailed company information from SEC
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { cik } = req.query;

  if (!cik) {
    return res.status(400).json({ message: 'CIK required' });
  }

  try {
    const headers = {
      'User-Agent': 'SEC Converter support@example.com',
      'Accept': 'application/json'
    };

    // Get company submissions for additional info
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`;
    const submissionsResponse = await fetch(submissionsUrl, { headers });
    
    if (!submissionsResponse.ok) {
      throw new Error(`SEC Submissions API error: ${submissionsResponse.status}`);
    }
    
    const submissionsData = await submissionsResponse.json();

    // Extract company details
    const companyInfo = {
      name: submissionsData.name,
      cik: cik,
      sic: submissionsData.sic,
      sicDescription: submissionsData.sicDescription,
      category: submissionsData.category,
      fiscalYearEnd: submissionsData.fiscalYearEnd,
      stateOfIncorporation: submissionsData.stateOfIncorporation,
      businessAddress: {
        street1: submissionsData.addresses?.business?.street1,
        street2: submissionsData.addresses?.business?.street2,
        city: submissionsData.addresses?.business?.city,
        stateOrCountry: submissionsData.addresses?.business?.stateOrCountry,
        zipCode: submissionsData.addresses?.business?.zipCode
      },
      phone: submissionsData.phone,
      // Get most recent 10-K filing
      recentFilings: submissionsData.filings?.recent?.accessionNumber?.slice(0, 5) || []
    };

    res.status(200).json(companyInfo);

  } catch (error) {
    console.error('Company Info Error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch company info', 
      error: error.message 
    });
  }
}
