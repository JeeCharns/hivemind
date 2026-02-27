"use client";

/**
 * VoteSlider - Client Component
 *
 * 5-point sentiment voting slider with labels
 * Shows vote buttons from 1-5 and a Pass option
 */

import { VOTE_LABELS, type VoteValue } from "@/types/deliberate-space";

interface VoteSliderProps {
  value: VoteValue | null;
  onChange: (value: VoteValue | null) => void;
}

const VOTE_VALUES: VoteValue[] = [1, 2, 3, 4, 5];

export default function VoteSlider({ value, onChange }: VoteSliderProps) {
  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-border-secondary overflow-hidden">
        {VOTE_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 py-3 px-2 text-center transition-colors ${
              value === v
                ? "bg-brand-primary text-white"
                : "bg-surface-primary hover:bg-surface-secondary text-text-secondary"
            }`}
          >
            <span className="text-subtitle font-medium">{v}</span>
          </button>
        ))}
      </div>

      <div className="flex justify-between text-info text-text-tertiary px-1">
        <span>{VOTE_LABELS[1]}</span>
        <span>{VOTE_LABELS[5]}</span>
      </div>

      {value && (
        <p className="text-center text-body text-text-secondary">
          {VOTE_LABELS[value]}
        </p>
      )}

      <button
        type="button"
        onClick={() => onChange(null)}
        className={`w-full py-2 rounded-lg border transition-colors ${
          value === null
            ? "border-slate-400 bg-slate-100 text-slate-700"
            : "border-border-secondary hover:border-border-primary text-text-tertiary"
        }`}
      >
        Pass
      </button>
    </div>
  );
}
