import { prisma } from "../lib/db";
import { addUser } from "./actions";
import UserDashboard from "./UserDashboard";

export default async function Home() {
  // Fetch all users on initial load (Server-side)
  const allUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 p-6 md:p-12 selection:bg-cyan-500/30">
      <div className="max-w-6xl mx-auto">
        
        <header className="mb-12 border-b border-zinc-800 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-white">
              PLAYGROUND<span className="text-cyan-500">.</span>
            </h1>
            <p className="text-zinc-500 mt-1 text-sm font-medium">Local Sync Engine + Neon Postgres</p>
          </div>

          {/* ADD USER FORM (STILL SERVER-SIDE ACTION) */}
          <div className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800 flex items-center gap-3">
            <h2 className="text-[10px] font-black text-zinc-600 uppercase mr-2 hidden lg:block tracking-widest">Entry</h2>
            <form action={addUser} className="flex gap-2">
              <input
                name="name"
                placeholder="Full Name"
                className="bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-800 focus:border-cyan-500 outline-none text-xs w-32 md:w-40 transition-all"
                required
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                className="bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-800 focus:border-cyan-500 outline-none text-xs w-40 md:w-56 transition-all"
                required
              />
              <button
                type="submit"
                className="bg-zinc-100 text-black font-bold px-5 py-2 rounded-xl hover:bg-cyan-500 hover:text-white transition-all text-xs cursor-pointer shadow-lg"
              >
                Create
              </button>
            </form>
          </div>
        </header>

        {/* Client-side Interaction Layer */}
        <UserDashboard initialUsers={allUsers} />
        
      </div>
    </main>
  );
}