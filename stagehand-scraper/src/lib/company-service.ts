import { supabase, type Company, type CompanyInsert } from './supabase';
import { type CompanyData } from './phase-b-scraper';

export interface ScrapingMetadata {
  sourceUrl: string;
  pageCount: number;
  totalCompanies: number;
  executionTime: number;
}

export interface SaveResult {
  savedCompanies: Company[];
  duplicatesSkipped: number;
  duplicatesUpdated: number;
  totalProcessed: number;
}

export class CompanyService {
  /**
   * Save companies to database with array-based merging for same-name companies
   */
  static async saveCompanies(companies: CompanyData[], metadata: ScrapingMetadata): Promise<SaveResult> {
    const result: SaveResult = {
      savedCompanies: [],
      duplicatesSkipped: 0,
      duplicatesUpdated: 0,
      totalProcessed: companies.length,
    };

    // Step 1: Merge companies with same name in the incoming data
    const mergedCompanies = await this.mergeCompaniesByName(companies);
    console.log(`Merged ${companies.length} companies into ${mergedCompanies.length} unique names`);

    // Step 2: Check which companies already exist in database
    const existingCompanies = await this.getExistingCompaniesByNames(mergedCompanies.map(c => c.name));
    
    const newCompanies: CompanyData[] = [];
    const companiesToUpdate: { existing: Company; newData: CompanyData }[] = [];

    // Step 3: Separate new companies from existing ones
    for (const company of mergedCompanies) {
      const existing = existingCompanies.find(e => e.name.toLowerCase().trim() === company.name.toLowerCase().trim());
      
      if (existing) {
        companiesToUpdate.push({ existing, newData: company });
      } else {
        newCompanies.push(company);
      }
    }

    console.log(`Analysis: ${newCompanies.length} new companies, ${companiesToUpdate.length} existing companies to update`);

    // Step 4: Insert new companies
    if (newCompanies.length > 0) {
      const companiesToInsert: CompanyInsert[] = newCompanies.map(company => {
        const insertData = {
          name: company.name,
          phones: this.cleanArrayValues([company.phone]),
          principal_contacts: this.cleanArrayValues([company.principal_contact]),
          urls: this.cleanArrayValues([company.url]),
          addresses: this.cleanArrayValues([company.address]),
          accreditation: company.accreditation === 'Unknown' ? null : company.accreditation,
          source_url: metadata.sourceUrl,
          page_count: metadata.pageCount,
        };
        
        console.log(`📄 Inserting new company: ${company.name}`);
        console.log(`   phones: ${JSON.stringify(insertData.phones)}`);
        console.log(`   principal_contacts: ${JSON.stringify(insertData.principal_contacts)}`);
        console.log(`   addresses: ${JSON.stringify(insertData.addresses)}`);
        
        return insertData;
      });

      const { data, error } = await supabase
        .from('companies')
        .insert(companiesToInsert)
        .select();

      if (error) {
        console.error('Error saving new companies:', error);
        throw new Error(`Failed to save companies: ${error.message}`);
      }

      result.savedCompanies.push(...(data || []));
    }

    // Step 5: Update existing companies with merged data
    for (const { existing, newData } of companiesToUpdate) {
      try {
        const updatedData = await this.updateExistingCompanyWithArrays(existing, newData, metadata);
        if (updatedData) {
          result.savedCompanies.push(updatedData);
          result.duplicatesUpdated++;
        } else {
          result.duplicatesSkipped++;
        }
      } catch (error) {
        console.error(`Error updating company ${existing.name}:`, error);
        result.duplicatesSkipped++;
      }
    }

    console.log(`Save result: ${result.savedCompanies.length} total saved, ${result.duplicatesSkipped} skipped, ${result.duplicatesUpdated} updated`);
    return result;
  }

  /**
   * Merge companies with the same name into a single company with arrays
   */
  private static async mergeCompaniesByName(companies: CompanyData[]): Promise<CompanyData[]> {
    const companyMap = new Map<string, CompanyData>();

    for (const company of companies) {
      const key = company.name.toLowerCase().trim();
      
      if (companyMap.has(key)) {
        const existing = companyMap.get(key)!;
        
        // Merge data into the existing company using AI deduplication
        existing.phone = await this.mergeValuesWithAI(existing.phone, company.phone);
        existing.principal_contact = await this.mergeValuesWithAI(existing.principal_contact, company.principal_contact);
        existing.url = await this.mergeValuesWithAI(existing.url, company.url);
        existing.address = await this.mergeValuesWithAI(existing.address, company.address);
        
        // Keep the best accreditation (prefer 'Accredited' over others)
        if (company.accreditation === 'Accredited' || existing.accreditation === 'Unknown') {
          existing.accreditation = company.accreditation;
        }
      } else {
        companyMap.set(key, { ...company });
      }
    }

    return Array.from(companyMap.values());
  }

  /**
   * Merge two values using AI deduplication, returning a pipe-separated string
   */
  private static async mergeValuesWithAI(existing: string, newValue: string): Promise<string> {
    if (existing === 'N/A' || !existing) {
      return newValue;
    }
    if (newValue === 'N/A' || !newValue) {
      return existing;
    }
    
    // Parse existing values and new value
    const existingValues = this.parseMultiValue(existing);
    const newValues = [newValue];
    
    // Use AI to deduplicate
    const uniqueValues = await this.mergeArrays(existingValues, newValues);
    
    // Convert back to pipe-separated string
    return uniqueValues ? uniqueValues.join('|') : existing;
  }

  /**
   * Get existing companies by names
   */
  private static async getExistingCompaniesByNames(names: string[]): Promise<Company[]> {
    if (names.length === 0) return [];

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .in('name', names);

    if (error) {
      console.error('Error getting existing companies:', error);
      throw new Error(`Failed to get existing companies: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Clean array values by removing null, undefined, empty, and 'N/A' values
   */
  private static cleanArrayValues(values: (string | null | undefined)[]): string[] | null {
    const cleaned = values
      .filter(v => v && v !== 'N/A' && v.trim() !== '')
      .map(v => v!.trim());
    
    // Remove duplicates
    const unique = [...new Set(cleaned)];
    
    return unique.length > 0 ? unique : null;
  }

  /**
   * Merge two values, handling 'N/A' and empty values
   */
  private static mergeValues(existing: string, newValue: string): string {
    if (existing === 'N/A' || !existing) {
      return newValue;
    }
    if (newValue === 'N/A' || !newValue) {
      return existing;
    }
    
    // If both have values, combine them (will be split into arrays later)
    if (existing !== newValue) {
      return `${existing}|${newValue}`;
    }
    
    return existing;
  }

  /**
   * Update existing company with new data, merging arrays
   */
  private static async updateExistingCompanyWithArrays(
    existing: Company,
    newData: CompanyData,
    metadata: ScrapingMetadata
  ): Promise<Company | null> {
    // Merge arrays with existing data using AI deduplication
    const newPhones = await this.mergeArrays(existing.phones, this.parseMultiValue(newData.phone));
    const newPrincipalContacts = await this.mergeArrays(existing.principal_contacts, this.parseMultiValue(newData.principal_contact));
    const newUrls = await this.mergeArrays(existing.urls, this.parseMultiValue(newData.url));
    const newAddresses = await this.mergeArrays(existing.addresses, this.parseMultiValue(newData.address));

    // Check if there's actually new information
    const hasNewInfo = (
      !this.arraysEqual(existing.phones, newPhones) ||
      !this.arraysEqual(existing.principal_contacts, newPrincipalContacts) ||
      !this.arraysEqual(existing.urls, newUrls) ||
      !this.arraysEqual(existing.addresses, newAddresses) ||
      (newData.accreditation !== 'Unknown' && existing.accreditation !== newData.accreditation)
    );

    if (!hasNewInfo) {
      console.log(`No new information for ${existing.name}, skipping update`);
      return null;
    }

    // Update with new data
    const updateData: Partial<CompanyInsert> = {
      phones: newPhones,
      principal_contacts: newPrincipalContacts,
      urls: newUrls,
      addresses: newAddresses,
      accreditation: newData.accreditation === 'Unknown' ? existing.accreditation : newData.accreditation,
      source_url: metadata.sourceUrl,
      page_count: metadata.pageCount,
    };

    const { data, error } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error(`Error updating company ${existing.name}:`, error);
      throw error;
    }

    console.log(`Updated company ${existing.name} with new information`);
    console.log(`  phones: ${JSON.stringify(newPhones)}`);
    console.log(`  principal_contacts: ${JSON.stringify(newPrincipalContacts)}`);
    console.log(`  addresses: ${JSON.stringify(newAddresses)}`);
    
    return data;
  }

  /**
   * Parse multi-value string (separated by |) into array
   */
  private static parseMultiValue(value: string): string[] {
    if (!value || value === 'N/A') return [];
    return value.split('|').map(v => v.trim()).filter(v => v && v !== 'N/A');
  }

  /**
   * Merge two arrays, removing duplicates and similar values using AI
   */
  private static async mergeArrays(existing: string[] | null, newValues: string[]): Promise<string[] | null> {
    const existingValues = existing || [];
    const filteredNewValues = newValues.filter(v => v && v !== 'N/A');
    
    if (filteredNewValues.length === 0) {
      return existingValues.length > 0 ? existingValues : null;
    }
    
    if (existingValues.length === 0) {
      return filteredNewValues;
    }
    
    // Use AI to deduplicate similar values
    const uniqueNewValues = await this.deduplicateWithAI(existingValues, filteredNewValues);
    
    const combined = [...existingValues, ...uniqueNewValues];
    return combined.length > 0 ? combined : null;
  }

  /**
   * Use AI to identify and filter out duplicate/similar values
   */
  private static async deduplicateWithAI(existingValues: string[], newValues: string[]): Promise<string[]> {
    if (!process.env.OPENAI_API_KEY) {
      // Fallback to simple deduplication if no AI available
      return newValues.filter(newVal => !existingValues.includes(newVal));
    }

    try {
      const prompt = `You are a strict data deduplication assistant. Given existing values and new values, identify which new values are NOT duplicates or very similar to existing ones.

Existing values: ${JSON.stringify(existingValues)}
New values: ${JSON.stringify(newValues)}

STRICT DEDUPLICATION RULES:
- Names: "Christina Boyce", "Christina Boyce (Owner)", "Mrs. Christina Boyce", "Ms. Christina Boyce (Owner)" are ALL duplicates
- Phone numbers: Any variation of the same digits are duplicates: "(719) 400-8222", "+1 719 400 8222", "719-400-8222", "7194008222" 
- Addresses: Same street address regardless of formatting: "123 Main St", "123 Main Street", "123 Main St." are duplicates
- URLs: Same domain/page regardless of protocol: "http://example.com", "https://example.com", "www.example.com" are duplicates
- Titles/suffixes: Ignore differences in titles (Mr., Mrs., Ms., Dr.) and job titles (Owner, Manager, CEO)
- Case sensitivity: "JOHN SMITH" and "john smith" are duplicates
- Extra spaces/punctuation: "John Smith" and "John  Smith." are duplicates

BE EXTREMELY STRICT: If there's ANY similarity in core information (name, phone digits, street address), consider them duplicates.

Return ONLY a JSON array of the new values that are completely unique and NOT duplicates:
["value1", "value2"]

If all new values are duplicates, return: []`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
        }),
      });

      const data = await response.json();
      let content = data.choices[0].message.content;
      
      // Clean the response - remove markdown code blocks if present
      content = content.replace(/```json\s*/, '').replace(/```\s*$/, '').trim();
      
      const result = JSON.parse(content);
      
      const filteredCount = newValues.length - result.length;
      if (filteredCount > 0) {
        console.log(`🤖 AI filtered out ${filteredCount} duplicate/similar values`);
      }
      
      return result;
    } catch (error) {
      console.error('AI deduplication failed, falling back to simple deduplication:', error);
      // Fallback to simple deduplication
      return newValues.filter(newVal => !existingValues.includes(newVal));
    }
  }

  /**
   * Check if two arrays are equal
   */
  private static arraysEqual(a: string[] | null, b: string[] | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (a.length !== b.length) return false;
    
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    
    return sortedA.every((val, i) => val === sortedB[i]);
  }

  /**
   * Get companies by names (for current scrape session)
   */
  static async getCompaniesByNames(names: string[]): Promise<{
    companies: Company[];
  }> {
    if (names.length === 0) {
      return { companies: [] };
    }

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .in('name', names)
      .order('scraped_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get companies by names: ${error.message}`);
    }

    return {
      companies: data || [],
    };
  }

  /**
   * Get companies with pagination
   */
  static async getCompanies(limit: number = 50, offset: number = 0): Promise<{
    companies: Company[];
    totalCount: number;
  }> {
    // Get total count
    const { count, error: countError } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Failed to get company count: ${countError.message}`);
    }

    // Get paginated companies
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('scraped_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get companies: ${error.message}`);
    }

    return {
      companies: data || [],
      totalCount: count || 0,
    };
  }

  /**
   * Get company by ID
   */
  static async getCompanyById(id: string): Promise<Company | null> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get company: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete companies by IDs
   */
  static async deleteCompanies(ids: string[]): Promise<void> {
    const { error } = await supabase
      .from('companies')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to delete companies: ${error.message}`);
    }
  }

  /**
   * Delete all companies
   */
  static async deleteAllCompanies(): Promise<void> {
    const { error } = await supabase
      .from('companies')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

    if (error) {
      throw new Error(`Failed to delete all companies: ${error.message}`);
    }
  }

  /**
   * Get database statistics
   */
  static async getStats(): Promise<{
    totalCompanies: number;
    lastScrapedAt: string | null;
    uniqueSources: number;
  }> {
    // Get total count
    const { count, error: countError } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Failed to get stats: ${countError.message}`);
    }

    // Get last scraped timestamp
    const { data: lastScraped, error: lastScrapedError } = await supabase
      .from('companies')
      .select('scraped_at')
      .order('scraped_at', { ascending: false })
      .limit(1);

    if (lastScrapedError) {
      throw new Error(`Failed to get last scraped: ${lastScrapedError.message}`);
    }

    // Get unique sources
    const { data: sources, error: sourcesError } = await supabase
      .from('companies')
      .select('source_url')
      .not('source_url', 'is', null);

    if (sourcesError) {
      throw new Error(`Failed to get sources: ${sourcesError.message}`);
    }

    const uniqueSources = new Set(sources?.map(s => s.source_url)).size;

    return {
      totalCompanies: count || 0,
      lastScrapedAt: lastScraped?.[0]?.scraped_at || null,
      uniqueSources,
    };
  }

  /**
   * Search companies by name or other fields (updated for arrays)
   */
  static async searchCompanies(query: string, limit: number = 50): Promise<Company[]> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .or(`name.ilike.%${query}%,addresses::text.ilike.%${query}%,principal_contacts::text.ilike.%${query}%`)
      .order('scraped_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to search companies: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Advanced duplicate checking with multiple criteria
   */
  static async checkDuplicatesAdvanced(companies: CompanyData[]): Promise<{
    duplicates: Array<{ company: CompanyData; existing: Company }>;
    unique: CompanyData[];
  }> {
    const duplicates: Array<{ company: CompanyData; existing: Company }> = [];
    const unique: CompanyData[] = [];

    for (const company of companies) {
      // Check for exact name match (case-insensitive)
      const nameMatch = await this.findExistingCompany(company);
      
      if (nameMatch) {
        duplicates.push({ company, existing: nameMatch });
      } else {
        unique.push(company);
      }
    }

    return { duplicates, unique };
  }

  /**
   * Find existing company by multiple criteria
   */
  private static async findExistingCompany(company: CompanyData): Promise<Company | null> {
    // First try exact name match (case-insensitive)
    const nameQuery = supabase
      .from('companies')
      .select('*')
      .ilike('name', company.name.trim())
      .limit(1);

    const { data: nameData, error: nameError } = await nameQuery;

    if (nameError) {
      console.error('Error checking name duplicates:', nameError);
      return null;
    }

    if (nameData && nameData.length > 0) {
      return nameData[0];
    }

    // If no exact name match, try phone number match (if available)
    if (company.phone && company.phone !== 'N/A') {
      const { data: phoneData, error: phoneError } = await supabase
        .from('companies')
        .select('*')
        .eq('phone', company.phone)
        .limit(1);

      if (!phoneError && phoneData && phoneData.length > 0) {
        return phoneData[0];
      }
    }

    // If no phone match, try URL match (if available)
    if (company.url && company.url !== 'N/A') {
      const { data: urlData, error: urlError } = await supabase
        .from('companies')
        .select('*')
        .eq('url', company.url)
        .limit(1);

      if (!urlError && urlData && urlData.length > 0) {
        return urlData[0];
      }
    }

    return null;
  }

  /**
   * Update existing company with new information
   */
  private static async updateExistingCompany(
    existing: Company, 
    newData: CompanyData, 
    metadata: ScrapingMetadata
  ): Promise<Company | null> {
    // Check if there's actually new information to update
    const hasNewInfo = this.hasNewInformation(existing, newData);
    
    if (!hasNewInfo) {
      console.log(`No new information for ${existing.name}, skipping update`);
      return null;
    }

    // Prepare update data with new information
    const updateData: Partial<CompanyInsert> = {
      // Update fields if new data is better (not null/N/A and different)
      phone: this.getBetterValue(existing.phone, newData.phone),
      principal_contact: this.getBetterValue(existing.principal_contact, newData.principal_contact),
      address: this.getBetterValue(existing.address, newData.address),
      accreditation: this.getBetterValue(existing.accreditation, newData.accreditation),
      url: this.getBetterValue(existing.url, newData.url),
      // Update metadata
      source_url: metadata.sourceUrl,
      page_count: metadata.pageCount,
      scraped_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error(`Error updating company ${existing.name}:`, error);
      throw error;
    }

    console.log(`Updated company ${existing.name} with new information`);
    return data;
  }

  /**
   * Check if new data has information worth updating
   */
  private static hasNewInformation(existing: Company, newData: CompanyData): boolean {
    return (
      this.getBetterValue(existing.phone, newData.phone) !== existing.phone ||
      this.getBetterValue(existing.principal_contact, newData.principal_contact) !== existing.principal_contact ||
      this.getBetterValue(existing.address, newData.address) !== existing.address ||
      this.getBetterValue(existing.accreditation, newData.accreditation) !== existing.accreditation ||
      this.getBetterValue(existing.url, newData.url) !== existing.url
    );
  }

  /**
   * Get better value between existing and new data
   */
  private static getBetterValue(existingValue: string | null, newValue: string): string | null {
    // If existing value is null/empty and new value has content, use new value
    if (!existingValue && newValue && newValue !== 'N/A') {
      return newValue;
    }
    
    // If existing value exists and new value is N/A, keep existing
    if (existingValue && (newValue === 'N/A' || !newValue)) {
      return existingValue;
    }
    
    // If both have values, prefer the longer/more detailed one
    if (existingValue && newValue && newValue !== 'N/A') {
      return newValue.length > existingValue.length ? newValue : existingValue;
    }
    
    return existingValue;
  }

  /**
   * Check if companies with similar names already exist (legacy method)
   */
  static async checkDuplicates(companies: CompanyData[]): Promise<{
    duplicates: Array<{ company: CompanyData; existing: Company }>;
    unique: CompanyData[];
  }> {
    // Use the new advanced method
    return this.checkDuplicatesAdvanced(companies);
  }
}