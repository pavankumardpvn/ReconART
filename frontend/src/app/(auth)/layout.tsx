export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="gradient-bg-animated flex min-h-screen items-center justify-center">
      {children}
    </div>
  );
}
