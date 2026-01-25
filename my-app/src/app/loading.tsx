export default function Loading() {
  return (
    <main className="min-h-screen bg-[#09090b] p-12">
      <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
        <div className="h-12 bg-zinc-900 w-1/4 rounded-2xl"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="h-64 bg-zinc-900 rounded-3xl"></div>
          <div className="lg:col-span-2 space-y-4">
            <div className="h-20 bg-zinc-900 rounded-2xl"></div>
            <div className="h-20 bg-zinc-900 rounded-2xl"></div>
            <div className="h-20 bg-zinc-900 rounded-2xl"></div>
          </div>
        </div>
      </div>
    </main>
  );
}