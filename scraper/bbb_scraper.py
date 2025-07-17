import asyncio
import time
import re
import json
import pandas as pd
from playwright.async_api import async_playwright
from typing import List, Dict, Set, Tuple
import logging
from concurrent.futures import ThreadPoolExecutor
import concurrent.futures

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class BBBScraper:
    def __init__(self):
        self.base_url = "https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing&page="
        self.companies = []
        self.seen_companies = set()
        self.max_pages = 15
        
    async def scrape_page(self, page, page_num):
        """Scrape a single page of BBB search results"""
        try:
            url = f"{self.base_url}{page_num}"
            logger.info(f"Scraping page {page_num}: {url}")
            
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(2000)  # Respectful crawling
            
            # Extract webDigitalData from the page
            digital_data = await page.evaluate("""
                () => {
                    return typeof webDigitalData !== 'undefined' ? webDigitalData : null;
                }
            """)
            
            if digital_data and 'search_info' in digital_data and 'results' in digital_data['search_info']:
                results = digital_data['search_info']['results']
                logger.info(f"Found {len(results)} results on page {page_num}")
                
                for result in results:
                    try:
                        company_data = self.extract_company_data_from_json(result)
                        if company_data and self.is_unique_company(company_data):
                            # Try to enhance data by visiting individual page
                            enhanced_data = await self.enhance_company_data(page, company_data)
                            if enhanced_data:
                                company_data = enhanced_data
                            
                            self.companies.append(company_data)
                            self.seen_companies.add(company_data['name'])
                            logger.info(f"Added: {company_data['name']}")
                    except Exception as e:
                        logger.error(f"Error processing result: {e}")
                        continue
            else:
                logger.warning(f"No search results found on page {page_num}")
                    
        except Exception as e:
            logger.error(f"Error scraping page {page_num}: {e}")
            
    def extract_company_data_from_json(self, result: Dict) -> Dict:
        """Extract data from JSON result object"""
        try:
            # Extract company name
            name = result.get('business_name', 'N/A')
            
            # Extract phone and format it
            phone = result.get('business_phone', 'N/A')
            if phone and phone != 'N/A':
                phone = self.format_phone(phone)
            
            # Extract URL - construct from business_id
            business_id = result.get('business_id', '')
            url = f"https://www.bbb.org/us/business/{business_id}" if business_id else "N/A"
            
            # Extract address from zip_code (limited info available)
            zip_code = result.get('zip_code', 'N/A')
            address = f"ZIP: {zip_code}" if zip_code and zip_code != 'N/A' else "N/A"
            
            # Extract accreditation status
            accreditation = "Accredited" if result.get('accredited_status') == 'AB' else "Non-Accredited"
            
            # Principal contact - not available in this data
            principal_contact = "N/A"
            
            return {
                'name': name.strip(),
                'phone': phone,
                'principal_contact': principal_contact,
                'url': url,
                'address': address,
                'accreditation': accreditation
            }
            
        except Exception as e:
            logger.error(f"Error extracting company data from JSON: {e}")
            return None
            
    async def enhance_company_data(self, page, company_data: Dict) -> Dict:
        """Try to enhance company data by visiting individual business page"""
        try:
            company_name = company_data['name']
            
            # Wait a bit more to ensure page is fully loaded
            await page.wait_for_timeout(500)
            
            # Look for the exact business name in the links
            target_url = await self.find_business_link_by_name(page, company_name)
            
            if not target_url:
                logger.warning(f"Could not find individual page URL for {company_name}")
                return company_data
            
            # Visit the individual page
            logger.info(f"Visiting individual page for {company_name}: {target_url}")
            
            # Store the current page URL to return to later
            current_url = page.url
            
            # Update the URL to use the actual profile URL
            company_data['url'] = target_url
            
            try:
                await page.goto(target_url, wait_until="domcontentloaded")
                await page.wait_for_timeout(1000)  # Brief wait for page to load
                
                # Extract JSON-LD structured data
                json_ld_data = await page.evaluate("""
                    () => {
                        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                        for (const script of scripts) {
                            try {
                                const data = JSON.parse(script.textContent);
                                if (Array.isArray(data)) {
                                    for (const item of data) {
                                        if (item['@type'] === 'LocalBusiness') {
                                            return item;
                                        }
                                    }
                                } else if (data['@type'] === 'LocalBusiness') {
                                    return data;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        return null;
                    }
                """)
                
                if json_ld_data:
                    # Extract street address
                    if 'address' in json_ld_data and 'streetAddress' in json_ld_data['address']:
                        street_address = json_ld_data['address']['streetAddress']
                        city = json_ld_data['address'].get('addressLocality', '')
                        state = json_ld_data['address'].get('addressRegion', '')
                        zip_code = json_ld_data['address'].get('postalCode', '')
                        
                        # Format full address
                        full_address = f"{street_address}, {city}, {state} {zip_code}".strip(', ')
                        company_data['address'] = full_address
                    
                    # Extract principal contact
                    if 'employee' in json_ld_data and json_ld_data['employee']:
                        employee = json_ld_data['employee'][0]  # Take first employee
                        first_name = employee.get('givenName', '')
                        middle_name = employee.get('additionalName', '')
                        last_name = employee.get('familyName', '')
                        job_title = employee.get('jobTitle', '')
                        
                        # Format principal contact
                        full_name = f"{first_name} {middle_name} {last_name}".strip().replace('  ', ' ')
                        if job_title:
                            principal_contact = f"{full_name} ({job_title})"
                        else:
                            principal_contact = full_name
                        
                        company_data['principal_contact'] = principal_contact if principal_contact else "N/A"
                    
                    logger.info(f"Enhanced data for {company_name}")
                else:
                    logger.warning(f"No JSON-LD data found for {company_name}")
                    
            except Exception as e:
                logger.error(f"Error visiting individual page for {company_name}: {e}")
            
            # Return to the search results page
            try:
                await page.goto(current_url, wait_until="domcontentloaded")
                await page.wait_for_timeout(1000)  # Wait for page to load
            except Exception as e:
                logger.error(f"Error returning to search results page: {e}")
                
            return company_data
            
        except Exception as e:
            logger.error(f"Error enhancing company data for {company_data.get('name', 'unknown')}: {e}")
            return company_data
    
    async def find_business_link_by_name(self, page, company_name: str) -> str:
        """Find business profile link by exact company name match"""
        try:
            # Look for links with exact class text-blue-medium
            links = await page.query_selector_all('a.text-blue-medium')
            logger.info(f"Found {len(links)} links for {company_name}")
            
            for link in links:
                try:
                    link_text = await link.inner_text()
                    href = await link.get_attribute('href')
                    
                    if (link_text and href and 
                        company_name.lower().strip() == link_text.lower().strip()):
                        
                        if href.startswith('/'):
                            href = f"https://www.bbb.org{href}"
                        logger.info(f"Found match: {company_name} -> {href}")
                        return href
                except:
                    continue
            
            # If no exact match, log what we did find
            logger.info(f"No exact match found for '{company_name}'. Available links:")
            for i, link in enumerate(links[:5]):  # Show first 5
                try:
                    link_text = await link.inner_text()
                    logger.info(f"  {i+1}: '{link_text}'")
                except:
                    logger.info(f"  {i+1}: <error reading text>")
            
            return None
        except Exception as e:
            logger.error(f"Error finding link by name for {company_name}: {e}")
            return None
    
    async def find_business_link_by_id(self, page, business_id: str) -> str:
        """Find business profile link by business ID"""
        try:
            # Look for links with exact class text-blue-medium that contain the business ID in href
            links = await page.query_selector_all('a.text-blue-medium')
            for link in links:
                try:
                    href = await link.get_attribute('href')
                    
                    if (href and business_id in href):
                        if href.startswith('/'):
                            href = f"https://www.bbb.org{href}"
                        return href
                except:
                    continue
            return None
        except Exception as e:
            logger.error(f"Error finding link by ID for {business_id}: {e}")
            return None
    
    async def find_business_link_fuzzy(self, page, company_name: str) -> str:
        """Find business profile link using fuzzy matching"""
        try:
            # Extract key words from company name for fuzzy matching
            key_words = [word.lower() for word in company_name.split() 
                        if word.lower() not in ['medical', 'billing', 'services', 'inc', 'llc', 'ltd', 'corp']]
            
            if not key_words:
                return None
            
            # Look for links with exact class text-blue-medium for fuzzy matching
            links = await page.query_selector_all('a.text-blue-medium')
            for link in links:
                try:
                    link_text = await link.inner_text()
                    href = await link.get_attribute('href')
                    
                    if (link_text and href):
                        link_text_lower = link_text.lower()
                        # Check if most key words are present in the link text
                        matches = sum(1 for word in key_words if word in link_text_lower)
                        if matches >= len(key_words) * 0.6:  # 60% of key words match
                            if href.startswith('/'):
                                href = f"https://www.bbb.org{href}"
                            return href
                except:
                    continue
            return None
        except Exception as e:
            logger.error(f"Error finding link fuzzy for {company_name}: {e}")
            return None
            
    def format_phone(self, phone_text: str) -> str:
        """Format phone number to +14155551234 format"""
        if not phone_text:
            return "N/A"
            
        # Extract digits only
        digits = re.sub(r'\D', '', phone_text)
        
        # Add country code if not present
        if len(digits) == 10:
            digits = '1' + digits
        elif len(digits) == 11 and digits[0] == '1':
            pass  # Already has country code
        else:
            return "N/A"
            
        return f"+{digits}"
        
    def is_unique_company(self, company_data: Dict) -> bool:
        """Check if company is unique to avoid duplicates"""
        return company_data['name'] not in self.seen_companies
        
    async def scrape_all_pages(self):
        """Scrape all pages from 1 to max_pages"""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            )
            page = await context.new_page()
            
            for page_num in range(1, self.max_pages + 1):
                await self.scrape_page(page, page_num)
                await asyncio.sleep(1)  # Respectful crawling delay
                
            await browser.close()
            
    def export_to_csv(self, filename: str = "medical_billing_companies.csv"):
        """Export scraped data to CSV"""
        if not self.companies:
            logger.warning("No companies to export")
            return
            
        df = pd.DataFrame(self.companies)
        df.to_csv(filename, index=False)
        logger.info(f"Exported {len(self.companies)} companies to {filename}")
        
    async def collect_all_urls_and_basic_data(self) -> List[Tuple[Dict, str]]:
        """Phase 1: Collect all URLs and basic data from search pages"""
        company_url_pairs = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            )
            page = await context.new_page()
            
            for page_num in range(1, self.max_pages + 1):
                try:
                    url = f"{self.base_url}{page_num}"
                    logger.info(f"Collecting URLs from page {page_num}: {url}")
                    
                    await page.goto(url, wait_until="networkidle")
                    
                    # Extract webDigitalData
                    digital_data = await page.evaluate("""
                        () => {
                            return typeof webDigitalData !== 'undefined' ? webDigitalData : null;
                        }
                    """)
                    
                    if digital_data and 'search_info' in digital_data and 'results' in digital_data['search_info']:
                        results = digital_data['search_info']['results']
                        
                        # Extract all individual page URLs from DOM once per page
                        links = await page.query_selector_all('a.text-blue-medium')
                        url_map = {}
                        
                        for link in links:
                            try:
                                link_text = await link.inner_text()
                                href = await link.get_attribute('href')
                                if href and link_text:
                                    if href.startswith('/'):
                                        href = f"https://www.bbb.org{href}"
                                    url_map[link_text.lower().strip()] = href
                            except:
                                continue
                        
                        # Match companies with their URLs
                        for result in results:
                            company_data = self.extract_company_data_from_json(result)
                            if company_data and self.is_unique_company(company_data):
                                company_name = company_data['name'].lower().strip()
                                individual_url = url_map.get(company_name)
                                
                                if individual_url:
                                    company_url_pairs.append((company_data, individual_url))
                                    self.seen_companies.add(company_data['name'])
                                    logger.info(f"Collected: {company_data['name']} -> {individual_url}")
                                else:
                                    logger.warning(f"No URL found for: {company_data['name']}")
                    
                    await asyncio.sleep(0.5)  # Brief delay between pages
                    
                except Exception as e:
                    logger.error(f"Error collecting URLs from page {page_num}: {e}")
                    continue
            
            await browser.close()
        
        logger.info(f"Phase 1 complete: Collected {len(company_url_pairs)} company-URL pairs")
        return company_url_pairs
    
    async def process_individual_page(self, company_data: Dict, individual_url: str) -> Dict:
        """Process a single individual page to extract enhanced data"""
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                )
                page = await context.new_page()
                
                # Visit individual page
                await page.goto(individual_url, wait_until="networkidle")
                company_data['url'] = individual_url
                
                # Extract JSON-LD structured data
                json_ld_data = await page.evaluate("""
                    () => {
                        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                        for (const script of scripts) {
                            try {
                                const data = JSON.parse(script.textContent);
                                if (Array.isArray(data)) {
                                    for (const item of data) {
                                        if (item['@type'] === 'LocalBusiness') {
                                            return item;
                                        }
                                    }
                                } else if (data['@type'] === 'LocalBusiness') {
                                    return data;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        return null;
                    }
                """)
                
                if json_ld_data:
                    # Extract street address
                    if 'address' in json_ld_data and 'streetAddress' in json_ld_data['address']:
                        street_address = json_ld_data['address']['streetAddress']
                        city = json_ld_data['address'].get('addressLocality', '')
                        state = json_ld_data['address'].get('addressRegion', '')
                        zip_code = json_ld_data['address'].get('postalCode', '')
                        
                        # Format full address
                        full_address = f"{street_address}, {city}, {state} {zip_code}".strip(', ')
                        company_data['address'] = full_address
                    
                    # Extract principal contact
                    if 'employee' in json_ld_data and json_ld_data['employee']:
                        employee = json_ld_data['employee'][0]  # Take first employee
                        first_name = employee.get('givenName', '')
                        middle_name = employee.get('additionalName', '')
                        last_name = employee.get('familyName', '')
                        job_title = employee.get('jobTitle', '')
                        
                        # Format principal contact
                        full_name = f"{first_name} {middle_name} {last_name}".strip().replace('  ', ' ')
                        if job_title:
                            principal_contact = f"{full_name} ({job_title})"
                        else:
                            principal_contact = full_name
                        
                        company_data['principal_contact'] = principal_contact if principal_contact else "N/A"
                    
                    logger.info(f"Enhanced: {company_data['name']}")
                
                await browser.close()
                return company_data
                
        except Exception as e:
            logger.error(f"Error processing individual page for {company_data.get('name', 'unknown')}: {e}")
            return company_data
    
    async def process_individual_pages_parallel(self, company_url_pairs: List[Tuple[Dict, str]], batch_size: int = 5):
        """Phase 2: Process individual pages in parallel batches"""
        logger.info(f"Phase 2: Processing {len(company_url_pairs)} individual pages in batches of {batch_size}")
        
        for i in range(0, len(company_url_pairs), batch_size):
            batch = company_url_pairs[i:i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (len(company_url_pairs) + batch_size - 1) // batch_size
            
            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} companies)")
            
            # Process batch in parallel
            tasks = []
            for company_data, individual_url in batch:
                task = self.process_individual_page(company_data, individual_url)
                tasks.append(task)
            
            # Wait for all tasks in batch to complete
            enhanced_companies = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Add successful results to companies list
            for result in enhanced_companies:
                if not isinstance(result, Exception):
                    self.companies.append(result)
            
            # Brief delay between batches
            await asyncio.sleep(0.5)
        
        logger.info(f"Phase 2 complete: Processed {len(self.companies)} companies")
    
    async def run_optimized(self):
        """Main method using optimized two-phase approach"""
        logger.info("Starting optimized BBB Medical Billing scraper...")
        start_time = time.time()
        
        # Phase 1: Collect all URLs and basic data
        company_url_pairs = await self.collect_all_urls_and_basic_data()
        
        phase1_time = time.time()
        logger.info(f"Phase 1 completed in {phase1_time - start_time:.2f} seconds")
        
        # Phase 2: Process individual pages in parallel
        if company_url_pairs:
            await self.process_individual_pages_parallel(company_url_pairs, batch_size=5)
        
        end_time = time.time()
        logger.info(f"Total scraping completed in {end_time - start_time:.2f} seconds")
        logger.info(f"Total companies scraped: {len(self.companies)}")
        
        self.export_to_csv()
        
    async def run(self):
        """Main method to run the scraper"""
        logger.info("Starting BBB Medical Billing scraper...")
        start_time = time.time()
        
        await self.scrape_all_pages()
        
        end_time = time.time()
        logger.info(f"Scraping completed in {end_time - start_time:.2f} seconds")
        logger.info(f"Total companies scraped: {len(self.companies)}")
        
        self.export_to_csv()

if __name__ == "__main__":
    scraper = BBBScraper()
    asyncio.run(scraper.run_optimized())