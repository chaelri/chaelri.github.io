// Current File Tree: src/components/ProgressBar.jsx
import React from "react";
import { getTimerColor } from "../utils/prayerLogic";

export default function ProgressBar({ timeLeft, totalDuration }) {
  const progress = timeLeft / totalDuration;
  const colorClass = getTimerColor(timeLeft, totalDuration);

  return (
    <div className="w-full h-1.5 bg-white/10 overflow-hidden">
      <div
        className={`h-full progress-bar-shrink ${colorClass}`}
        style={{
          transform: `scaleX(${progress})`,
          transition: "transform 1s linear, background-color 0.5s ease",
        }}
      />
    </div>
  );
}
