import { NextRequest, NextResponse } from 'next/server';
import { PhaseBScraper } from '@/lib/phase-b-scraper';

interface ScrapeRequestBody {
  targetUrl?: string;
  maxPages?: number;
  format?: 'json' | 'csv';
  extractionInstructions?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ScrapeRequestBody = await request.json();
    const { 
      targetUrl, 
      maxPages = 1, 
      format = 'json',
      extractionInstructions 
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

    // Return JSON response
    return NextResponse.json({
      success: true,
      data: result.data,
      totalCompanies: result.totalCompanies,
      executionTime: result.executionTime,
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