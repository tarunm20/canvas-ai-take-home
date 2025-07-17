import { NextRequest, NextResponse } from 'next/server';
import { PhaseBScraper } from '@/lib/phase-b-scraper';
import { CompanyService, type SaveResult } from '@/lib/company-service';

interface ScrapeRequestBody {
  targetUrl?: string;
  maxPages?: number;
  format?: 'json' | 'csv';
  extractionInstructions?: string;
  saveToDatabase?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: ScrapeRequestBody = await request.json();
    const { 
      targetUrl, 
      maxPages = 1, 
      format = 'json',
      extractionInstructions,
      saveToDatabase = true 
    } = body;

    console.log('Starting Phase B Stagehand scraper with params:', { targetUrl, maxPages, format, hasCustomInstructions: !!extractionInstructions });

    // Validate API configuration
    const apiValidation = PhaseBScraper.validateApiKeyAccess();
    if (!apiValidation.valid) {
      return NextResponse.json(
        { error: `OpenAI API configuration error: ${apiValidation.error}` },
        { status: 500 }
      );
    }

    const scraper = new PhaseBScraper();
    
    let result;
    if (targetUrl) {
      // Use custom URL with general scraper
      result = await scraper.scrape({
        targetUrl,
        maxPages,
        extractionInstructions
      });
    } else {
      // Use BBB-optimized scraper with default URL and instructions
      result = await scraper.scrapeBBB(maxPages);
    }

    if (!result.success) {
      console.error('Scraper failed:', result.error);
      return NextResponse.json(
        { 
          error: 'Stagehand scraping failed', 
          details: result.error 
        },
        { status: 500 }
      );
    }

    console.log(`Scraper succeeded: ${result.totalCompanies} companies found`);

    // Save to database if requested and get consolidated data
    let saveResult: SaveResult | null = null;
    let consolidatedData: any[] = result.data || [];
    
    if (saveToDatabase && result.data && result.data.length > 0) {
      try {
        const metadata = {
          sourceUrl: result.metadata?.targetUrl || targetUrl || 'Unknown',
          pageCount: result.metadata?.maxPages || maxPages,
          totalCompanies: result.totalCompanies || 0,
          executionTime: result.executionTime || 0,
        };

        console.log('Saving companies to database with duplicate prevention...');
        saveResult = await CompanyService.saveCompanies(result.data, metadata);
        console.log(`Database save result: ${saveResult.savedCompanies.length} saved, ${saveResult.duplicatesSkipped} skipped, ${saveResult.duplicatesUpdated} updated`);
        
        // Get the database records for companies from the current scrape session only
        const scrapedCompanyNames = result.data.map(c => c.name);
        const { companies: currentSessionCompanies } = await CompanyService.getCompaniesByNames(scrapedCompanyNames);
        
        // Convert database companies from current session to frontend format for display
        consolidatedData = currentSessionCompanies.map(company => ({
          name: company.name,
          phone: company.phones?.[0] || 'N/A',
          principal_contact: company.principal_contacts?.[0] || 'N/A',
          url: company.urls?.[0] || 'N/A',
          address: company.addresses?.[0] || 'N/A',
          accreditation: company.accreditation || 'Unknown'
        }));
        
        console.log(`Returning ${consolidatedData.length} database records from current scrape session`);
      } catch (dbError) {
        console.error('Database save failed:', dbError);
        // Continue without failing the entire request
      }
    }

    // Handle CSV format response
    if (format === 'csv') {
      const csvContent = jsonToCsv(result.data || []);
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="companies.csv"'
        }
      });
    }

    // Return JSON response with consolidated data
    return NextResponse.json({
      success: true,
      data: consolidatedData,
      totalCompanies: consolidatedData.length,
      originalTotalCompanies: result.totalCompanies,
      executionTime: result.executionTime,
      savedToDatabase: !!saveResult,
      savedCount: saveResult?.savedCompanies.length || 0,
      duplicatesSkipped: saveResult?.duplicatesSkipped || 0,
      duplicatesUpdated: saveResult?.duplicatesUpdated || 0,
      totalProcessed: saveResult?.totalProcessed || 0,
      metadata: {
        ...result.metadata,
        format,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Phase B BBB Scraper API - Powered by Stagehand',
    description: 'AI-driven web scraping with natural language instructions',
    endpoints: {
      POST: '/api/scrape',
      description: 'Run the Stagehand automation scraper',
      parameters: {
        targetUrl: 'string (optional) - URL to scrape. Defaults to BBB medical billing search',
        maxPages: 'number (default: 1) - Number of pages to scrape (1-15)',
        format: 'string (default: json) - Output format: json or csv',
        extractionInstructions: 'string (optional) - Custom natural language instructions for extraction'
      }
    },
    examples: {
      bbbDefault: {
        method: 'POST',
        body: {
          maxPages: 2,
          format: 'json'
        }
      },
      customSite: {
        method: 'POST',
        body: {
          targetUrl: 'https://example.com/companies',
          maxPages: 3,
          format: 'json',
          extractionInstructions: 'Extract company names, addresses, and phone numbers from each listing'
        }
      },
      csvExport: {
        method: 'POST',
        body: {
          maxPages: 5,
          format: 'csv'
        }
      }
    },
    phaseBFeatures: [
      'Accepts custom URLs (not hardcoded to BBB)',
      'Natural language extraction instructions',
      'Multi-page pagination support',
      'CSV and JSON output formats',
      'LLM-driven automation that adapts to different sites'
    ]
  });
}

function jsonToCsv(data: Array<Record<string, string>>): string {
  if (data.length === 0) return '';
  
  const headers = ['name', 'phone', 'principal_contact', 'url', 'address', 'accreditation'];
  const csvRows = [headers.join(',')];
  
  data.forEach(item => {
    const row = headers.map(header => {
      const value = item[header] || '';
      // Escape quotes and wrap in quotes if contains comma
      const escaped = value.toString().replace(/"/g, '""');
      return escaped.includes(',') ? `"${escaped}"` : escaped;
    });
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}