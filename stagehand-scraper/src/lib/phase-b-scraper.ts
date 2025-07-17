import { Stagehand } from '@browserbasehq/stagehand';

export interface CompanyData {
  name: string;
  phone: string;
  principal_contact: string;
  url: string;
  address: string;
  accreditation: string;
}

export interface StagehandScrapingOptions {
  targetUrl?: string;
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

export class PhaseBScraper {
  private stagehand: Stagehand;
  private llmCallCount = 0;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.stagehand = new Stagehand({
      env: "LOCAL",
      modelName: "openai/gpt-4o-mini",
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY,
      },
      headless: true,
    });
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

      const targetUrl = options.targetUrl || this.getDefaultBBBUrl();
      const maxPages = options.maxPages || 1;
      const allCompanies: CompanyData[] = [];

      console.log(`Starting Phase B scraping: ${targetUrl}, ${maxPages} pages`);

      for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
        console.log(`Processing page ${currentPage}/${maxPages}`);

        const pageUrl = this.buildPageUrl(targetUrl, currentPage);
        console.log(`Navigating to: ${pageUrl}`);
        await page.goto(pageUrl);
        await page.waitForTimeout(3000);
        
        const pageCompanies = await this.extractCompaniesFromPage(page);
        
        if (pageCompanies.length > 0) {
          allCompanies.push(...pageCompanies);
          console.log(`Extracted ${pageCompanies.length} companies from page ${currentPage}`);
        } else {
          console.log(`No companies found on page ${currentPage}, stopping pagination`);
          break;
        }
      }

      await this.stagehand.close();

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: allCompanies,
        totalCompanies: allCompanies.length,
        executionTime,
        metadata: {
          targetUrl,
          maxPages,
          llmCalls: this.llmCallCount,
          model: "openai/gpt-4o-mini",
        },
      };

    } catch (error) {
      try {
        await this.stagehand.close();
      } catch {}
      
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        metadata: {
          targetUrl: options.targetUrl || this.getDefaultBBBUrl(),
          maxPages: options.maxPages || 1,
          llmCalls: this.llmCallCount,
          model: "openai/gpt-4o-mini",
        },
      };
    }
  }

  private async extractCompaniesFromPage(page: any): Promise<CompanyData[]> {
    console.log('Finding all company cards on page...');
    
    // First, let's get the actual count of cards to verify
    const cardCountInstruction = `
    Look at this BBB search results page and count how many div elements have the class "card result-card". 
    Just return the number as a simple integer, nothing else.
    `;
    
    const cardCount = await page.extract({
      instruction: cardCountInstruction
    });
    this.llmCallCount++;
    
    console.log('Card count result:', cardCount);
    
    // Now extract the actual href attributes using JavaScript evaluation
    console.log('Extracting real href attributes from DOM...');
    
    try {
      // Use page.evaluate to run actual JavaScript and get real DOM data
      const realData = await page.evaluate(() => {
        const results = [];
        
        // Find the main container
        const container = document.querySelector('div.stack.stack-space-20[style*="margin-block-start"]');
        if (!container) {
          return { error: 'Main container not found' };
        }
        
        // Find all company cards
        const cards = container.querySelectorAll('div.card.result-card');
        console.log('Found cards:', cards.length);
        
        cards.forEach((card, index) => {
          try {
            // Extract company name and URL
            const nameLink = card.querySelector('a.text-blue-medium');
            const name = nameLink ? nameLink.textContent.trim() : 'N/A';
            const href = nameLink ? nameLink.getAttribute('href') : 'N/A';
            
            // Extract phone
            const phoneLink = card.querySelector('a[href^="tel:"]');
            const phone = phoneLink ? phoneLink.textContent.trim() : 'N/A';
            
            // Extract address
            const addressP = card.querySelector('p.bds-body.text-size-5.text-gray-70');
            const address = addressP ? addressP.textContent.trim() : 'N/A';
            
            // Check for accreditation
            const accreditedImg = card.querySelector('img[alt*="Accredited Business"]');
            const accreditation = accreditedImg ? 'Accredited' : 'Non-Accredited';
            
            results.push({
              name,
              phone,
              address,
              url: href,
              accreditation
            });
          } catch (error) {
            console.log('Error processing card', index, error);
          }
        });
        
        return { data: results, count: cards.length };
      });
      
      console.log('Real DOM extraction result:', realData);
      
      if (realData.error) {
        console.log('DOM extraction error:', realData.error);
        return [];
      }
      
      if (!realData.data || !Array.isArray(realData.data)) {
        console.log('Invalid DOM extraction result');
        return [];
      }
      
      console.log(`Found ${realData.count} cards, extracted ${realData.data.length} companies`);
      
      const processedCompanies: CompanyData[] = realData.data.map((company: any, index: number) => {
        console.log(`Processing company ${index + 1}:`, company);
        
        let processedUrl = company.url || 'N/A';
        if (processedUrl !== 'N/A' && processedUrl.startsWith('/')) {
          processedUrl = `https://www.bbb.org${processedUrl}`;
        }
        
        return {
          name: company.name || 'N/A',
          phone: this.formatPhone(company.phone || 'N/A'),
          address: company.address || 'N/A',
          url: processedUrl,
          accreditation: company.accreditation || 'Unknown',
          principal_contact: 'N/A' // Not available from card view
        };
      });
      
      console.log(`Processed ${processedCompanies.length} companies successfully`);
      return processedCompanies;
      
    } catch (error) {
      console.log('Error in DOM extraction, falling back to LLM extraction:', error);
      
      // Fallback to original LLM-based extraction if DOM extraction fails
      const fallbackInstruction = `
      Find all company cards on this page and extract ONLY what you actually see in the HTML.
      Do not make up or hallucinate any URLs. Extract real href attributes from actual <a> elements.
      Return a JSON array with name, phone, address, url, and accreditation for each company.
      `;
      
      const result = await page.extract({
        instruction: fallbackInstruction
      });
      this.llmCallCount++;
      
      let companies: any[] = [];
      try {
        if (typeof result === 'string') {
          companies = JSON.parse(result);
        } else if (result && typeof result === 'object' && 'extraction' in result) {
          companies = JSON.parse((result as any).extraction);
        } else if (Array.isArray(result)) {
          companies = result;
        }
      } catch (parseError) {
        console.log('Failed to parse fallback data:', parseError);
        return [];
      }
      
      return companies.map((company: any) => ({
        name: company.name || 'N/A',
        phone: this.formatPhone(company.phone || 'N/A'),
        address: company.address || 'N/A',
        url: company.url || 'N/A',
        accreditation: company.accreditation || 'Unknown',
        principal_contact: 'N/A'
      }));
    }
  }

  private getDefaultBBBUrl(): string {
    return "https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing&page=1";
  }

  private buildPageUrl(baseUrl: string, pageNumber: number): string {
    if (baseUrl.includes('page=')) {
      return baseUrl.replace(/page=\d+/, `page=${pageNumber}`);
    } else {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}page=${pageNumber}`;
    }
  }

  private formatPhone(phone: string): string {
    if (!phone || phone === 'N/A') return 'N/A';
    
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1${digits.substring(1)}`;
    }
    
    return phone;
  }

  async scrapeBBB(maxPages: number = 1): Promise<StagehandScrapingResult> {
    return this.scrape({
      targetUrl: this.getDefaultBBBUrl(),
      maxPages
    });
  }
}