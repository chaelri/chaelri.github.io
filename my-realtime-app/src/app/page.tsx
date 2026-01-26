'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Task = {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
};

export default function HuddleBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('tasks').select('*').order('created_at', { ascending: true })
      .then(({ data }) => data && setTasks(data as Task[]));

    const channel = supabase.channel('huddle-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTasks(prev => prev.some(t => t.id === payload.new.id) ? prev : [...prev, payload.new as Task]);
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === payload.new.id ? (payload.new as Task) : t));
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== payload.old.id));
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const tempId = crypto.randomUUID();
    const task: Task = { id: tempId, title: newTask, status: 'todo' };
    setTasks(prev => [...prev, task]);
    setNewTask('');
    await supabase.from('tasks').insert([{ id: tempId, title: task.title, status: 'todo' }]);
  };

  const updateStatus = async (id: string, newStatus: Task['status']) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
  };

  const deleteTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  const TaskCard = ({ task }: { task: Task }) => {
    const isSelected = selectedTaskId === task.id;
    
    const statusStyles = {
      todo: isSelected ? 'border-zinc-400 bg-zinc-50' : 'border-zinc-200 bg-white',
      doing: isSelected ? 'border-blue-400 bg-blue-50/30 shadow-blue-100/50' : 'border-zinc-200 bg-white',
      done: isSelected ? 'border-emerald-400 bg-emerald-50/30' : 'border-zinc-200 bg-white'
    };

    const textStyles = {
      todo: isSelected ? 'text-zinc-900' : 'text-zinc-700',
      doing: isSelected ? 'text-blue-700 font-bold' : 'text-zinc-700',
      done: isSelected ? 'text-emerald-700 line-through opacity-50' : 'text-zinc-700'
    };

    return (
      <div 
        onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
        className={`
          group relative flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 select-none
          ${statusStyles[task.status]}
          ${isSelected ? 'shadow-xl scale-[1.02] z-10' : 'shadow-sm hover:shadow-md'}
        `}
      >
        <p className={`text-sm transition-all pr-4 leading-snug ${textStyles[task.status]}`}>
          {task.title}
        </p>

        <div className={`flex items-center gap-1.5 transition-all duration-300 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}>
          {(task.status === 'doing' || task.status === 'done') && (
            <button 
              onClick={(e) => { e.stopPropagation(); updateStatus(task.id, task.status === 'done' ? 'doing' : 'todo'); }}
              className="p-2 rounded-xl bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M8 1L2 7l6 6"/></svg>
            </button>
          )}

          {(task.status === 'todo' || task.status === 'doing') && (
            <button 
              onClick={(e) => { e.stopPropagation(); updateStatus(task.id, task.status === 'todo' ? 'doing' : 'done'); }}
              className={`p-2 rounded-xl text-white shadow-md transition-colors ${task.status === 'todo' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M4 1l6 6-6 6"/></svg>
            </button>
          )}

          <button 
            onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
            className="p-2 rounded-xl text-zinc-300 hover:text-red-500 transition-colors"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M2 2l8 8m0-8l-8 8"/></svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-zinc-900 font-sans p-6 md:p-12 selection:bg-blue-100">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex flex-col md:flex-row justify-between items-center mb-16 gap-8">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-black tracking-tighter italic">Huddle.</h1>
            <p className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-1">Realtime Team Flow</p>
          </div>

          <form onSubmit={addTask} className="w-full md:w-auto relative group">
            <input 
              className="w-full md:w-96 bg-zinc-100/50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none focus:bg-white focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5 transition-all text-sm"
              placeholder="Add a new task..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
            />
            <button className="absolute right-3 top-3 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-black transition-all active:scale-95 shadow-lg">
              Add
            </button>
          </form>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <section className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4 px-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">To Do</h2>
              <span className="bg-zinc-100 text-zinc-500 text-[10px] font-black px-2 py-0.5 rounded-md border border-zinc-200">
                {tasks.filter(t => t.status === 'todo').length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {tasks.filter(t => t.status === 'todo').map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-blue-100 pb-4 px-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">In Progress</h2>
              <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-100">
                {tasks.filter(t => t.status === 'doing').length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {tasks.filter(t => t.status === 'doing').map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-4 px-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Finished</h2>
              <span className="bg-emerald-50 text-emerald-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-emerald-100">
                {tasks.filter(t => t.status === 'done').length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {tasks.filter(t => t.status === 'done').map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}