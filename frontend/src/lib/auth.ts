"use client";

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (tokenGetter) {
    return tokenGetter();
  }
  return null;
}
