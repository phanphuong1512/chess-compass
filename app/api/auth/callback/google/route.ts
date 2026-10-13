import { NextRequest, NextResponse } from 'next/server';
import { getAuthConfig, signSession, COOKIE_NAME, type AuthUser } from '@/lib/auth';
import { getD1Database } from '@/lib/db/d1';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const host = request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = `${proto}://${host}/api/auth/callback/google`;
  const homeUrl = `${proto}://${host}/`;

  if (error || !code) {
    console.error('Google OAuth error or missing code:', error);
    return NextResponse.redirect(`${homeUrl}?auth_error=${encodeURIComponent(error || 'missing_code')}`);
  }

  const { clientId, clientSecret, authSecret } = await getAuthConfig();

  try {
    // 1. Exchange code for access_token and id_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_id_secret: clientSecret,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Failed to exchange code for tokens:', tokenRes.status, errText);
      return NextResponse.redirect(`${homeUrl}?auth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google UserInfo
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      console.error('Failed to fetch userinfo from Google');
      return NextResponse.redirect(`${homeUrl}?auth_error=userinfo_failed`);
    }

    const userInfo = await userInfoRes.json();
    const user: AuthUser = {
      id: String(userInfo.sub),
      email: String(userInfo.email),
      name: String(userInfo.name || userInfo.email.split('@')[0]),
      picture: userInfo.picture ? String(userInfo.picture) : undefined,
    };

    // 3. Upsert user in Cloudflare D1 if available
    try {
      const db = await getD1Database();
      if (db) {
        await db
          .prepare(
            `CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              email TEXT NOT NULL,
              name TEXT,
              picture TEXT,
              created_at INTEGER NOT NULL,
              last_login INTEGER NOT NULL
            )`
          )
          .run();

        await db
          .prepare(
            `INSERT INTO users (id, email, name, picture, created_at, last_login)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               picture = excluded.picture,
               last_login = excluded.last_login`
          )
          .bind(user.id, user.email, user.name, user.picture || '', Date.now(), Date.now())
          .run();
      }
    } catch (d1Err) {
      console.warn('Failed to upsert user in D1 (deferred):', d1Err);
    }

    // 4. Sign JWT session
    const sessionToken = await signSession(user, authSecret);

    // 5. Create redirect response and set HTTP-only cookie
    const response = NextResponse.redirect(homeUrl);
    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (err) {
    console.error('Unexpected error in Google OAuth callback:', err);
    return NextResponse.redirect(`${homeUrl}?auth_error=internal_error`);
  }
}
