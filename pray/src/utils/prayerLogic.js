// Current File Tree: src/utils/prayerLogic.js
export const ACTS_STAGES = {
  ADORATION: {
    id: "adoration",
    title: "Adoration",
    prompt:
      "Focus on who God is. Praise Him for His character, His power, and His love.",
    duration: 60,
    color: "bg-green-500",
    icon: "auto_awesome",
  },
  CONFESSION: {
    id: "confession",
    title: "Confession",
    prompt: "Agree with God about your sins. Ask for forgiveness and strength.",
    duration: 60,
    color: "bg-yellow-500",
    icon: "self_improvement",
  },
  THANKSGIVING: {
    id: "thanksgiving",
    title: "Thanksgiving",
    prompt: "What are three specific things you are grateful for today?",
    duration: 60,
    color: "bg-green-400",
    icon: "sentiment_satisfied_alt",
  },
  SUPPLICATION: {
    id: "supplication",
    title: "Supplication",
    prompt: "Bring your requests and the needs of others before God.",
    duration: 120,
    color: "bg-orange-500",
    icon: "pan_tool",
  },
};

export const getTimerColor = (secondsLeft, totalDuration) => {
  if (!totalDuration) return "bg-green-500";
  const percentage = (secondsLeft / totalDuration) * 100;
  if (percentage > 50) return "bg-green-500";
  if (percentage > 15) return "bg-yellow-500";
  return "bg-red-500";
};
