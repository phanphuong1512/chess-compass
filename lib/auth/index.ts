import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

const DEFAULT_SECRET = '9f1a238b7e2c45d6a89c10f34e56b789123456789abcdef0123456789abcdef0';
export const COOKIE_NAME = 'cc_session';

export async function getAuthConfig() {
  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let authSecret = process.env.AUTH_SECRET || DEFAULT_SECRET;

  if (!clientId || !clientSecret) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openNext: any = await (Function('return import("@opennextjs/cloudflare")')() as Promise<any>).catch(() => null);
      if (openNext?.getCloudflareContext) {
        const { env } = await openNext.getCloudflareContext();
        clientId = clientId || (env as any)?.GOOGLE_CLIENT_ID;
        clientSecret = clientSecret || (env as any)?.GOOGLE_CLIENT_SECRET;
        authSecret = authSecret || (env as any)?.AUTH_SECRET || DEFAULT_SECRET;
      }
    } catch {
      // Ignore if not in Cloudflare context
    }
  }

  return {
    clientId: clientId || '',
    clientSecret: clientSecret || '',
    authSecret,
  };
}

function getSecretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSession(user: AuthUser, secret: string = DEFAULT_SECRET): Promise<string> {
  const key = getSecretKey(secret);
  return new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key);
}

export async function verifySession(token: string, secret: string = DEFAULT_SECRET): Promise<AuthUser | null> {
  try {
    const key = getSecretKey(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (!payload.id || !payload.email) return null;
    const email = String(payload.email);
    return {
      id: String(payload.id),
      email,
      name: String(payload.name || (email.includes('@') ? email.split('@')[0] : 'User')),
      picture: payload.picture ? String(payload.picture) : undefined,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);
    if (!sessionCookie?.value) return null;

    const { authSecret } = await getAuthConfig();
    return await verifySession(sessionCookie.value, authSecret);
  } catch {
    return null;
  }
}
