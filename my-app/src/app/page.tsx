import { prisma } from "../lib/db";
import { addUser, deleteUser } from "./actions";
import SearchInput from "./SearchInput"; // Import the new component

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  // Only filter if q is 3 or more characters
  const query = q && q.length >= 3 ? q : "";

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 border-b border-zinc-800 pb-8 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Project Playground
            </h1>
            <p className="text-zinc-500 mt-1">Database Management</p>
          </div>

          {/* NEW SEARCH COMPONENT */}
          <SearchInput />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* REGISTRATION FORM (Same as before) */}
          <section className="lg:col-span-1">
            <div className="sticky top-12 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
              <h2 className="text-lg font-semibold mb-4">Add User</h2>
              <form action={addUser} className="flex flex-col gap-3">
                <input
                  name="name"
                  placeholder="Full Name"
                  className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 focus:border-blue-500 outline-none transition-all text-sm"
                  required
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Email Address"
                  className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 focus:border-blue-500 outline-none transition-all text-sm"
                  required
                />
                <button
                  type="submit"
                  className="mt-2 bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors text-sm cursor-pointer"
                >
                  Create Account
                </button>
              </form>
            </div>
          </section>

          {/* USER LIST (Same as before) */}
          <section className="lg:col-span-2">
            <div className="grid gap-4">
              {users.length === 0 && (
                <div className="text-center p-12 border border-dashed border-zinc-800 rounded-2xl text-zinc-600">
                  No users in database.
                </div>
              )}

              {users.map((user) => (
                <div
                  key={user.id}
                  className="group flex items-center justify-between p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:bg-zinc-900/60 transition-all"
                >
                  <div>
                    <p className="font-semibold text-zinc-100">{user.name}</p>
                    <p className="text-sm text-zinc-500">{user.email}</p>
                    <p className="text-[10px] text-zinc-700 uppercase mt-1 tracking-widest font-bold">
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* DELETE BUTTON */}
                  <form
                    action={async () => {
                      "use server";
                      await deleteUser(user.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="opacity-0 group-hover:opacity-100 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all cursor-pointer"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
