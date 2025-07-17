# BBB Medical Billing Scraper API - Stagehand Integration

A Next.js web application featuring AI-powered Stagehand automation for intelligent web scraping with fallback to high-performance Python scraper.

## Overview

This project implements **Phase B** of the take-home assignment, featuring Stagehand's LLM-driven automation that can scrape any website using natural language instructions. It includes a high-performance Python fallback specifically optimized for BBB medical billing searches.

### Key Features

- **🤖 AI-Powered Stagehand**: LLM-driven automation using natural language instructions
- **🔗 Flexible URL Support**: Scrape any website, not just BBB 
- **🧠 Self-Healing Selectors**: Adapts automatically when websites change
- **⚡ Python Fallback**: High-performance optimized scraper for BBB
- **📊 Dual Output**: JSON API responses and CSV downloads
- **🎯 Cost Tracking**: Monitor LLM API usage and calls

## Architecture

```
stagehand-scraper/
├── src/app/
│   ├── api/scrape/route.ts    # REST API endpoint
│   └── page.tsx               # Web interface
├── scraper/
│   ├── bbb_scraper.py         # Python scraper from Phase A
│   └── requirements.txt       # Python dependencies
└── package.json               # Node.js dependencies
```

## Features

- **REST API**: POST `/api/scrape` for programmatic access
- **Web Interface**: User-friendly form at `http://localhost:3000`
- **Flexible Output**: JSON response or CSV download
- **Configurable**: Adjustable page count (1-15 pages)
- **Real-time Progress**: Loading states and execution metrics

## Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+ with pip (for fallback scraper)
- OpenAI API Key (for Stagehand)
- Git

### Quick Start

1. **Clone and install dependencies:**
```bash
git clone <repository>
cd stagehand-scraper
npm install
```

2. **Configure OpenAI API Key:**
```bash
# Copy the environment template
cp .env.local.example .env.local

# Edit .env.local and add your OpenAI API key:
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
```

3. **Install Python dependencies (for fallback):**
```bash
cd scraper
pip install -r requirements.txt
playwright install
cd ..
```

4. **Start the development server:**
```bash
npm run dev
```

5. **Open your browser:**
```
http://localhost:3000
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Required for Stagehand
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional configurations
STAGEHAND_MODEL_NAME=openai/gpt-4.1-mini
STAGEHAND_ENV=LOCAL
NODE_ENV=development
```

## API Reference

### POST /api/scrape

Programmatically invoke the BBB medical billing scraper.

**Request Body:**
```json
{
  "targetUrl": "https://example.com/companies",    // optional, custom URL to scrape
  "maxPages": 2,                                   // optional, default: 15, range: 1-15
  "format": "json",                                // optional, default: "json", options: "json" | "csv"
  "method": "stagehand",                           // optional, default: "stagehand", options: "stagehand" | "python"
  "extractionInstructions": "Extract company data" // optional, custom instructions for Stagehand
}
```

**Success Response (JSON format):**
```json
{
  "success": true,
  "data": [
    {
      "name": "Progressive Medical Billing",
      "phone": "+12107331802",
      "principal_contact": "Leticia A. Cantu (Owner)",
      "url": "https://www.bbb.org/us/tx/san-antonio/profile/billing-services/progressive-medical-billing-0825-90020942",
      "address": "6655 First Park Ten Blvd Ste 216, San Antonio, TX 78213-4304",
      "accreditation": "Accredited"
    }
  ],
  "totalCompanies": 25,
  "executionTime": 29380,
  "metadata": {
    "targetUrl": "https://www.bbb.org/search?...",
    "maxPages": 2,
    "llmCalls": 8,
    "model": "openai/gpt-4.1-mini",
    "method": "stagehand",
    "format": "json",
    "timestamp": "2025-07-16T22:02:42.621Z"
  }
}
```

**Success Response (CSV format):**
Returns CSV file as attachment with `Content-Type: text/csv`

**Error Response:**
```json
{
  "error": "Error description",
  "details": "Additional error details if available"
}
```

### GET /api/scrape

Returns API documentation and usage information.

## Usage Examples

### cURL Examples

**Stagehand BBB Scraping:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 2, "format": "json", "method": "stagehand"}'
```

**Stagehand Custom Website:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com/companies",
    "maxPages": 3,
    "format": "json",
    "method": "stagehand",
    "extractionInstructions": "Extract company names, addresses, and phone numbers"
  }'
```

**Python Fallback (BBB Optimized):**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"maxPages": 2, "format": "csv", "method": "python"}' \
  -o medical_billing_companies.csv
```

### JavaScript/TypeScript

```typescript
const response = await fetch('http://localhost:3000/api/scrape', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    maxPages: 5,
    format: 'json'
  })
});

const result = await response.json();
console.log(`Found ${result.totalCompanies} companies`);
```

### Python

```python
import requests

response = requests.post('http://localhost:3000/api/scrape', json={
    'maxPages': 3,
    'format': 'json'
})

data = response.json()
print(f"Scraped {data['totalCompanies']} companies in {data['executionTime']/1000:.1f}s")
```

## Web Interface

The web interface at `http://localhost:3000` provides:

- **Configuration Form**: Set max pages (1-15) and output format
- **Real-time Progress**: Loading indicators and status updates
- **Results Display**: Tabular view of scraped company data
- **CSV Download**: Direct download functionality
- **Error Handling**: User-friendly error messages

## Performance

- **Execution Time**: ~30 seconds for 15 pages (~180 companies)
- **Parallel Processing**: 5 concurrent individual page requests
- **Memory Efficient**: Processes companies in batches
- **Respectful Crawling**: Built-in delays and rate limiting

## Data Schema

Each scraped company includes:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Company name | "Progressive Medical Billing" |
| `phone` | string | Phone number (+1 format) | "+12107331802" |
| `principal_contact` | string | Contact person with title | "Leticia A. Cantu (Owner)" |
| `url` | string | BBB profile URL | "https://www.bbb.org/us/tx/..." |
| `address` | string | Full street address | "6655 First Park Ten Blvd..." |
| `accreditation` | string | BBB accreditation status | "Accredited" |

## Error Handling

The API handles various error scenarios:

- **Python Script Errors**: Captures stderr and exit codes
- **Missing Dependencies**: Validates Python environment
- **File System Errors**: Handles missing files and permissions
- **Network Errors**: Graceful handling of connection issues
- **Invalid Parameters**: Validates input ranges and formats

## Development

### Project Structure

- **Frontend**: React with TypeScript and Tailwind CSS
- **API**: Next.js API routes with Node.js
- **Scraper**: Python with Playwright browser automation
- **Data**: CSV output with JSON API responses

### Key Files

- `src/app/api/scrape/route.ts`: Main API endpoint logic
- `src/app/page.tsx`: React frontend component
- `scraper/bbb_scraper.py`: Python scraper (Phase A)
- `package.json`: Node.js dependencies and scripts

### Running in Production

```bash
npm run build
npm start
```

## Integration with Phase C

This API is designed to integrate seamlessly with Phase C (Supabase database integration):

- **Structured JSON**: Ready for database insertion
- **Batch Processing**: Supports large dataset handling
- **Error Recovery**: Robust error handling for production use
- **Monitoring**: Execution metrics for performance tracking

## Dependencies

### Node.js Dependencies
- `next`: 15.4.1 - React framework
- `react`: 19.0.0 - UI library
- `typescript`: 5.7.3 - Type safety
- `tailwindcss`: 3.4.15 - Styling

### Python Dependencies
- `playwright`: 1.53.0 - Browser automation
- `pandas`: 2.3.1 - Data processing
- `requests`: 2.32.4 - HTTP client

## License

This project is for educational and research purposes only. Please respect BBB's terms of service and implement appropriate rate limiting.

## Support

For issues or questions:
1. Check the browser console for frontend errors
2. Check the terminal for API server logs
3. Verify Python dependencies are installed correctly
4. Ensure Playwright browsers are installed (`playwright install`)