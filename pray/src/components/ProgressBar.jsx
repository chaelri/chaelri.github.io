// Current File Tree: src/components/ProgressBar.jsx
import React from "react";
import { getTimerColor } from "../utils/prayerLogic";

export default function ProgressBar({ timeLeft, totalDuration }) {
  // Ensure we don't divide by zero
  const progress = totalDuration > 0 ? timeLeft / totalDuration : 0;
  const colorClass = getTimerColor(timeLeft, totalDuration);

  return (
    <div className="w-full h-2 bg-white/5 overflow-hidden sticky top-0 z-[60]">
      <div
        className={`h-full progress-bar-shrink ${colorClass}`}
        style={{
          width: "100%",
          transform: `scaleX(${progress})`,
          transformOrigin: "left", // Shrinks toward the left
          transition: "transform 1s linear, background-color 0.5s ease",
        }}
      />
    </div>
  );
}
