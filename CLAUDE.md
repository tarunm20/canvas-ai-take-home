# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a multi-phase BBB (Better Business Bureau) scraper project with three components:

- **Phase A**: Python-based scraper (`/scraper/`) - High-performance Playwright scraper for BBB medical billing companies
- **Phase B**: Stagehand integration (`/stagehand-scraper/`) - Next.js web app with AI-powered Stagehand automation
- **Phase C**: Database integration (planned) - Supabase integration for data persistence

## Development Commands

### Next.js Web Application (stagehand-scraper/)
```bash
cd stagehand-scraper
npm install              # Install dependencies
npm run dev             # Start development server (localhost:3000)
npm run build           # Build for production
npm start               # Start production server
npm run lint            # Run ESLint
```

### Python Scraper (scraper/)
```bash
cd scraper
python -m venv venv                    # Create virtual environment
source venv/bin/activate               # Activate virtual environment (Unix)
# or venv\Scripts\activate            # Activate virtual environment (Windows)
pip install -r requirements.txt       # Install dependencies
playwright install                    # Install browser dependencies
python bbb_scraper.py                 # Run the scraper
```

## Environment Configuration

The Stagehand application requires OpenAI API access. Create `.env.local` in the stagehand-scraper directory:

```
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
STAGEHAND_MODEL_NAME=openai/gpt-4o-mini
STAGEHAND_ENV=LOCAL
NODE_ENV=development
```

## Architecture Overview

### Phase B (Current): Stagehand Web Scraper
- **Frontend**: React/Next.js with TypeScript and Tailwind CSS
- **API**: Next.js API routes at `/api/scrape`
- **Core Logic**: `src/lib/phase-b-scraper.ts` - Main Stagehand automation class
- **AI Integration**: Uses OpenAI GPT-4o-mini for intelligent web scraping

### Key Components

**API Endpoint** (`src/app/api/scrape/route.ts`):
- Handles POST requests for scraping
- Supports both BBB-optimized and custom URL scraping
- Returns JSON or CSV format
- Validates OpenAI API configuration

**Scraper Class** (`src/lib/phase-b-scraper.ts`):
- `PhaseBScraper` class with Stagehand integration
- Two-phase approach: bulk extraction + parallel detail enhancement
- Configurable batch processing (5 concurrent instances)
- AI-driven extraction using natural language instructions

**Frontend** (`src/app/page.tsx`):
- React form for scraper configuration
- Real-time progress indicators
- Results display and CSV download

### Data Schema
Each scraped company includes:
- `name`: Company name
- `phone`: Formatted phone (+1XXXXXXXXXX)
- `principal_contact`: Contact person with title
- `url`: BBB profile URL
- `address`: Complete street address
- `accreditation`: BBB accreditation status

## API Usage

**POST /api/scrape**
```json
{
  "targetUrl": "https://example.com/companies",    // optional, defaults to BBB
  "maxPages": 2,                                   // optional, default: 1, max: 15
  "format": "json",                                // optional, "json" | "csv"
  "extractionInstructions": "Extract company data" // optional, custom AI instructions
}
```

## Performance Characteristics

- **BBB Scraping**: ~30 seconds for 15 pages (~180 companies)
- **Parallel Processing**: 5 concurrent Stagehand instances
- **LLM Calls**: ~8-12 calls per page (depends on company count)
- **Memory**: Processes companies in batches to manage resources

## Development Notes

- The scraper includes duplicate method definitions that should be cleaned up
- Rate limiting is implemented with 500ms delays between batches
- Error handling includes graceful fallbacks for failed company processing
- API key validation prevents common configuration errors

## Testing

No formal test suite is currently implemented. Manual testing via:
1. Web interface at localhost:3000
2. Direct API calls to `/api/scrape`
3. Python scraper execution for baseline comparison

## Dependencies

**Node.js** (stagehand-scraper/):
- `@browserbasehq/stagehand`: AI-powered browser automation
- `next`: 15.4.1 - React framework
- `typescript`: Type safety

**Python** (scraper/):
- `playwright`: 1.53.0 - Browser automation
- `pandas`: 2.3.1 - Data processing
- `requests`: 2.32.4 - HTTP client