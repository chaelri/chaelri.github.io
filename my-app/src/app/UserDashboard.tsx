"use client";

import { useState, useEffect } from "react";
import { deleteUser, toggleUserStatus } from "./actions";

type User = {
  id: number;
  name: string | null;
  email: string;
  status: string;
  createdAt: Date;
};

export default function UserDashboard({ initialUsers }: { initialUsers: User[] }) {
  // We manage the list locally, just like Firebase RTDB does internally
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Active");

  // Keep local state in sync if the server data changes (e.g. fresh page load)
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const handleToggle = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Archived" : "Active";
    
    // 1. INSTANT UPDATE (The Firebase Feeling)
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));
    
    // 2. BACKEND SYNC (Background)
    await toggleUserStatus(id, currentStatus);
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Delete ${user.name}?`)) return;
    
    // 1. INSTANT UPDATE
    setUsers(prev => prev.filter(u => u.id !== user.id));
    
    // 2. BACKEND SYNC
    await deleteUser(user.id);
  };

  const filteredUsers = users.filter((user) => {
    const matchesTab = user.status === activeTab;
    const searchStr = query.toLowerCase();
    return matchesTab && (query.length < 3 || user.name?.toLowerCase().includes(searchStr) || user.email.toLowerCase().includes(searchStr));
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      <section className="lg:col-span-1 space-y-6">
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 shadow-xl">
          <div className="flex bg-zinc-950 p-1 rounded-xl mb-6 border border-zinc-800">
            {["Active", "Archived"].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${activeTab === tab ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}
              >
                {tab} ({users.filter(u => u.status === tab).length})
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-zinc-950 p-3 rounded-xl border border-zinc-800 focus:border-cyan-500 outline-none text-sm"
          />
        </div>
      </section>

      <section className="lg:col-span-2">
        <div className="grid gap-4">
          {filteredUsers.map((user) => (
            <div key={user.id} className="group flex items-center justify-between p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-l-cyan-500 border-l-4 border-l-cyan-500/20 transition-all">
              <div>
                <p className="font-semibold text-zinc-100">{user.name}</p>
                <p className="text-sm text-zinc-500">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(user.id, user.status)}
                  className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-zinc-700 text-zinc-400 hover:text-cyan-500 transition-all cursor-pointer bg-zinc-950"
                >
                  {user.status === "Active" ? "Archive" : "Restore"}
                </button>
                <button onClick={() => handleDelete(user)} className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-400 cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}