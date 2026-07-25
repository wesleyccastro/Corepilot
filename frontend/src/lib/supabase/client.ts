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

/**
 * Returns one browser client for the lifetime of the application.
 *
 * The Supabase browser client persists the session and refreshes access tokens
 * automatically. Server-side helpers and Next.js middleware are intentionally
 * not used because this application is a client-rendered Vite SPA.
 */
export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      requireEnvironmentVariable(supabaseUrl, 'VITE_SUPABASE_URL'),
      requireEnvironmentVariable(
        supabasePublishableKey,
        'VITE_SUPABASE_PUBLISHABLE_KEY',
      ),
    );
  }

  return browserClient;
}

export const supabase = createClient();
