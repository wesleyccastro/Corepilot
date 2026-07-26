const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

export async function apiFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  if (!API_BASE_URL) {
    throw new Error('Missing VITE_API_BASE_URL. Configure it in .env.local.');
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
