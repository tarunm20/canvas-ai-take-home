## **BBB Scraper project \+ Web App (Timeline: 1-2 days)**

## **A: Scraper Development (BBB Medical Billing)**

**Goal:** Write a Playwright-based Python scraper that collects all A-rated “Medical Billing” listings from BBB and exports a clean CSV. https://playwright.dev/

Link: https://www.bbb.org/search?filter\_category=60548-100\&filter\_category=60142-000\&filter\_ratings=A\&find\_country=USA\&find\_text=Medical+Billing\&page=1

**Scope:**

1. Scrape pages 1–15 from the BBB search URL.  
2. Extract:  
   * `name`  
   * `phone` (formatted as \+14155551234)  
   * `principal_contact`  
   * `url`  
   * street address (if available)  
   * accreditation status (if available)  
3. Enforce deduplication, respectful crawling, and data accuracy.

**Deliverables:**

* `medical_billing_companies.csv`  
* README section with:  
  * Search URL  
  * Method overview  
  * Reproduction instructions  
  * Issues encountered

## **B: Stagehand Automation Module**

**Goal:** Wrap the scraper into a Stagehand-compatible module so it can be programmatically invoked. https://www.stagehand.dev/ . Please do this in a [next.js](http://next.js) project

**Scope:**

1. Design a Stagehand script that:  
   * Accepts a URL  
   * Runs the scraper end-to-end  
   * Returns CSV or structured JSON payload  
2. Document:  
   * Prompt format  
   * Invocation steps  
   * Output structure  
3. Goal: Replace the explicit playwright defined scraper with llm-driven stagehand.

**Deliverables:**

* Stagehand script  
* Example invocation  
* README section detailing how to call it

---

## **C: Web App \+ Database Integration**

**Goal:** Build a minimal web application that ties the scraper module into a GUI workflow and persistent storage using Supabase.

**Scope:**

1. **Front-end UI**  
   * Simple form to submit a target URL (the bbb link)  
2. **Backend API**  
   * Endpoint that:  
     * Receives URL  
     * Invokes Stagehand wrapper from Project B  
     * Returns scraper output  
3. **Database**  
   * Define a Supabase table matching the CSV structure  
   * Persist results via backend endpoint  
4. **Results Display**  
   * Query completed data from Supabase  
   * Render in UI (e.g., data table)

Define your own Supabase Project and define the ui and api in the same [next.js](http://next.js) project from module B

**Deliverables:**

* Simple front-end \+ API backend  
* Supabase schema  
* UI that shows scraped result list post-run  
* README section for setup & run

OPENAI\_API\_KEY=“sk-5pQZTyyZSu4ti6mZlAfSPfJdmLEnUfyvIhQm63K\_ewT3BlbkFJ5YY9SmBNb2ltfLw6HN\_fzpDKeVf9HkWovuK-X7h\_MA”  
​​BROWSERBASE\_API\_KEY=“bb\_live\_XobUNqMkNQPjhhc9fsidddaRhD0”  
BROWSERBASE\_PROJECT\_ID=“1e29f9f3-9e80-4096-877d-b89bbe109b58"

