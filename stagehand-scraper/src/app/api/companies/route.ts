import { NextRequest, NextResponse } from 'next/server';
import { CompanyService } from '@/lib/company-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');

    const offset = (page - 1) * limit;

    if (search) {
      // Search companies
      const companies = await CompanyService.searchCompanies(search, limit);
      return NextResponse.json({
        success: true,
        data: companies,
        totalCount: companies.length,
        page,
        limit,
        search,
      });
    } else {
      // Get paginated companies
      const { companies, totalCount } = await CompanyService.getCompanies(limit, offset);
      return NextResponse.json({
        success: true,
        data: companies,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      });
    }
  } catch (error) {
    console.error('Companies API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');
    const deleteAll = searchParams.get('deleteAll') === 'true';

    if (deleteAll) {
      await CompanyService.deleteAllCompanies();
      return NextResponse.json({
        success: true,
        message: 'All companies deleted successfully',
      });
    } else if (ids) {
      const companyIds = ids.split(',');
      await CompanyService.deleteCompanies(companyIds);
      return NextResponse.json({
        success: true,
        message: `${companyIds.length} companies deleted successfully`,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'No company IDs provided' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Companies Delete API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}