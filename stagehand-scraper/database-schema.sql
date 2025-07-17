-- Supabase Database Schema for BBB Medical Billing Scraper
-- Run this SQL in your Supabase SQL editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create companies table with arrays for multiple values
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phones TEXT[], -- Array of phone numbers
    principal_contacts TEXT[], -- Array of principal contacts
    urls TEXT[], -- Array of URLs
    addresses TEXT[], -- Array of addresses
    accreditation TEXT, -- Single value
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source_url TEXT,
    page_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_scraped_at ON companies(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_source_url ON companies(source_url);
CREATE INDEX IF NOT EXISTS idx_companies_accreditation ON companies(accreditation);

-- Create indexes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_companies_name_lower ON companies(LOWER(TRIM(name)));

-- Create GIN indexes for array columns (for fast array searches using default array operators)
CREATE INDEX IF NOT EXISTS idx_companies_phones_gin ON companies USING GIN(phones);
CREATE INDEX IF NOT EXISTS idx_companies_principal_contacts_gin ON companies USING GIN(principal_contacts);
CREATE INDEX IF NOT EXISTS idx_companies_urls_gin ON companies USING GIN(urls);
CREATE INDEX IF NOT EXISTS idx_companies_addresses_gin ON companies USING GIN(addresses);

-- Add unique constraint to prevent exact duplicate company names (case-insensitive)
-- Note: This will prevent exact duplicates but allow similar variations
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name_unique ON companies(LOWER(TRIM(name)));

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE OR REPLACE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your security requirements)
CREATE POLICY "Enable read access for all users" ON companies FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON companies FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON companies FOR DELETE USING (true);

-- Create a view for company statistics (updated for arrays)
CREATE OR REPLACE VIEW company_stats AS
SELECT 
    COUNT(*) as total_companies,
    COUNT(DISTINCT source_url) as unique_sources,
    MAX(scraped_at) as last_scraped_at,
    COUNT(CASE WHEN accreditation = 'Accredited' THEN 1 END) as accredited_count,
    COUNT(CASE WHEN accreditation = 'Non-Accredited' THEN 1 END) as non_accredited_count,
    COUNT(CASE WHEN phones IS NOT NULL AND array_length(phones, 1) > 0 THEN 1 END) as companies_with_phone,
    COUNT(CASE WHEN principal_contacts IS NOT NULL AND array_length(principal_contacts, 1) > 0 THEN 1 END) as companies_with_contact,
    SUM(COALESCE(array_length(addresses, 1), 0)) as total_locations,
    AVG(COALESCE(array_length(addresses, 1), 0)) as avg_locations_per_company
FROM companies;

-- Sample queries for testing with arrays:
-- 1. Get all companies ordered by latest scraped
-- SELECT * FROM companies ORDER BY scraped_at DESC LIMIT 10;

-- 2. Get companies by accreditation status
-- SELECT * FROM companies WHERE accreditation = 'Accredited';

-- 3. Search companies by name
-- SELECT * FROM companies WHERE name ILIKE '%medical%';

-- 4. Get statistics
-- SELECT * FROM company_stats;

-- 5. Get companies from specific source
-- SELECT * FROM companies WHERE source_url LIKE '%bbb.org%';

-- 6. Search companies by phone number (array search)
-- SELECT * FROM companies WHERE phones @> ARRAY['555-123-4567'];

-- 7. Search companies by address containing text (array search)
-- SELECT * FROM companies WHERE addresses::text ILIKE '%texas%';

-- 8. Find companies with multiple locations
-- SELECT name, array_length(addresses, 1) as location_count FROM companies WHERE array_length(addresses, 1) > 1;

-- 9. Get all unique addresses across all companies
-- SELECT DISTINCT unnest(addresses) as address FROM companies ORDER BY address;

-- 10. Find companies with specific contact
-- SELECT * FROM companies WHERE principal_contacts @> ARRAY['John Doe'];