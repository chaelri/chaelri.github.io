"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect, useRef } from "react";

export default function SearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  
  // Initial state from URL
  const initialQuery = searchParams.get("q") || "";
  const [text, setText] = useState(initialQuery);
  
  // Use a ref to track if this is the first time the component loaded
  const isFirstRender = useRef(true);

  useEffect(() => {
    // 1. Skip the very first run so it doesn't blink on page load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // 2. If text is exactly what is already in the URL, don't do anything
    if (text === (searchParams.get("q") || "")) return;

    // 3. Min 3 chars rule (ignore if text is being cleared)
    if (text.length > 0 && text.length < 3) return;

    const delay = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (text) {
        params.set("q", text);
      } else {
        params.delete("q");
      }

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 400); // 400ms is a bit more comfortable for typing

    return () => clearTimeout(delay);
  }, [text, pathname, router, searchParams]);

  return (
    <div className="w-full max-w-sm">
      <div className="relative">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search users (min. 3 chars)..."
          className="w-full bg-zinc-900 p-3 pl-11 rounded-2xl border border-zinc-800 focus:border-cyan-500 outline-none transition-all text-sm"
        />
        <div className="absolute left-4 top-3.5 text-zinc-500">
          {/* Only show spinner if we are ACTUALLY waiting for the server */}
          {isPending ? (
            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between h-6">
        {text.length >= 3 && (
          <p className="text-xs text-zinc-500 italic">
            Searching for &quot;<span className="text-cyan-400">{text}</span>&quot;...
          </p>
        )}
        
        {/* Only show button if there is a query in the URL */}
        {searchParams.get("q") && (
          <button 
            onClick={() => setText("")}
            className="text-xs text-cyan-500 hover:text-cyan-400 font-bold cursor-pointer transition-colors"
          >
            See All Users
          </button>
        )}
      </div>
    </div>
  );
}