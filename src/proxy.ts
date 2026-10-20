import { NextRequest, NextResponse } from 'next/server';
import { authEnabled, sessionUser } from './server/auth/core';
import { databasePath, openDatabase } from './server/db/connection';
export async function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    if (['/api/liveness','/api/cron/collect','/api/webhooks/apify','/api/webhooks/telegram'].includes(path))
        return NextResponse.next();
    if (process.env.APP_ENV === 'production' && (process.env.SAQ_AUTH_MODE === 'local' || process.env.SAQ_DEMO_MODE === '1'))
        return new NextResponse('Invalid production configuration', { status: 503 });
    if (!authEnabled() || path === '/login')
        return NextResponse.next();
    const token = request.cookies.get('saq_session')?.value;
    let user = null;
    if (token) {
        try {
            const db = (await openDatabase(databasePath(), { readOnly: true }));
            try {
                user = (await sessionUser(db, token));
            }
            finally {
                db.close();
            }
        }
        catch {
            return new NextResponse('Service unavailable', { status: 503 });
        }
    }
    if (!user) {
        if (path.startsWith('/api/')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        const destination = new URL('/login', request.url);
        destination.searchParams.set('next', path + request.nextUrl.search);
        return NextResponse.redirect(destination);
    }
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'] };
