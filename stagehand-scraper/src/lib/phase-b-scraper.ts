import { Stagehand } from '@browserbasehq/stagehand';

export interface CompanyData {
  name: string;
  phone: string;
  principal_contact: string;
  url: string;
  address: string;
  accreditation: string;
  [key: string]: string;
}

export interface StagehandScrapingOptions {
  targetUrl?: string;
  maxPages?: number;
  extractionInstructions?: string;
  onProgress?: (status: string, progress: number) => void;
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
    } catch {
      return { valid: false, error: 'Error validating API key configuration' };
    }
  }

  async scrape(options: StagehandScrapingOptions): Promise<StagehandScrapingResult> {
    const startTime = Date.now();
    this.llmCallCount = 0;

    try {
      const { onProgress } = options;
      
      onProgress?.('Initializing scraper...', 0);
      await this.stagehand.init();
      const page = this.stagehand.page;

      const targetUrl = options.targetUrl || this.getDefaultBBBUrl();
      const maxPages = options.maxPages || 1;
      const allCompanies: CompanyData[] = [];

      console.log(`Starting Phase B scraping: ${targetUrl}, ${maxPages} pages`);

      for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
        const pageProgress = (currentPage - 1) / maxPages * 60; // Pages take 60% of total work
        onProgress?.(`Processing page ${currentPage} of ${maxPages}...`, pageProgress);
        
        console.log(`Processing page ${currentPage}/${maxPages}`);

        const pageUrl = this.buildPageUrl(targetUrl, currentPage);
        console.log(`Navigating to: ${pageUrl}`);
        await page.goto(pageUrl);
        await page.waitForTimeout(3000);
        
        const pageCompanies = await this.extractCompaniesFromPage(page);
        
        if (pageCompanies.length > 0) {
          // Now enhance each company with detailed information
          const enhancedCompanies = await this.enhanceCompaniesWithDetails(page, pageCompanies, onProgress, currentPage, maxPages);
          allCompanies.push(...enhancedCompanies);
          console.log(`Enhanced ${enhancedCompanies.length} companies from page ${currentPage}`);
        } else {
          console.log(`No companies found on page ${currentPage}, stopping pagination`);
          break;
        }
      }

      onProgress?.('Finalizing results...', 100);
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

  private async extractCompaniesFromPage(page: { evaluate: (fn: () => unknown) => Promise<unknown> }): Promise<CompanyData[]> {
    console.log('Finding all company cards on page...');
    
    try {
      // Use page.evaluate to run actual JavaScript and get real DOM data
      const realData = await page.evaluate(() => {
        const results: Array<{
          name: string;
          phone: string;
          address: string;
          url: string;
          accreditation: string;
        }> = [];
        
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
            const name = nameLink ? nameLink.textContent?.trim() || 'N/A' : 'N/A';
            const href = nameLink ? nameLink.getAttribute('href') || 'N/A' : 'N/A';
            
            // Extract phone
            const phoneLink = card.querySelector('a[href^="tel:"]');
            const phone = phoneLink ? phoneLink.textContent?.trim() || 'N/A' : 'N/A';
            
            // Extract address
            const addressP = card.querySelector('p.bds-body.text-size-5.text-gray-70');
            const address = addressP ? addressP.textContent?.trim() || 'N/A' : 'N/A';
            
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
        
        return { data: results, count: cards.length } as {
          data: Array<{
            name: string;
            phone: string;
            address: string;
            url: string;
            accreditation: string;
          }>;
          count: number;
        } | { error: string };
      });
      
      console.log('Real DOM extraction result:', realData);
      
      const typedRealData = realData as {
        data: Array<{
          name: string;
          phone: string;
          address: string;
          url: string;
          accreditation: string;
        }>;
        count: number;
      } | { error: string };
      
      if ('error' in typedRealData) {
        console.log('DOM extraction error:', typedRealData.error);
        return [];
      }
      
      if (!typedRealData.data || !Array.isArray(typedRealData.data)) {
        console.log('Invalid DOM extraction result');
        return [];
      }
      
      console.log(`Found ${typedRealData.count} cards, extracted ${typedRealData.data.length} companies`);
      
      const processedCompanies: CompanyData[] = typedRealData.data.map((company) => {
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
          principal_contact: 'N/A' // Will be enhanced later
        };
      });
      
      console.log(`Processed ${processedCompanies.length} companies successfully`);
      return processedCompanies;
      
    } catch (error) {
      console.log('Error in DOM extraction:', error);
      return [];
    }
  }

  private async enhanceCompaniesWithDetails(
    _page: unknown, 
    companies: CompanyData[], 
    onProgress?: (status: string, progress: number) => void,
    currentPage?: number,
    maxPages?: number
  ): Promise<CompanyData[]> {
    console.log(`Enhancing ${companies.length} companies with detailed information using parallel processing...`);
    
    // Filter companies with valid URLs
    const validCompanies = companies.filter(company => 
      company.url && company.url !== 'N/A' && company.url.includes('bbb.org')
    );
    
    const invalidCompanies = companies.filter(company => 
      !company.url || company.url === 'N/A' || !company.url.includes('bbb.org')
    );

    console.log(`Processing ${validCompanies.length} companies with valid URLs in parallel...`);
    console.log(`Skipping ${invalidCompanies.length} companies without valid URLs`);

    // Process companies in parallel batches
    const BATCH_SIZE = 5; // Number of concurrent Stagehand instances
    const enhancedCompanies: CompanyData[] = [];
    const totalBatches = Math.ceil(validCompanies.length / BATCH_SIZE);
    
    for (let i = 0; i < validCompanies.length; i += BATCH_SIZE) {
      const batch = validCompanies.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      
      // Calculate progress: 60% for pages + 40% for enhancement
      const baseProgress = currentPage && maxPages ? ((currentPage - 1) / maxPages * 60) : 0;
      const enhancementProgress = (batchNumber - 1) / totalBatches * 40;
      const totalProgress = baseProgress + enhancementProgress;
      
      onProgress?.(`Enhancing companies: batch ${batchNumber} of ${totalBatches}`, totalProgress);
      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} companies)`);
      
      // Create promises for parallel processing
      const batchPromises = batch.map(company => 
        this.processCompanyInParallel(company)
      );
      
      // Wait for all companies in batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          enhancedCompanies.push(result.value);
        } else {
          console.log(`Error processing ${batch[index].name}:`, result.reason);
          enhancedCompanies.push(batch[index]); // Add original data on failure
        }
      });
      
      // Small delay between batches to be respectful
      if (i + BATCH_SIZE < validCompanies.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Add companies without valid URLs (unchanged)
    enhancedCompanies.push(...invalidCompanies);

    console.log(`Enhanced ${enhancedCompanies.length} companies total`);
    return enhancedCompanies;
  }

  private async processCompanyInParallel(company: CompanyData): Promise<CompanyData> {
    // Create a new Stagehand instance for this company
    const stagehand = new Stagehand({
      env: "LOCAL",
      modelName: "openai/gpt-4o-mini",
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY,
      },
    });

    try {
      await stagehand.init();
      const page = stagehand.page;

      console.log(`Visiting profile page: ${company.url}`);
      await page.goto(company.url);
      await page.waitForTimeout(2000);

      // Extract principal contact and enhanced address using AI
      const detailsInstruction = `
        You are on a BBB business profile page. Look carefully for and extract:

        1. Principal Contact: Look for sections with headings like:
           - "Principal"
           - "Business Management"
           - "Contact Information"
           - "Key Personnel"
           - "Principal Executives"
           - "Business Owner"
           - "Management"
           
           Look for names with titles like Owner, CEO, President, Manager, Principal, Director, etc.
           The person's name might be listed under these sections or in contact information.
           Also check if there are any names listed as contacts or representatives.
           Format as "FirstName LastName (Title)" if title is found, or just "FirstName LastName" if no title.
           If multiple people are listed, choose the first one or the one with the highest title.

        2. Complete Address: Look for the business address section. Extract the full street address 
           including street number, street name, city, state, and ZIP code.

        Return ONLY a JSON object with this exact format:
        {"principal_contact": "John Doe (CEO)", "address": "123 Main St, City, State 12345"}
        
        If information is not found, use "N/A" for that field.
        
        IMPORTANT: Look thoroughly through the entire page content, not just the main sections.
      `;

      const details = await page.extract({
        instruction: detailsInstruction
      });
      this.llmCallCount++;

      let enhancedDetails: { principal_contact?: string; address?: string } = {};
      try {
        console.log(`\n=== DEBUG: ${company.name} ===`);
        console.log(`URL: ${company.url}`);
        console.log(`Raw AI response:`, JSON.stringify(details, null, 2));
        
        // Handle different response formats from Stagehand
        if (typeof details === 'string') {
          enhancedDetails = JSON.parse(details);
        } else if (details && typeof details === 'object') {
          // Check if the response has an 'extraction' field (common with Stagehand)
          if ('extraction' in details && typeof details.extraction === 'string') {
            enhancedDetails = JSON.parse(details.extraction);
          } else {
            enhancedDetails = details as { principal_contact?: string; address?: string };
          }
        }
        
        console.log(`Parsed details:`, JSON.stringify(enhancedDetails, null, 2));
      } catch (error) {
        console.log(`❌ Failed to parse details for ${company.name}:`, error);
        console.log(`Raw details that failed:`, details);
        enhancedDetails = { principal_contact: 'N/A', address: company.address };
      }

      await stagehand.close();

      const finalContact = enhancedDetails.principal_contact || 'N/A';
      const finalAddress = enhancedDetails.address || company.address;
      
      console.log(`✅ Final result for ${company.name}:`);
      console.log(`   principal_contact: "${finalContact}"`);
      console.log(`   address: "${finalAddress}"`);
      console.log(`=== END DEBUG ===\n`);

      return {
        ...company,
        principal_contact: finalContact,
        address: finalAddress,
      };

    } catch (error) {
      console.log(`Error visiting profile for ${company.name}:`, error);
      
      try {
        await stagehand.close();
      } catch (closeError) {
        console.log('Error closing Stagehand instance:', closeError);
      }
      
      return company; // Return original data if profile visit fails
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