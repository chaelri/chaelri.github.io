// Current File Tree: src/components/AddRequest.jsx
import React, { useState } from "react";
import { db, storage } from "../services/firebase";
import { ref as dbRef, push, set } from "firebase/database";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../utils/imageTools";

export default function AddRequest({ onClose }) {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title) return;
    setLoading(true);

    try {
      let imageUrl = "";
      if (image) {
        const compressed = await compressImage(image);
        const imageId = Date.now();
        const storageRef = sRef(storage, `requests/${imageId}.jpg`);
        await uploadBytes(storageRef, compressed);
        imageUrl = await getDownloadURL(storageRef);
      }

      const requestsRef = dbRef(db, "requests");
      const newRequestRef = push(requestsRef);
      await set(newRequestRef, {
        title,
        imageUrl,
        createdAt: Date.now(),
        lastPrayed: 0,
        isAnswered: false,
      });

      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-navy-900/90 backdrop-blur-xl p-6 flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-gold-400">New Request</h2>
        <button onClick={onClose} className="text-slate-400">
          <span className="material-icons-outlined">close</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">
            What are we praying for?
          </label>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-lg focus:outline-none focus:border-gold-400/50 transition-colors"
            placeholder="Enter request name..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Visual Reminder (Optional)
          </label>
          <div className="relative h-48 w-full rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden">
            {image ? (
              <img
                src={URL.createObjectURL(image)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center">
                <span className="material-icons-outlined text-4xl text-slate-500">
                  add_a_photo
                </span>
                <p className="text-xs text-slate-500 mt-2">
                  Upload or Take Photo
                </p>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <button
          disabled={loading || !title}
          className="w-full bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 font-bold py-4 rounded-xl transition-all shadow-lg shadow-gold-500/20"
        >
          {loading ? "Saving..." : "Add to Prayer List"}
        </button>
      </form>
    </div>
  );
}
