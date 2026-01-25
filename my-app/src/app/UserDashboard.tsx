"use client";

import { useState } from "react";
import { deleteUser, toggleUserStatus } from "./actions";

type User = {
  id: number;
  name: string | null;
  email: string;
  status: string;
  createdAt: Date;
};

export default function UserDashboard({ initialUsers }: { initialUsers: User[] }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Active");

  // 1. Filter by Search + 2. Filter by Tab
  const filteredUsers = initialUsers.filter((user) => {
    const matchesTab = user.status === activeTab;
    const searchStr = query.toLowerCase();
    const matchesSearch = query.length < 3 || 
      user.name?.toLowerCase().includes(searchStr) || 
      user.email.toLowerCase().includes(searchStr);
    
    return matchesTab && matchesSearch;
  });

  // Calculate Stats for the UI
  const activeCount = initialUsers.filter(u => u.status === "Active").length;
  const archivedCount = initialUsers.filter(u => u.status === "Archived").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      {/* SEARCH & TABS COLUMN */}
      <section className="lg:col-span-1 space-y-6">
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 shadow-xl">
          {/* TABS */}
          <div className="flex bg-zinc-950 p-1 rounded-xl mb-6 border border-zinc-800">
            <button 
              onClick={() => setActiveTab("Active")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${activeTab === 'Active' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Active ({activeCount})
            </button>
            <button 
              onClick={() => setActiveTab("Archived")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${activeTab === 'Archived' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Archived ({archivedCount})
            </button>
          </div>

          <label className="block text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-3">Filter List</label>
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name..."
              className="w-full bg-zinc-950 p-3 pl-11 rounded-xl border border-zinc-800 focus:border-cyan-500 outline-none text-sm transition-all"
            />
            <div className="absolute left-4 top-3.5 text-zinc-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
          </div>
        </div>
      </section>

      {/* LIST COLUMN */}
      <section className="lg:col-span-2">
        <div className="grid gap-4">
          {filteredUsers.length === 0 ? (
            <div className="text-center p-20 border border-dashed border-zinc-800 rounded-3xl text-zinc-600">
              No {activeTab.toLowerCase()} users found.
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div 
                key={user.id} 
                className="group flex items-center justify-between p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:bg-zinc-900/60 transition-all border-l-4 border-l-cyan-500/30 hover:border-l-cyan-500 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-zinc-100">{user.name || "Anonymous"}</p>
                  <p className="text-sm text-zinc-500">{user.email}</p>
                  <p className="text-[10px] text-zinc-700 uppercase mt-1 tracking-widest font-bold">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleUserStatus(user.id, user.status)}
                    className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-zinc-700 text-zinc-400 hover:border-cyan-500 hover:text-cyan-500 transition-all cursor-pointer bg-zinc-950"
                  >
                    {user.status === "Active" ? "Archive" : "Restore"}
                  </button>

                  <button
                    onClick={async () => { if (confirm("Delete permanently?")) await deleteUser(user.id); }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-400 transition-all cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}