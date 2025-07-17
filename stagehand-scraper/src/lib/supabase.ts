import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types with arrays for multiple values
export interface Company {
  id: string;
  name: string;
  phones: string[] | null;
  principal_contacts: string[] | null;
  urls: string[] | null;
  addresses: string[] | null;
  accreditation: string | null;
  scraped_at: string;
  source_url: string | null;
  page_count: number | null;
}

export interface CompanyInsert {
  name: string;
  phones?: string[];
  principal_contacts?: string[];
  urls?: string[];
  addresses?: string[];
  accreditation?: string;
  source_url?: string;
  page_count?: number;
}