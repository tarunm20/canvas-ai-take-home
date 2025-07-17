import { NextResponse } from 'next/server';
import { CompanyService } from '@/lib/company-service';

export async function GET() {
  try {
    const stats = await CompanyService.getStats();
    
    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Stats API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}