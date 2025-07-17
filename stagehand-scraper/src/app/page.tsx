'use client';

import { useState, useEffect } from 'react';

interface CompanyData {
  name: string;
  phone: string;
  principal_contact: string;
  url: string;
  address: string;
  accreditation: string;
}

// Database company interface (with arrays)
interface DatabaseCompany {
  id: string;
  name: string;
  phones: string[] | null;
  principal_contacts: string[] | null;
  urls: string[] | null;
  addresses: string[] | null;
  accreditation: string | null;
  scraped_at: string;
  source_url: string | null;
  page_count: number | null;
}

interface ScrapeResponse {
  success: boolean;
  data?: CompanyData[];
  totalCompanies?: number;
  originalTotalCompanies?: number;
  executionTime?: number;
  savedToDatabase?: boolean;
  savedCount?: number;
  duplicatesSkipped?: number;
  duplicatesUpdated?: number;
  totalProcessed?: number;
  metadata?: {
    targetUrl: string;
    maxPages: number;
    llmCalls: number;
    model: string;
    format: string;
    timestamp: string;
  };
  error?: string;
  details?: string;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResponse | null>(null);

  // Helper functions to format arrays for display
  const formatArrayForDisplay = (array: string[] | null, maxItems: number = 2): string => {
    if (!array || array.length === 0) return 'N/A';
    
    if (array.length <= maxItems) {
      return array.join(', ');
    } else {
      return `${array.slice(0, maxItems).join(', ')} (+${array.length - maxItems} more)`;
    }
  };

  const formatArrayForCSV = (array: string[] | null): string => {
    if (!array || array.length === 0) return '';
    return array.join('; ');
  };

  const getLocationCount = (addresses: string[] | null): number => {
    return addresses ? addresses.length : 0;
  };
  const [maxPages, setMaxPages] = useState(2);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [targetUrl, setTargetUrl] = useState('');
  const [progressStatus, setProgressStatus] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [activeTab, setActiveTab] = useState<'scraper' | 'database'>('scraper');
  const [saveToDatabase] = useState(true);
  const [databaseCompanies, setDatabaseCompanies] = useState<DatabaseCompany[]>([]);
  const [databaseStats, setDatabaseStats] = useState<{
    totalCompanies: number;
    lastScrapedAt: string | null;
    uniqueSources: number;
  } | null>(null);
  const [loadingDatabase, setLoadingDatabase] = useState(false);

  const handleScrape = async () => {
    setIsLoading(true);
    setResult(null);
    setProgressStatus('');
    setProgressPercent(0);

    // Simulate progress updates based on typical scraping flow
    const simulateProgress = () => {
      const phases: { status: string; percent: number; duration: number }[] = [];
      
      // Add initialization
      phases.push({ status: 'Initializing scraper...', percent: 0, duration: 2000 });
      
      // Add page processing phases (20% of total work) - this is quick
      for (let i = 1; i <= maxPages; i++) {
        const progress = (i / maxPages) * 20;
        phases.push({ 
          status: `Processing page ${i} of ${maxPages}...`, 
          percent: Math.round(progress),
          duration: 1500 // Quick page processing
        });
      }
      
      // Add enhancement phases (75% of total work) - this takes the longest
      const estimatedBatches = Math.max(3, Math.ceil(maxPages * 3)); // More batches since this is the slow part
      for (let i = 1; i <= estimatedBatches; i++) {
        const progress = 20 + (i / estimatedBatches) * 75;
        phases.push({ 
          status: `Enhancing companies: batch ${i} of ${estimatedBatches}...`, 
          percent: Math.round(progress),
          duration: 4000 // Slow enhancement processing
        });
      }
      
      // Add finalization
      phases.push({ status: 'Finalizing results...', percent: 95, duration: 1000 });

      let currentPhase = 0;
      
      const runNextPhase = () => {
        if (currentPhase < phases.length) {
          const phase = phases[currentPhase];
          setProgressStatus(phase.status);
          setProgressPercent(phase.percent);
          currentPhase++;
          
          setTimeout(runNextPhase, phase.duration);
        }
      };
      
      runNextPhase();
      
      // Return a cleanup function
      return () => {
        currentPhase = phases.length; // Stop the progression
      };
    };

    const stopProgress = simulateProgress();

    try {
      const requestBody: {
        maxPages: number;
        format: 'json' | 'csv';
        targetUrl?: string;
        saveToDatabase?: boolean;
      } = {
        maxPages,
        format,
        saveToDatabase,
      };

      if (targetUrl.trim()) {
        requestBody.targetUrl = targetUrl.trim();
      }

      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      stopProgress();
      setProgressStatus('Completed');
      setProgressPercent(100);

      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'companies.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setResult({ success: true, totalCompanies: 0 });
      } else {
        const data = await response.json();
        setResult(data);
      }
    } catch (error) {
      stopProgress();
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
      // Refresh database stats if we saved to database
      if (saveToDatabase && activeTab === 'database') {
        fetchDatabaseStats();
      }
    }
  };

  const fetchDatabaseStats = async () => {
    try {
      const response = await fetch('/api/companies/stats');
      const data = await response.json();
      if (data.success) {
        setDatabaseStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch database stats:', error);
    }
  };

  const fetchDatabaseCompanies = async () => {
    setLoadingDatabase(true);
    try {
      const response = await fetch('/api/companies?limit=100');
      const data = await response.json();
      if (data.success) {
        setDatabaseCompanies(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch database companies:', error);
    } finally {
      setLoadingDatabase(false);
    }
  };

  const handleDeleteAllCompanies = async () => {
    if (!confirm('Are you sure you want to delete all companies from the database?')) {
      return;
    }

    try {
      const response = await fetch('/api/companies?deleteAll=true', {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        setDatabaseCompanies([]);
        setDatabaseStats(null);
        fetchDatabaseStats();
      }
    } catch (error) {
      console.error('Failed to delete companies:', error);
    }
  };

  // Load database stats on component mount
  useEffect(() => {
    fetchDatabaseStats();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Medical Billing Scraper</h1>
          <p className="text-gray-600">AI-powered company data extraction</p>
        </div>
        
        {/* Tabs */}
        <div className="flex justify-center space-x-2 mb-8">
          <button
            onClick={() => setActiveTab('scraper')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'scraper'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-100 shadow'
            }`}
          >
            Scraper
          </button>
          <button
            onClick={() => {
              setActiveTab('database');
              if (databaseCompanies.length === 0) {
                fetchDatabaseCompanies();
              }
            }}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'database'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-100 shadow'
            }`}
          >
            Database {databaseStats && `(${databaseStats.totalCompanies})`}
          </button>
        </div>

        {activeTab === 'scraper' ? (
          <>
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-3">Extract Company Data</h2>
                <p className="text-gray-600">Scrape BBB medical billing companies or any custom website</p>
              </div>
              
              <div className="max-w-2xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pages</label>
                    <input
                      type="number"
                      value={maxPages}
                      onChange={(e) => setMaxPages(parseInt(e.target.value) || 1)}
                      min="1"
                      max="15"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    >
                      <option value="json">View Results</option>
                      <option value="csv">Download CSV</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Custom URL</label>
                    <input
                      type="url"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
                
                <div className="flex justify-center">
                  <button
                    onClick={handleScrape}
                    disabled={isLoading}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors shadow-lg disabled:shadow-none"
                  >
                    {isLoading ? 'Scraping...' : 'Start Scraping'}
                  </button>
                </div>
              </div>
            </div>

        {isLoading && (
          <div className="bg-white border border-blue-200 rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
              <p className="text-gray-700 font-medium">
                {progressStatus || 'Scraping in progress...'}
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Progress</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This may take 1-2 minutes depending on the number of pages.
              </p>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            {result.success ? (
              <>
                <div className="mb-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-green-800">Scraping Complete</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white p-3 rounded-lg border border-green-100">
                      <p className="text-sm text-green-600 font-medium">Companies Found</p>
                      <p className="text-2xl font-bold text-green-800">{result.totalCompanies}</p>
                      {result.originalTotalCompanies && result.originalTotalCompanies !== result.totalCompanies && (
                        <p className="text-xs text-amber-600">Consolidated from {result.originalTotalCompanies}</p>
                      )}
                    </div>
                    
                    <div className="bg-white p-3 rounded-lg border border-green-100">
                      <p className="text-sm text-green-600 font-medium">Execution Time</p>
                      <p className="text-2xl font-bold text-green-800">
                        {result.executionTime ? Math.round(result.executionTime / 1000) : 'N/A'}s
                      </p>
                    </div>
                    
                    {result.savedToDatabase && (
                      <div className="bg-white p-3 rounded-lg border border-green-100">
                        <p className="text-sm text-green-600 font-medium">Database</p>
                        <p className="text-2xl font-bold text-green-800">{result.savedCount}</p>
                        <p className="text-xs text-green-600">saved</p>
                      </div>
                    )}
                  </div>
                  
                  {result.savedToDatabase && ((result.duplicatesSkipped || 0) > 0 || (result.duplicatesUpdated || 0) > 0) && (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {(result.duplicatesSkipped || 0) > 0 && (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
                          {result.duplicatesSkipped} already existed (skipped)
                        </span>
                      )}
                      {(result.duplicatesUpdated || 0) > 0 && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                          {result.duplicatesUpdated} existing companies updated
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {result.data && format === 'json' && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <h3 className="font-medium text-gray-800">Results ({result.data.length})</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Company</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Phone</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Contact</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {result.data.map((company, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{company.name}</div>
                                <div className="text-sm text-gray-500">{company.address}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{company.phone}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{company.principal_contact}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  company.accreditation === 'Accredited' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {company.accreditation}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 font-medium">Error: {result.error}</p>
              </div>
            )}
          </div>
        )}
          </>
        ) : (
          // Database Tab
          <div className="space-y-6">
            {/* Database Stats */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Database Statistics</h2>
                <button
                  onClick={() => {
                    fetchDatabaseStats();
                    fetchDatabaseCompanies();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Refresh
                </button>
              </div>
              
              {databaseStats ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <p className="text-blue-600 font-medium">Total Companies</p>
                    <p className="text-blue-900 text-2xl font-bold">{databaseStats.totalCompanies}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <p className="text-green-600 font-medium">Unique Sources</p>
                    <p className="text-green-900 text-2xl font-bold">{databaseStats.uniqueSources}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                    <p className="text-purple-600 font-medium">Last Scraped</p>
                    <p className="text-purple-900 text-lg font-semibold">
                      {databaseStats.lastScrapedAt 
                        ? new Date(databaseStats.lastScrapedAt).toLocaleDateString()
                        : 'Never'
                      }
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">Loading stats...</div>
              )}
            </div>

            {/* Database Companies */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  Saved Companies ({databaseCompanies.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const csvData = databaseCompanies;
                      const headers = ['name', 'phones', 'principal_contacts', 'urls', 'addresses', 'accreditation'];
                      const csvContent = [
                        headers.join(','),
                        ...csvData.map(row => {
                          const values = [
                            row.name || '',
                            formatArrayForCSV(row.phones),
                            formatArrayForCSV(row.principal_contacts),
                            formatArrayForCSV(row.urls),
                            formatArrayForCSV(row.addresses),
                            row.accreditation || ''
                          ];
                          return values.map(value => {
                            const escaped = value.toString().replace(/"/g, '""');
                            return escaped.includes(',') || escaped.includes(';') ? `"${escaped}"` : escaped;
                          }).join(',');
                        })
                      ].join('\n');
                      
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'database-companies.csv';
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    }}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={handleDeleteAllCompanies}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Delete All
                  </button>
                </div>
              </div>

              {loadingDatabase ? (
                <div className="text-gray-500">Loading companies...</div>
              ) : databaseCompanies.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Company</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Contact</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {databaseCompanies.map((company, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                {company.name}
                                {getLocationCount(company.addresses) > 1 && (
                                  <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                    {getLocationCount(company.addresses)} locations
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {formatArrayForDisplay(company.addresses)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {formatArrayForDisplay(company.phones)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {formatArrayForDisplay(company.principal_contacts)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                company.accreditation === 'Accredited' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {company.accreditation || 'Unknown'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-center py-8">
                  No companies saved to database yet. Use the scraper to add companies.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}