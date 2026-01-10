// Current File Tree: src/components/RequestSwiper.jsx
import React from "react";

export default function RequestSwiper({ requests }) {
  if (!requests || requests.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <span className="material-icons-outlined text-6xl text-slate-700 mb-4">
          inventory_2
        </span>
        <p className="text-slate-400">
          No prayer requests added yet. Take this time to pray for your
          community.
        </p>
      </div>
    );
  }

  return (
    <div className="snap-container flex-1 h-full">
      {requests.map((req) => (
        <div
          key={req.id}
          className="snap-item prayer-card-bg relative flex flex-col items-center justify-center p-8 text-center"
          style={{
            backgroundImage: req.imageUrl ? `url(${req.imageUrl})` : "none",
          }}
        >
          <div className="relative z-10 max-w-sm">
            <h3 className="text-3xl font-bold mb-4 drop-shadow-md">
              {req.title}
            </h3>
            <div className="h-1 w-12 bg-gold-400 mx-auto rounded-full opacity-60"></div>
          </div>
        </div>
      ))}
    </div>
  );
}
