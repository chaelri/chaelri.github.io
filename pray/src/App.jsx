// Current File Tree: src/App.jsx
import React, { useState, useEffect } from "react";
import { db } from "./services/firebase";
import { ref, onValue, update, push } from "firebase/database";
import { ACTS_STAGES } from "./utils/prayerLogic";
import Layout from "./components/Layout";
import ProgressBar from "./components/ProgressBar";
import RequestSwiper from "./components/RequestSwiper";
import AddRequest from "./components/AddRequest";
import WallOfFaithfulness from "./components/WallOfFaithfulness";

const STAGES = Object.values(ACTS_STAGES);

function App() {
  const [view, setView] = useState("dashboard"); // dashboard | session | summary | wall
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Sync Data (Requests + History)
  useEffect(() => {
    const reqRef = ref(db, "requests");
    const histRef = ref(db, "history");

    const unsubReq = onValue(reqRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        setRequests(list);
      }
    });

    const unsubHist = onValue(histRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setHistory(Object.values(data));
      }
    });

    return () => {
      unsubReq();
      unsubHist();
    };
  }, []);

  const startSession = () => {
    setCurrentStageIdx(0);
    setTimeLeft(STAGES[0].duration);
    setView("session");
  };

  const nextStage = () => {
    if (currentStageIdx < STAGES.length - 1) {
      const nextIdx = currentStageIdx + 1;
      setCurrentStageIdx(nextIdx);
      setTimeLeft(STAGES[nextIdx].duration);
    } else {
      finishSession();
    }
  };

  const finishSession = async () => {
    const now = Date.now();

    // 1. Log History (Breadcrumbs)
    const historyRef = ref(db, "history");
    await push(historyRef, {
      timestamp: now,
      completedStages: STAGES.length,
    });

    // 2. Update Request Timestamps
    const updates = {};
    requests
      .filter((r) => !r.isAnswered)
      .forEach((req) => {
        updates[`requests/${req.id}/lastPrayed`] = now;
      });

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }

    setView("summary");
  };

  const markAsAnswered = async (id) => {
    await update(ref(db, `requests/${id}`), {
      isAnswered: true,
      answeredAt: Date.now(),
    });
  };

  const activeRequests = requests
    .filter((r) => !r.isAnswered)
    .sort((a, b) => (a.lastPrayed || 0) - (b.lastPrayed || 0));

  const answeredRequests = requests
    .filter((r) => r.isAnswered)
    .sort((a, b) => b.answeredAt - a.answeredAt);

  if (view === "wall") {
    return (
      <Layout title="Faithfulness">
        <WallOfFaithfulness
          answeredRequests={answeredRequests}
          onBack={() => setView("dashboard")}
        />
      </Layout>
    );
  }

  if (view === "dashboard") {
    return (
      <Layout title="Prayer Trainer">
        <div className="p-6 flex-1 flex flex-col">
          {/* Breadcrumbs Stat Card */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="glass-panel p-4">
              <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">
                Total Sessions
              </p>
              <p className="text-2xl font-bold text-gold-400">
                {history.length}
              </p>
            </div>
            <div
              onClick={() => setView("wall")}
              className="glass-panel p-4 active:bg-white/20 transition-colors cursor-pointer"
            >
              <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">
                Answered
              </p>
              <p className="text-2xl font-bold text-green-400 flex items-center gap-2">
                {answeredRequests.length}
                <span className="material-icons-outlined text-sm">
                  arrow_forward
                </span>
              </p>
            </div>
          </div>

          <div className="glass-panel p-8 text-center mb-8 bg-gradient-to-br from-white/10 to-transparent">
            <h2 className="text-3xl font-bold mb-2">Ready to pray?</h2>
            <p className="text-slate-400 mb-6 italic text-sm">
              5 minutes to focus your heart.
            </p>
            <button
              onClick={startSession}
              className="w-full py-4 bg-gold-500 text-navy-900 font-bold rounded-xl shadow-xl shadow-gold-500/20 active:scale-95 transition-transform"
            >
              Start Session
            </button>
          </div>

          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-slate-300">
              Active Requests
            </h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-gold-400 flex items-center gap-1 text-sm font-bold"
            >
              <span className="material-icons-outlined text-sm">
                add_circle
              </span>
              <span>ADD NEW</span>
            </button>
          </div>

          <div className="space-y-3 pb-24">
            {activeRequests.length === 0 && (
              <p className="text-center text-slate-600 py-10 italic">
                No active requests. Add some to begin.
              </p>
            )}
            {activeRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{req.title}</p>
                  <p className="text-[10px] text-slate-500 uppercase">
                    {req.lastPrayed
                      ? `Last: ${new Date(req.lastPrayed).toLocaleDateString()}`
                      : "Not prayed for yet"}
                  </p>
                </div>
                <button
                  onClick={() => markAsAnswered(req.id)}
                  className="p-2 text-slate-500 hover:text-green-400 transition-colors"
                  title="Mark as Answered"
                >
                  <span className="material-icons-outlined">
                    check_circle_outline
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
        {showAddModal && <AddRequest onClose={() => setShowAddModal(false)} />}
      </Layout>
    );
  }

  if (view === "session") {
    const stage = STAGES[currentStageIdx];
    return (
      <Layout title={stage.title} onBack={() => setView("dashboard")}>
        <ProgressBar timeLeft={timeLeft} totalDuration={stage.duration} />

        <div className="flex-1 flex flex-col">
          <div className="p-8 text-center bg-gradient-to-b from-navy-900 via-navy-900 to-transparent z-10">
            <p className="text-gold-400 text-sm font-bold uppercase tracking-widest mb-2">
              {stage.title}
            </p>
            <p className="text-slate-200 text-xl leading-relaxed font-light">
              {stage.prompt}
            </p>
          </div>

          {stage.id === "supplication" ? (
            <RequestSwiper requests={activeRequests} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="material-icons-outlined text-[120px] text-white/5 animate-pulse">
                {stage.id === "adoration"
                  ? "auto_awesome"
                  : stage.id === "confession"
                  ? "self_improvement"
                  : "sentiment_satisfied_alt"}
              </span>
            </div>
          )}

          <div className="p-6 bg-navy-900/80 backdrop-blur-sm border-t border-white/5">
            <button
              onClick={nextStage}
              className={`w-full py-4 rounded-xl font-bold transition-all transform active:scale-[0.98] ${
                timeLeft <= 0
                  ? "bg-gold-500 text-navy-900"
                  : "bg-white/10 text-slate-400"
              }`}
            >
              {currentStageIdx === STAGES.length - 1 ? "AMEN" : "NEXT STAGE"}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Amen">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <span className="material-icons-outlined text-green-500 text-5xl">
            done_all
          </span>
        </div>
        <h2 className="text-3xl font-bold mb-4 text-gold-400">
          Faithful Prayer
        </h2>
        <p className="text-slate-300 mb-8 max-w-xs">
          You have completed your guided ACTS session. Your faithfulness has
          been recorded.
        </p>
        <button
          onClick={() => setView("dashboard")}
          className="w-full max-w-xs py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    </Layout>
  );
}

export default App;
