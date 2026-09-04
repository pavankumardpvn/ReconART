"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { setTokenGetter } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";

function AuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return;
    const ping = () => fetch(`${apiUrl}/api/v1/health/`).catch(() => {});
    ping();
    const interval = setInterval(ping, 13 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ClerkProvider>
      <AuthBridge>
        <QueryClientProvider client={queryClient}>
          <I18nProvider><ToastProvider>{children}</ToastProvider></I18nProvider>
        </QueryClientProvider>
      </AuthBridge>
    </ClerkProvider>
  );
}
