module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/my-realtime-app/src/lib/supabase.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "supabase",
    ()=>supabase
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/my-realtime-app/node_modules/@supabase/supabase-js/dist/index.mjs [app-ssr] (ecmascript) <locals>");
;
const supabaseUrl = ("TURBOPACK compile-time value", "https://vmispuldfrwiiqzqextf.supabase.co");
const supabaseAnonKey = ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtaXNwdWxkZnJ3aWlxenFleHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzODU2NTcsImV4cCI6MjA4NDk2MTY1N30.VVnyi94rfOL8R140zqQFiTs_CEG93xfMDSpc5wdsABc");
const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(supabaseUrl, supabaseAnonKey);
}),
"[project]/my-realtime-app/src/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HuddleBoard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-realtime-app/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-realtime-app/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/my-realtime-app/src/lib/supabase.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
function HuddleBoard() {
    const [tasks, setTasks] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [newTask, setNewTask] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [selectedTaskId, setSelectedTaskId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["supabase"].from('tasks').select('*').order('created_at', {
            ascending: true
        }).then(({ data })=>data && setTasks(data));
        const channel = __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["supabase"].channel('huddle-sync').on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'tasks'
        }, (payload)=>{
            if (payload.eventType === 'INSERT') {
                setTasks((prev)=>prev.some((t)=>t.id === payload.new.id) ? prev : [
                        ...prev,
                        payload.new
                    ]);
            } else if (payload.eventType === 'UPDATE') {
                setTasks((prev)=>prev.map((t)=>t.id === payload.new.id ? payload.new : t));
            } else if (payload.eventType === 'DELETE') {
                setTasks((prev)=>prev.filter((t)=>t.id !== payload.old.id));
            }
        }).subscribe();
        return ()=>{
            __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["supabase"].removeChannel(channel);
        };
    }, []);
    const addTask = async (e)=>{
        e.preventDefault();
        if (!newTask.trim()) return;
        const tempId = crypto.randomUUID();
        const task = {
            id: tempId,
            title: newTask,
            status: 'todo'
        };
        setTasks((prev)=>[
                ...prev,
                task
            ]);
        setNewTask('');
        await __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["supabase"].from('tasks').insert([
            {
                id: tempId,
                title: task.title,
                status: 'todo'
            }
        ]);
    };
    const updateStatus = async (id, newStatus)=>{
        setTasks((prev)=>prev.map((t)=>t.id === id ? {
                    ...t,
                    status: newStatus
                } : t));
        await __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["supabase"].from('tasks').update({
            status: newStatus
        }).eq('id', id);
    };
    const deleteTask = async (id)=>{
        setTasks((prev)=>prev.filter((t)=>t.id !== id));
        await __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["supabase"].from('tasks').delete().eq('id', id);
    };
    const TaskCard = ({ task })=>{
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
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            onClick: ()=>setSelectedTaskId(isSelected ? null : task.id),
            className: `
          group relative flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 select-none
          ${statusStyles[task.status]}
          ${isSelected ? 'shadow-xl scale-[1.02] z-10' : 'shadow-sm hover:shadow-md'}
        `,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: `text-sm transition-all pr-4 leading-snug ${textStyles[task.status]}`,
                    children: task.title
                }, void 0, false, {
                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                    lineNumber: 77,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `flex items-center gap-1.5 transition-all duration-300 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`,
                    children: [
                        (task.status === 'doing' || task.status === 'done') && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: (e)=>{
                                e.stopPropagation();
                                updateStatus(task.id, task.status === 'done' ? 'doing' : 'todo');
                            },
                            className: "p-2 rounded-xl bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-50",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                width: "12",
                                height: "12",
                                fill: "none",
                                stroke: "currentColor",
                                strokeWidth: "3.5",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M8 1L2 7l6 6"
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 87,
                                    columnNumber: 95
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                lineNumber: 87,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 83,
                            columnNumber: 13
                        }, this),
                        (task.status === 'todo' || task.status === 'doing') && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: (e)=>{
                                e.stopPropagation();
                                updateStatus(task.id, task.status === 'todo' ? 'doing' : 'done');
                            },
                            className: `p-2 rounded-xl text-white shadow-md transition-colors ${task.status === 'todo' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                width: "12",
                                height: "12",
                                fill: "none",
                                stroke: "currentColor",
                                strokeWidth: "3.5",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M4 1l6 6-6 6"
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 96,
                                    columnNumber: 95
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                lineNumber: 96,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 92,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: (e)=>{
                                e.stopPropagation();
                                deleteTask(task.id);
                            },
                            className: "p-2 rounded-xl text-zinc-300 hover:text-red-500 transition-colors",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                width: "12",
                                height: "12",
                                fill: "none",
                                stroke: "currentColor",
                                strokeWidth: "3.5",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M2 2l8 8m0-8l-8 8"
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 104,
                                    columnNumber: 93
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                lineNumber: 104,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 100,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                    lineNumber: 81,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/my-realtime-app/src/app/page.tsx",
            lineNumber: 69,
            columnNumber: 7
        }, this);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-screen bg-[#FDFDFD] text-zinc-900 font-sans p-6 md:p-12 selection:bg-blue-100",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "max-w-6xl mx-auto",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                    className: "flex flex-col md:flex-row justify-between items-center mb-16 gap-8",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-center md:text-left",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                    className: "text-4xl font-black tracking-tighter italic",
                                    children: "Huddle."
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 117,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-zinc-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-1",
                                    children: "Realtime Team Flow"
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 118,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 116,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                            onSubmit: addTask,
                            className: "w-full md:w-auto relative group",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    className: "w-full md:w-96 bg-zinc-100/50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none focus:bg-white focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5 transition-all text-sm",
                                    placeholder: "Add a new task...",
                                    value: newTask,
                                    onChange: (e)=>setNewTask(e.target.value)
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 122,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    className: "absolute right-3 top-3 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-black transition-all active:scale-95 shadow-lg",
                                    children: "Add"
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 128,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 121,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                    lineNumber: 115,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "grid grid-cols-1 md:grid-cols-3 gap-10",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "flex flex-col gap-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center justify-between border-b border-zinc-100 pb-4 px-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                            className: "text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400",
                                            children: "To Do"
                                        }, void 0, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 137,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "bg-zinc-100 text-zinc-500 text-[10px] font-black px-2 py-0.5 rounded-md border border-zinc-200",
                                            children: tasks.filter((t)=>t.status === 'todo').length
                                        }, void 0, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 138,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 136,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-col gap-3",
                                    children: tasks.filter((t)=>t.status === 'todo').map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TaskCard, {
                                            task: t
                                        }, t.id, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 143,
                                            columnNumber: 64
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 142,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 135,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "flex flex-col gap-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center justify-between border-b border-blue-100 pb-4 px-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                            className: "text-[10px] font-black uppercase tracking-[0.3em] text-blue-500",
                                            children: "In Progress"
                                        }, void 0, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 149,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-100",
                                            children: tasks.filter((t)=>t.status === 'doing').length
                                        }, void 0, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 150,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 148,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-col gap-3",
                                    children: tasks.filter((t)=>t.status === 'doing').map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TaskCard, {
                                            task: t
                                        }, t.id, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 155,
                                            columnNumber: 65
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 154,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 147,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "flex flex-col gap-6",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center justify-between border-b border-emerald-100 pb-4 px-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                            className: "text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500",
                                            children: "Finished"
                                        }, void 0, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 161,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "bg-emerald-50 text-emerald-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-emerald-100",
                                            children: tasks.filter((t)=>t.status === 'done').length
                                        }, void 0, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 162,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 160,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-col gap-3",
                                    children: tasks.filter((t)=>t.status === 'done').map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$my$2d$realtime$2d$app$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TaskCard, {
                                            task: t
                                        }, t.id, false, {
                                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                            lineNumber: 167,
                                            columnNumber: 64
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                                    lineNumber: 166,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/my-realtime-app/src/app/page.tsx",
                            lineNumber: 159,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/my-realtime-app/src/app/page.tsx",
                    lineNumber: 134,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/my-realtime-app/src/app/page.tsx",
            lineNumber: 113,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/my-realtime-app/src/app/page.tsx",
        lineNumber: 112,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__f9ffa699._.js.map