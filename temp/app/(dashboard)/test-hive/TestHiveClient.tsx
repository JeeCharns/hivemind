"use client";

import { useState } from "react";

export default function TestHiveClient() {
  const [open, setOpen] = useState(false);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-xl font-semibold">Test Hive Page (with guard)</h1>

      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
      >
        Open test popup
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full text-center">
            <h2 className="text-lg font-semibold mb-2">Popup is open</h2>
            <p className="text-sm text-slate-600 mb-4">
              If this opens/closes instantly, the page is responsive.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition"
            >
              Close popup
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
