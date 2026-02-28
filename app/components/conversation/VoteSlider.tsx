"use client";

/**
 * VoteSlider - Client Component
 *
 * 5-point sentiment voting slider with a track line and draggable/clickable circle
 * Shows vote position from 1-5 with a Pass option on the right
 */

import { useCallback, useRef } from "react";
import { VOTE_LABELS, type VoteValue } from "@/types/deliberate-space";
import Button from "@/app/components/button";

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
    <div className="space-y-4 w-full">
      {/* Slider and Pass button row */}
      <div className="flex items-center gap-8 w-full">
        {/* Slider track container */}
        <div className="flex-1 relative">
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative h-12 flex items-center cursor-pointer"
          >
            {/* Track line - centered vertically */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200" />

            {/* Tick marks with numbers below */}
            {VOTE_VALUES.map((v) => {
              const isSelected = value === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDotClick(v);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${getPositionFromValue(v)}%` }}
                >
                  {/* Dot on the line */}
                  <div
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      isSelected
                        ? "bg-brand-primary border-brand-primary scale-125 shadow-md ring-4 ring-brand-primary/20"
                        : "bg-white border-slate-300 hover:border-slate-400 hover:scale-110"
                    }`}
                  />
                  {/* Number below */}
                  <span
                    className={`text-xs mt-2 transition-colors ${
                      isSelected
                        ? "text-brand-primary font-semibold"
                        : "text-slate-500"
                    }`}
                  >
                    {v}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pass button - secondary style */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(null)}
          className={`px-6 ${
            value === null ? "ring-2 ring-slate-300" : ""
          }`}
        >
          Pass
        </Button>
      </div>

      {/* Labels row */}
      <div className="flex items-center gap-8 w-full">
        <div className="flex-1 flex justify-between text-xs text-slate-500 px-0">
          <span>{VOTE_LABELS[1]}</span>
          <span>{VOTE_LABELS[5]}</span>
        </div>
        {/* Spacer to match Pass button width */}
        <div className="w-[88px]" />
      </div>

      {/* Current vote label - centered under the slider */}
      {value && (
        <div className="flex items-center gap-8 w-full">
          <div className="flex-1 text-center">
            <span className="text-sm text-slate-700 font-medium">
              {VOTE_LABELS[value]}
            </span>
          </div>
          {/* Spacer to match Pass button width */}
          <div className="w-[88px]" />
        </div>
      )}
    </div>
  );
}
