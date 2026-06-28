import { NextResponse } from 'next/server';

// Liveness probe consumed by the container HEALTHCHECK (DEP-5).
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok', service: 'ic-merchant' });
}
