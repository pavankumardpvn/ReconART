"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import IntegrationHub from "@/components/landing/IntegrationHub";
import DashboardPreview from "@/components/landing/DashboardPreview";
import Statistics from "@/components/landing/Statistics";
import Features from "@/components/landing/Features";
import Testimonials from "@/components/landing/Testimonials";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Home() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) router.push("/dashboard");
  }, [isLoaded, isSignedIn, router]);

  if (isLoaded && isSignedIn) return null;

  return (
    <div className="min-h-screen bg-[#030712] text-white overflow-x-hidden">
      <Navbar />
      <Hero />
      <Statistics />
      <IntegrationHub />
      <DashboardPreview />
      <Features />
      <Testimonials />
      <LandingFooter />
    </div>
  );
}
