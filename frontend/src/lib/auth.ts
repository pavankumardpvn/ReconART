"use client";

let tokenGetter: (() => Promise<string | null>) | null = null;
let cachedToken: string | null = null;
let tokenExpiry = 0;

export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  if (tokenGetter) {
    cachedToken = await tokenGetter();
    tokenExpiry = Date.now() + 30_000;
    return cachedToken;
  }
  return null;
}

export async function refreshToken(): Promise<string | null> {
  cachedToken = null;
  tokenExpiry = 0;
  return getAuthToken();
}
