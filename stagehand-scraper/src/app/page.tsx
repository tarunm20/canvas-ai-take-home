'use client';

import { useState } from 'react';

interface CompanyData {
  name: string;
  phone: string;
  principal_contact: string;
  url: string;
  address: string;
  accreditation: string;
}

interface ScrapeResponse {
  success: boolean;
  data?: CompanyData[];
  totalCompanies?: number;
  executionTime?: number;
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
  const [maxPages, setMaxPages] = useState(2);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [targetUrl, setTargetUrl] = useState('');
  const [extractionInstructions, setExtractionInstructions] = useState('');

  const handleScrape = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const requestBody: any = {
        maxPages,
        format,
      };

      if (targetUrl.trim()) {
        requestBody.targetUrl = targetUrl.trim();
      }

      if (extractionInstructions.trim()) {
        requestBody.extractionInstructions = extractionInstructions.trim();
      }

      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (format === 'csv') {
        // Handle CSV download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'companies.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setResult({ success: true, totalCompanies: 0 }); // We don't know count for CSV
      } else {
        // Handle JSON response
        const data = await response.json();
        setResult(data);
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Phase B - Stagehand AI Web Scraper
          </h1>
          
          <div className="mb-8">
            <p className="text-gray-600 mb-4">
              AI-powered Stagehand automation that can scrape any website using natural language instructions. 
              Leave URL empty for BBB medical billing default, or provide custom URLs and extraction instructions.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800 text-sm">
                <strong>Phase B Features:</strong> Custom URLs • Natural language instructions • Multi-page pagination • CSV/JSON export • LLM-driven automation
              </p>
            </div>
          </div>

          <div className="space-y-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Pages to Scrape
                </label>
                <input
                  type="number"
                  value={maxPages}
                  onChange={(e) => setMaxPages(parseInt(e.target.value) || 1)}
                  min="1"
                  max="15"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Number of pages to scrape (1-15)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Output Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="json">JSON (View Results)</option>
                  <option value="csv">CSV (Download File)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target URL (Optional)
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/companies (leave empty for BBB medical billing default)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Custom URL to scrape. Defaults to BBB medical billing search if empty.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Extraction Instructions (Optional)
              </label>
              <textarea
                value={extractionInstructions}
                onChange={(e) => setExtractionInstructions(e.target.value)}
                placeholder="Custom natural language instructions for what data to extract (e.g., 'Find all companies and extract their names, phone numbers, and addresses')"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Natural language instructions for Stagehand. Uses optimized prompts if empty.
              </p>
            </div>
          </div>

          <button
            onClick={handleScrape}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-6 rounded-md transition-colors"
          >
            {isLoading ? 'AI Scraping in Progress...' : 'Start AI Scraping'}
          </button>

          {isLoading && (
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
                <p className="text-blue-700">
                  Using AI-powered Stagehand to scrape {targetUrl || 'BBB medical billing companies'}... 
                  This may take 1-3 minutes depending on pages requested.
                </p>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-8">
              {result.success ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">
                      ✅ Phase B Scraping Completed Successfully!
                    </h3>
                    {result.totalCompanies !== undefined && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Companies Found:</span> {result.totalCompanies}
                        </div>
                        <div>
                          <span className="font-medium">Execution Time:</span> {result.executionTime ? Math.round(result.executionTime / 1000) : 'N/A'}s
                        </div>
                        <div>
                          <span className="font-medium">Pages Scraped:</span> {result.metadata?.maxPages}
                        </div>
                        <div>
                          <span className="font-medium">LLM Calls:</span> {result.metadata?.llmCalls || 'N/A'}
                        </div>
                      </div>
                    )}
                    {format === 'csv' && (
                      <p className="text-green-700 text-sm mt-2">
                        CSV file has been downloaded to your computer.
                      </p>
                    )}
                  </div>

                  {result.data && format === 'json' && (
                    <div className="border border-gray-200 rounded-md">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <h4 className="font-medium text-gray-900">Company Data ({result.data.length} companies)</h4>
                        {result.metadata?.targetUrl && (
                          <p className="text-xs text-gray-600 mt-1">Source: {result.metadata.targetUrl}</p>
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Accreditation</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {result.data.slice(0, 20).map((company, index) => (
                              <tr key={index}>
                                <td className="px-4 py-2 text-sm">
                                  <div>
                                    <div className="font-medium text-gray-900">{company.name}</div>
                                    {company.url !== 'N/A' && (
                                      <a href={company.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                                        View Profile
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">{company.phone}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{company.principal_contact}</td>
                                <td className="px-4 py-2 text-sm">
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    company.accreditation === 'Accredited' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {company.accreditation}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">{company.address}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {result.data.length > 20 && (
                          <div className="px-4 py-2 text-sm text-gray-500 bg-gray-50">
                            Showing first 20 of {result.data.length} companies. Use CSV export to get all data.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <h3 className="text-lg font-semibold text-red-800 mb-2">
                    ❌ Phase B Scraping Failed
                  </h3>
                  <p className="text-red-700 text-sm mb-2">
                    <strong>Error:</strong> {result.error}
                  </p>
                  {result.details && (
                    <p className="text-red-600 text-xs">
                      <strong>Details:</strong> {result.details}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}