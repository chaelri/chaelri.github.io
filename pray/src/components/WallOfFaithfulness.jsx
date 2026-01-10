// Current File Tree: src/components/WallOfFaithfulness.jsx
import React from "react";

export default function WallOfFaithfulness({ answeredRequests, onBack }) {
  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 bg-white/5 rounded-full">
          <span className="material-icons-outlined">arrow_back</span>
        </button>
        <h2 className="text-2xl font-bold text-gold-400">
          Wall of Faithfulness
        </h2>
      </div>

      {answeredRequests.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-40 text-center">
          <span className="material-icons-outlined text-6xl mb-4">
            auto_awesome
          </span>
          <p>
            Your answered prayers will appear here.
            <br />
            Keep praying and watch what God does.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {answeredRequests.map((req) => (
            <div
              key={req.id}
              className="glass-panel overflow-hidden flex flex-col"
            >
              <div className="h-32 bg-navy-800 relative">
                {req.imageUrl ? (
                  <img
                    src={req.imageUrl}
                    alt=""
                    className="w-full h-full object-cover opacity-60"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-icons-outlined text-slate-700">
                      church
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-navy-900 to-transparent" />
              </div>
              <div className="p-3">
                <p className="font-semibold text-sm line-clamp-2">
                  {req.title}
                </p>
                <p className="text-[10px] text-gold-400/70 uppercase mt-1 tracking-wider">
                  Answered
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
