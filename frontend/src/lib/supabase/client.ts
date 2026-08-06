import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function requireEnvironmentVariable(
  value: string | undefined,
  name: string,
): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and configure Supabase.`,
    );
  }

  return value;
}

let browserClient: SupabaseClient | undefined;

const REMEMBER_SESSION_STORAGE_KEY = 'corepilot:remember-session';
const REMEMBER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Whether the session cookie should survive a browser restart ("Manter
 * conectado por 30 dias"). Tracked outside of the auth cookies themselves
 * (in localStorage) because @supabase/ssr always forces its own 400-day
 * maxAge on the cookies it writes — see setAll below for where that gets
 * overridden per this preference.
 */
export function setRememberSession(remember: boolean): void {
  window.localStorage.setItem(REMEMBER_SESSION_STORAGE_KEY, remember ? '1' : '0');
}

function shouldRememberSession(): boolean {
  return window.localStorage.getItem(REMEMBER_SESSION_STORAGE_KEY) !== '0';
}

function parseDocumentCookies(): { name: string; value: string }[] {
  if (!document.cookie) return [];
  return document.cookie.split('; ').map((pair) => {
    const separatorIndex = pair.indexOf('=');
    const name = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);
    return { name, value: decodeURIComponent(rawValue) };
  });
}

/**
 * Rewrites the maxAge that @supabase/ssr assigns to the cookies it persists,
 * so "Manter conectado" actually controls whether the session outlives the
 * browser session instead of always getting the library's fixed 400-day
 * cookie. A maxAge of 0 is always a deletion and must be left untouched.
 */
function writeDocumentCookies(cookiesToSet: { name: string; value: string; options: CookieSerializeOptions }[]) {
  const remember = shouldRememberSession();

  for (const { name, value, options } of cookiesToSet) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.sameSite) {
      const sameSite = String(options.sameSite);
      parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
    }
    if (options.secure) parts.push('Secure');

    if (options.maxAge === 0) {
      parts.push('Max-Age=0');
    } else if (remember) {
      parts.push(`Max-Age=${REMEMBER_SESSION_MAX_AGE_SECONDS}`);
    }
    // else: no Max-Age/Expires at all -> browser treats it as a session cookie.

    document.cookie = parts.join('; ');
  }
}

interface CookieSerializeOptions {
  path?: string;
  domain?: string;
  sameSite?: string | boolean;
  secure?: boolean;
  maxAge?: number;
}

/**
 * Returns one browser client for the lifetime of the application.
 *
 * The Supabase browser client persists the session and refreshes access tokens
 * automatically. Server-side helpers and Next.js middleware are intentionally
 * not used because this application is a client-rendered Vite SPA. Cookie
 * read/write is overridden (rather than left to the library default) purely
 * to make the maxAge respect the "remember me" preference above.
 */
export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      requireEnvironmentVariable(supabaseUrl, 'VITE_SUPABASE_URL'),
      requireEnvironmentVariable(
        supabasePublishableKey,
        'VITE_SUPABASE_PUBLISHABLE_KEY',
      ),
      {
        cookies: {
          getAll: () => parseDocumentCookies(),
          setAll: (cookiesToSet) => writeDocumentCookies(cookiesToSet),
        },
      },
    );
  }

  return browserClient;
}

export const supabase = createClient();
