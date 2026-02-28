"use client";

/**
 * VoteSlider - Client Component
 *
 * 5-point sentiment voting slider with a track line and draggable/clickable circle
 * Shows vote position from 1-5 with a Pass option on the right
 */

import { useCallback, useRef } from "react";
import { VOTE_LABELS, type VoteValue } from "@/types/deliberate-space";

interface VoteSliderProps {
  value: VoteValue | null;
  onChange: (value: VoteValue | null) => void;
}

const VOTE_VALUES: VoteValue[] = [1, 2, 3, 4, 5];

export default function VoteSlider({ value, onChange }: VoteSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const getPositionFromValue = (v: VoteValue): number => {
    // Map 1-5 to 0-100%
    return ((v - 1) / 4) * 100;
  };

  const getValueFromPosition = (percent: number): VoteValue => {
    // Map 0-100% to 1-5, snapping to nearest value
    const raw = (percent / 100) * 4 + 1;
    return Math.round(Math.max(1, Math.min(5, raw))) as VoteValue;
  };

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      const newValue = getValueFromPosition(percent);
      onChange(newValue);
    },
    [onChange]
  );

  const handleDotClick = useCallback(
    (v: VoteValue) => {
      onChange(v);
    },
    [onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* Slider track */}
        <div className="flex-1 relative">
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative h-10 flex items-center cursor-pointer"
          >
            {/* Track line */}
            <div className="absolute inset-x-0 h-1 bg-slate-200 rounded-full" />

            {/* Tick marks and numbers */}
            {VOTE_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDotClick(v);
                }}
                className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${getPositionFromValue(v)}%` }}
              >
                <div
                  className={`w-3 h-3 rounded-full border-2 transition-colors ${
                    value === v
                      ? "bg-brand-primary border-brand-primary"
                      : "bg-white border-slate-300 hover:border-slate-400"
                  }`}
                />
                <span
                  className={`text-xs mt-1 transition-colors ${
                    value === v
                      ? "text-brand-primary font-medium"
                      : "text-slate-500"
                  }`}
                >
                  {v}
                </span>
              </button>
            ))}

            {/* Selected indicator circle (larger, on top) */}
            {value !== null && (
              <div
                className="absolute -translate-x-1/2 pointer-events-none"
                style={{ left: `${getPositionFromValue(value)}%` }}
              >
                <div className="w-5 h-5 rounded-full bg-brand-primary shadow-md ring-4 ring-brand-primary/20" />
              </div>
            )}
          </div>
        </div>

        {/* Pass button */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`px-4 py-2 text-sm rounded-lg transition-colors whitespace-nowrap ${
            value === null
              ? "text-slate-700 font-medium"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Pass
        </button>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-slate-500 pr-16">
        <span>{VOTE_LABELS[1]}</span>
        <span>{VOTE_LABELS[5]}</span>
      </div>

      {/* Current vote label */}
      {value && (
        <p className="text-center text-sm text-slate-600 font-medium">
          {VOTE_LABELS[value]}
        </p>
      )}
    </div>
  );
}
