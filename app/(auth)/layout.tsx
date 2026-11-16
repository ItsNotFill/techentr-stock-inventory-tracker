export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-semibold">Restaurant Inventory</p>
        {children}
      </div>
    </main>
  );
}
