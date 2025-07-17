import { Stagehand } from '@browserbasehq/stagehand';

export interface CompanyData {
  name: string;
  phone: string;
  principal_contact: string;
  url: string;
  address: string;
  accreditation: string;
}

export class MinimalStagehandScraper {
  private stagehand: Stagehand;

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

  async scrapeFirstCompany(): Promise<{ success: boolean; data?: CompanyData; error?: string }> {
    try {
      await this.stagehand.init();
      const page = this.stagehand.page;

      // Navigate to BBB medical billing search page 1
      const url = "https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing&page=1";
      console.log('Navigating to BBB search page...');
      await page.goto(url);

      // Step 1: Extract basic info from the first company card
      console.log('Extracting basic info from first company card...');
      const basicInfo = await page.extract({
        instruction: `Look at the first business listing/card on this BBB search results page. Find and extract:
        1. The business/company name (usually in blue text that's clickable)
        2. The phone number (look for formats like (xxx) xxx-xxxx or xxx-xxx-xxxx)
        3. The BBB accreditation status (look for "Accredited Business" badge or "A+" rating, return "Accredited" if found, otherwise "Non-Accredited")
        
        Return ONLY a JSON object like: {"name": "Company Name", "phone": "phone number or N/A", "accreditation": "Accredited or Non-Accredited"}`
      });

      console.log('Basic info extracted:', basicInfo);

      let companyData: Partial<CompanyData>;
      try {
        if (typeof basicInfo === 'string') {
          companyData = JSON.parse(basicInfo);
        } else if (basicInfo && typeof basicInfo === 'object' && 'extraction' in basicInfo) {
          // Handle nested extraction property
          companyData = JSON.parse((basicInfo as any).extraction);
        } else {
          companyData = basicInfo as Partial<CompanyData>;
        }
      } catch (parseError) {
        console.log('Failed to parse basic info, using raw data:', basicInfo);
        companyData = { name: 'Parse Error', phone: 'N/A', accreditation: 'Unknown' };
      }
      
      console.log('Parsed basic company data:', companyData);

      // Step 2: Find and navigate to the profile link for this company
      console.log('Looking for company profile link...');
      let navigationSuccessful = false;
      
      try {
        // Try to click the profile link
        const clicked = await page.act(
          `Find the first company card and click on the company name link (usually has class "text-blue-medium") to go to the company's detailed profile page.`
        );
        
        if (clicked) {
          await page.waitForLoadState('networkidle');
          navigationSuccessful = true;
          console.log('Successfully navigated via act()');
        }
      } catch (actError) {
        console.log('Act failed, trying direct URL extraction:', actError);
      }

      // Fallback: try to extract the URL directly and navigate
      if (!navigationSuccessful) {
        try {
          const linkUrl = await page.extract({
            instruction: `Find the first company's profile link (usually the company name in blue text with class "text-blue-medium"). Return just the URL/href value, not JSON.`
          });
          
          console.log('Extracted link URL:', linkUrl);
          if (linkUrl && typeof linkUrl === 'string' && linkUrl.includes('bbb.org')) {
            await page.goto(linkUrl);
            await page.waitForLoadState('networkidle');
            navigationSuccessful = true;
            console.log('Successfully navigated via direct URL');
          }
        } catch (urlError) {
          console.log('Direct URL extraction failed:', urlError);
        }
      }

      if (navigationSuccessful) {
        console.log('Navigating to company profile page...');
        // Wait for the profile page to load
        await page.waitForLoadState('networkidle');

        // Step 3: Extract detailed info from the profile page
        console.log('Current URL:', page.url());
        console.log('Extracting detailed info from profile page...');
        const detailedInfo = await page.extract({
          instruction: `You are now on a BBB business profile page. Look for and extract:
          1. Principal contact information: Look for sections like "Principal" or "Contact" or employee names with titles (CEO, Owner, Manager, etc.). If found, format as "Name (Title)", otherwise return "N/A"
          2. Business address: Look for the complete street address including street number, street name, city, state, and ZIP code. Return the full address as one string, or "N/A" if not found.
          
          Return ONLY a JSON object like: {"principal_contact": "John Doe (CEO) or N/A", "address": "123 Main St, City, State 12345 or N/A"}`
        });

        console.log('Detailed info extracted:', detailedInfo);

        let profileData: Partial<CompanyData>;
        try {
          if (typeof detailedInfo === 'string') {
            profileData = JSON.parse(detailedInfo);
          } else if (detailedInfo && typeof detailedInfo === 'object' && 'extraction' in detailedInfo) {
            // Handle nested extraction property
            profileData = JSON.parse((detailedInfo as any).extraction);
          } else {
            profileData = detailedInfo as Partial<CompanyData>;
          }
        } catch (parseError) {
          console.log('Failed to parse detailed info, using raw data:', detailedInfo);
          profileData = { principal_contact: 'Parse Error', address: 'Parse Error' };
        }
        
        console.log('Parsed profile data:', profileData);

        // Combine basic info with detailed info
        companyData = {
          name: companyData.name || 'N/A',
          phone: this.formatPhone(companyData.phone || 'N/A'),
          accreditation: companyData.accreditation || 'Unknown',
          principal_contact: profileData.principal_contact || 'N/A',
          address: profileData.address || 'N/A',
          url: page.url() // Current profile page URL
        };
        
        console.log('Final combined data:', companyData);
      } else {
        console.log('Could not find profile link, using basic info only');
        companyData = {
          name: companyData.name || 'N/A',
          phone: this.formatPhone(companyData.phone || 'N/A'),
          accreditation: companyData.accreditation || 'Unknown',
          principal_contact: 'N/A',
          address: 'N/A',
          url: 'N/A'
        };
      }

      await this.stagehand.close();

      return {
        success: true,
        data: companyData as CompanyData
      };

    } catch (error) {
      try {
        await this.stagehand.close();
      } catch {}
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private formatPhone(phone: string): string {
    if (!phone || phone === 'N/A') return 'N/A';
    
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