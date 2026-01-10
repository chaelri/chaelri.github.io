// Current File Tree: src/utils/prayerLogic.js
export const ACTS_STAGES = {
  ADORATION: {
    id: "adoration",
    title: "Adoration",
    prompt:
      "Focus on who God is. Praise Him for His character, His power, and His love.",
    duration: 60, // seconds
    color: "bg-green-500",
  },
  CONFESSION: {
    id: "confession",
    title: "Confession",
    prompt:
      "Agree with God about your sins. Ask for forgiveness and the strength to turn away.",
    duration: 60,
    color: "bg-yellow-500",
  },
  THANKSGIVING: {
    id: "thanksgiving",
    title: "Thanksgiving",
    prompt:
      "Be specific. What are three things you are grateful for in the last 24 hours?",
    duration: 60,
    color: "bg-green-400",
  },
  SUPPLICATION: {
    id: "supplication",
    title: "Supplication",
    prompt: "Bring your requests and the needs of others before God.",
    duration: 120,
    color: "bg-orange-500",
  },
};

export const getTimerColor = (secondsLeft, totalDuration) => {
  const percentage = (secondsLeft / totalDuration) * 100;
  if (percentage > 50) return "bg-green-500";
  if (percentage > 20) return "bg-yellow-500";
  return "bg-red-500";
};
