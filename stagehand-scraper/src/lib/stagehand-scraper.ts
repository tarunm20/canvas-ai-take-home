import { Stagehand } from '@browserbasehq/stagehand';

export interface CompanyData {
  name: string;
  phone?: string;
  address?: string;
  url?: string;
  accreditation?: string;
  principal_contact?: string;
}

export interface StagehandScrapingOptions {
  targetUrl: string;
  maxPages?: number;
  extractionInstructions?: string;
}

export interface StagehandScrapingResult {
  success: boolean;
  data?: CompanyData[];
  totalCompanies?: number;
  executionTime: number;
  error?: string;
  metadata?: {
    targetUrl: string;
    maxPages: number;
    llmCalls: number;
    model: string;
  };
}

export class StagehandScraper {
  private stagehand: Stagehand;
  private llmCallCount = 0;

  constructor() {
    this.validateConfiguration();
    
    this.stagehand = new Stagehand({
      env: "LOCAL",
      modelName: process.env.STAGEHAND_MODEL_NAME || "openai/gpt-4o-mini",
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY,
      },
      enableCaching: false,
      headless: true,
    });
  }

  private validateConfiguration() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required. Please set it in your .env.local file.');
    }

    if (process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      throw new Error('Please replace the placeholder OPENAI_API_KEY in .env.local with your actual OpenAI API key.');
    }

    // Basic API key format validation
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey.startsWith('sk-') || apiKey.length < 50) {
      throw new Error('Invalid OPENAI_API_KEY format. OpenAI API keys should start with "sk-" and be at least 50 characters long.');
    }
  }

  static validateApiKeyAccess(): { valid: boolean; error?: string } {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return { valid: false, error: 'OPENAI_API_KEY environment variable is not set' };
      }

      if (process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
        return { valid: false, error: 'API key is still set to placeholder value' };
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey.startsWith('sk-') || apiKey.length < 50) {
        return { valid: false, error: 'API key format appears invalid' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Error validating API key configuration' };
    }
  }

  async scrape(options: StagehandScrapingOptions): Promise<StagehandScrapingResult> {
    const startTime = Date.now();
    this.llmCallCount = 0;

    try {
      await this.stagehand.init();
      const page = this.stagehand.page;
      
      // Set longer timeout for operations
      page.setDefaultTimeout(30000);

      const allCompanies: CompanyData[] = [];
      const maxPages = options.maxPages || 15;

      // Navigate to the target URL
      console.log(`Navigating to: ${options.targetUrl}`);
      await page.goto(options.targetUrl);
      this.llmCallCount++;

      for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
        console.log(`Processing page ${currentPage}/${maxPages}`);

        try {
          // Extract companies from current page using natural language
          const extractionPrompt = options.extractionInstructions || 
            `Extract all medical billing company information from this page as a JSON array. For each company, include:
             - name: The company name (string)
             - phone: Phone number (string, format as +1XXXXXXXXXX if possible)
             - address: Full address including street, city, state, zip (string)
             - url: The company's profile URL or website (string)
             - accreditation: Whether they are "Accredited" or "Non-Accredited" by BBB (string)
             - principal_contact: Main contact person name and title if available (string)
             
             Return as JSON array. Look for companies that provide medical billing services and have BBB ratings.`;

          // Use simple text extraction without complex schemas
          const textResult = await Promise.race([
            page.extract({
              instruction: extractionPrompt,
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Extraction timeout')), 25000)
            )
          ]);
          this.llmCallCount++;
          
          // Try to parse the result as JSON
          try {
            let companies: CompanyData[] = [];
            
            if (typeof textResult === 'string') {
              companies = JSON.parse(textResult);
            } else if (Array.isArray(textResult)) {
              companies = textResult as CompanyData[];
            } else if (textResult && typeof textResult === 'object') {
              // If it's a single object, wrap in array
              companies = [textResult as CompanyData];
            }
            
            if (Array.isArray(companies)) {
              console.log(`Found ${companies.length} companies on page ${currentPage}`);
              allCompanies.push(...companies);
            }
          } catch (parseError) {
            console.log(`Could not parse extraction result on page ${currentPage}:`, parseError);
            // Continue to next page even if this one fails
          }

          // Navigate to next page if not the last page
          if (currentPage < maxPages) {
            try {
              // For BBB, we can construct the URL directly for more reliable pagination
              const nextPageUrl = options.targetUrl.includes('page=') 
                ? options.targetUrl.replace(/page=\d+/, `page=${currentPage + 1}`)
                : `${options.targetUrl}&page=${currentPage + 1}`;
              
              console.log(`Navigating to next page: ${nextPageUrl}`);
              await page.goto(nextPageUrl);
              await page.waitForLoadState('networkidle');
              this.llmCallCount++;
            } catch (error) {
              console.log(`Could not navigate to page ${currentPage + 1}: ${error}`);
              break;
            }
          }
        } catch (error) {
          console.error(`Error processing page ${currentPage}:`, error);
          // Continue to next page on error
          continue;
        }
      }

      // Process and deduplicate companies
      const uniqueCompanies = this.deduplicateCompanies(allCompanies);
      const processedCompanies = this.processCompanies(uniqueCompanies);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: processedCompanies,
        totalCompanies: processedCompanies.length,
        executionTime,
        metadata: {
          targetUrl: options.targetUrl,
          maxPages,
          llmCalls: this.llmCallCount,
          model: process.env.STAGEHAND_MODEL_NAME || "openai/gpt-4o-mini",
        },
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        executionTime,
        metadata: {
          targetUrl: options.targetUrl,
          maxPages: options.maxPages || 15,
          llmCalls: this.llmCallCount,
          model: process.env.STAGEHAND_MODEL_NAME || "openai/gpt-4o-mini",
        },
      };
    } finally {
      try {
        await this.stagehand.close();
      } catch (closeError) {
        console.warn('Error closing Stagehand:', closeError);
      }
    }
  }

  private deduplicateCompanies(companies: CompanyData[]): CompanyData[] {
    const seen = new Set<string>();
    return companies.filter(company => {
      const key = company.name.toLowerCase().trim();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private processCompanies(companies: CompanyData[]): CompanyData[] {
    return companies.map(company => ({
      ...company,
      phone: this.formatPhone(company.phone || ''),
      principal_contact: company.principal_contact || 'N/A',
      address: company.address || 'N/A',
      url: company.url || 'N/A',
      accreditation: company.accreditation || 'Unknown',
    }));
  }

  private formatPhone(phone: string): string {
    if (!phone) return 'N/A';
    
    // Extract digits only
    const digits = phone.replace(/\D/g, '');
    
    // Add country code if not present
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+${digits}`;
    }
    
    return phone; // Return original if format is unclear
  }
}

// BBB-specific scraper with predefined URL and instructions
export class BBBStagehandScraper extends StagehandScraper {
  static readonly BBB_MEDICAL_BILLING_URL = 
    'https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing&page=1';

  async scrapeBBB(maxPages: number = 15): Promise<StagehandScrapingResult> {
    const bbbInstructions = `
      Extract medical billing companies from this BBB search results page. Look for:
      
      1. Company Names - Usually displayed as clickable links in blue text
      2. Phone Numbers - Look for phone numbers in formats like (xxx) xxx-xxxx or xxx-xxx-xxxx
      3. Addresses - Full addresses including street, city, state, and ZIP codes
      4. BBB Profile URLs - Links to individual company BBB profiles
      5. Accreditation Status - Look for "Accredited" or "Non-Accredited" labels
      6. Contact Information - Names and titles of key personnel
      
      Focus on companies that are specifically related to medical billing, billing services, 
      or healthcare administration. Each company should be a separate entry in the results.
      
      If you see pagination controls (Next, page numbers), note that we'll handle navigation separately.
    `;

    return this.scrape({
      targetUrl: BBBStagehandScraper.BBB_MEDICAL_BILLING_URL,
      maxPages,
      extractionInstructions: bbbInstructions,
    });
  }
}