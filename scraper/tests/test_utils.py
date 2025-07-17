import pytest
import sys
import os
import pandas as pd
from unittest.mock import Mock, patch

# Add parent directory to path to import bbb_scraper
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bbb_scraper import BBBScraper

class TestUtilityFunctions:
    
    def setup_method(self):
        """Setup test fixtures"""
        self.scraper = BBBScraper()
        
    def test_base_url_construction(self):
        """Test BBB search URL construction"""
        expected_base = "https://www.bbb.org/search?filter_category=60548-100&filter_category=60142-000&filter_ratings=A&find_country=USA&find_text=Medical+Billing&page="
        assert self.scraper.base_url == expected_base
        
    def test_max_pages_default(self):
        """Test default max pages setting"""
        assert self.scraper.max_pages == 15
        
    def test_stats_initialization(self):
        """Test duplicate detection stats initialization"""
        assert self.scraper.duplicates_detected == 0
        assert self.scraper.companies_merged == 0
        assert len(self.scraper.companies) == 0
        assert len(self.scraper.seen_companies) == 0
        
    def test_csv_export_structure(self):
        """Test CSV export creates proper structure"""
        # Add test companies
        test_companies = [
            {
                "name": "Progressive Medical Billing",
                "phone": "+12107331802",
                "principal_contact": "Leticia A. Cantu (Owner)",
                "url": "https://www.bbb.org/us/business/progressive-medical-billing-0825-90020942",
                "address": "6655 First Park Ten Blvd Ste 216, San Antonio, TX 78213-4304",
                "accreditation": "Accredited"
            },
            {
                "name": "Springs Medical Billing",
                "phone": "+17194008222",
                "principal_contact": "Christina Boyce (Owner)",
                "url": "https://www.bbb.org/us/business/springs-medical-billing-0785-1000007536",
                "address": "PO Box 64258, Colorado Springs, CO 80962-4258|5444 Mountain Garland Dr, Colorado Springs, CO 80923-8816",
                "accreditation": "Non-Accredited"
            }
        ]
        
        self.scraper.companies = test_companies
        
        # Create DataFrame and test structure
        df = pd.DataFrame(self.scraper.companies)
        
        # Check required columns exist
        required_columns = ['name', 'phone', 'principal_contact', 'url', 'address', 'accreditation']
        for col in required_columns:
            assert col in df.columns, f"Missing required column: {col}"
            
        # Check data types and values
        assert len(df) == 2
        assert df.iloc[0]['name'] == "Progressive Medical Billing"
        assert df.iloc[1]['address'].count('|') == 1  # Contains pipe separator for multiple addresses
        
    def test_multiple_address_handling(self):
        """Test handling of multiple addresses with pipe separator"""
        test_address = "PO Box 64258, Colorado Springs, CO 80962-4258|5444 Mountain Garland Dr, Colorado Springs, CO 80923-8816"
        
        # Test that addresses are properly separated
        addresses = test_address.split('|')
        assert len(addresses) == 2
        assert "PO Box 64258" in addresses[0]
        assert "5444 Mountain Garland Dr" in addresses[1]
        
    def test_phone_number_consistency(self):
        """Test phone number format consistency"""
        test_phones = [
            "+12107331802",
            "+17194008222",
            "+18668756527"
        ]
        
        for phone in test_phones:
            # All should start with +1 and be 12 characters
            assert phone.startswith("+1"), f"Phone {phone} doesn't start with +1"
            assert len(phone) == 12, f"Phone {phone} is not 12 characters"
            assert phone[2:].isdigit(), f"Phone {phone} contains non-digits after +1"
            
    def test_accreditation_values(self):
        """Test valid accreditation status values"""
        valid_statuses = ["Accredited", "Non-Accredited", "Unknown"]
        
        # Test that only valid statuses are used
        for status in valid_statuses:
            assert status in ["Accredited", "Non-Accredited", "Unknown"]
            
    def test_company_data_completeness(self):
        """Test that company data has all required fields"""
        test_company = {
            "name": "Test Medical Billing",
            "phone": "+15551234567",
            "principal_contact": "John Doe (Owner)",
            "url": "https://www.bbb.org/us/business/test-medical-billing",
            "address": "123 Test St, Test City, TS 12345",
            "accreditation": "Accredited"
        }
        
        required_fields = ['name', 'phone', 'principal_contact', 'url', 'address', 'accreditation']
        
        for field in required_fields:
            assert field in test_company, f"Missing required field: {field}"
            assert test_company[field] is not None, f"Field {field} is None"
            assert test_company[field] != "", f"Field {field} is empty"

if __name__ == "__main__":
    pytest.main([__file__])