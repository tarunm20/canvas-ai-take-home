# BBB Medical Billing Scraper

A multi-phase web scraping system for extracting medical billing company data from the Better Business Bureau.

## Phase A: Python BBB Scraper

**Setup:**
```bash
cd scraper
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install
```

**Run:**
```bash
python bbb_scraper.py
```

**Output:** `medical_billing_companies.csv` with consolidated company data

## Phase B: Stagehand AI Automation

**Setup:**
```bash
cd stagehand-scraper
npm install
```

**Environment:**
Create `.env.local`:
```
OPENAI_API_KEY=sk-your-openai-api-key-here
STAGEHAND_MODEL_NAME=openai/gpt-4o-mini
STAGEHAND_ENV=LOCAL
NODE_ENV=development
```

**Run:**
```bash
npm run dev
```

**API:** `POST /api/scrape` with optional parameters

## Phase C: Web App + Database

**Setup:**
```bash
cd stagehand-scraper
npm install
```

**Environment:**
Update `.env.local`:
```
OPENAI_API_KEY=sk-your-openai-api-key-here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
STAGEHAND_MODEL_NAME=openai/gpt-4o-mini
STAGEHAND_ENV=LOCAL
NODE_ENV=development
```

**Run:**
```bash
npm run dev
```

**Access:** http://localhost:3000

## Quick Start

1. **Python scraper**: `cd scraper && python bbb_scraper.py`
2. **Web app**: `cd stagehand-scraper && npm run dev`
3. **Browse to**: http://localhost:3000

## Running Tests

### Python Scraper Tests
```bash
cd scraper
pip install -r tests/requirements.txt
python -m pytest tests/ -v
```

### Stagehand Scraper Tests
```bash
cd stagehand-scraper
npm install
npm test
```

**Test Coverage:**
- **Python**: Duplicate detection, phone formatting, data merging
- **Stagehand**: API endpoints, data extraction, database integration

## Stagehand Scraper API

### POST /api/scrape

**URL:** `http://localhost:3000/api/scrape`

**Request Body:**
```json
{
  "targetUrl": "https://example.com",              // optional, defaults to BBB medical billing
  "maxPages": 2,                                   // optional, default: 1, max: 15
  "format": "json",                                // optional, "json" | "csv"
  "extractionInstructions": "Extract company data" // optional, custom AI instructions
}
```

**Response (JSON):**
```json
{
  "success": true,
  "data": [
    {
      "name": "Progressive Medical Billing",
      "phone": "+12107331802",
      "principal_contact": "Leticia A. Cantu (Owner)",
      "url": "https://www.bbb.org/us/tx/san-antonio/profile/...",
      "address": "6655 First Park Ten Blvd Ste 216, San Antonio, TX 78213-4304",
      "accreditation": "Accredited"
    }
  ],
  "totalCompanies": 12,
  "executionTime": 29380,
  "savedToDatabase": true,
  "savedCount": 12,
  "duplicatesSkipped": 0
}
```

**Response (CSV):**
Returns CSV file download with same data structure.

**Examples:**

```bash
# Default BBB scraping
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 2, "format": "json"}'

# Custom website scraping
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com/companies",
    "maxPages": 3,
    "format": "csv",
    "extractionInstructions": "Extract company names, addresses, and phone numbers"
  }'
```