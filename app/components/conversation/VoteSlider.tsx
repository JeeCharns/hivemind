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
  /** Whether the user has passed on this statement */
  hasPassed?: boolean;
}

const VOTE_VALUES: VoteValue[] = [1, 2, 3, 4, 5];

export default function VoteSlider({
  value,
  onChange,
  hasPassed = false,
}: VoteSliderProps) {
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
            className="relative h-14 cursor-pointer"
          >
            {/* Track line - positioned at dot center level */}
            <div className="absolute inset-x-0 top-[8px] h-0.5 bg-slate-200" />

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
                  className="absolute top-0 -translate-x-1/2 flex flex-col items-center z-10"
                  style={{ left: `${getPositionFromValue(v)}%` }}
                >
                  {/* Dot on the line */}
                  <div
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      isSelected
                        ? "bg-brand-primary border-brand-primary scale-150 shadow-md ring-4 ring-brand-primary/20"
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

        {/* Pass button - secondary style, selected when user has passed */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(null)}
          className={`px-6 ${
            hasPassed
              ? "ring-2 ring-brand-primary bg-brand-primary/10 text-brand-primary"
              : ""
          }`}
        >
          Pass
        </Button>
      </div>

      {/* Labels row - three columns: left label, center (selected), right label */}
      <div className="flex items-center gap-8 w-full">
        <div className="flex-1 flex items-baseline">
          {/* Left label - no padding, aligned to left edge */}
          <span className="text-xs text-slate-500 flex-shrink-0">
            {VOTE_LABELS[1]}
          </span>

          {/* Center - selected value label */}
          <span className="flex-1 text-center text-sm text-brand-primary font-medium">
            {value ? VOTE_LABELS[value] : ""}
          </span>

          {/* Right label - no padding, aligned to right edge */}
          <span className="text-xs text-slate-500 flex-shrink-0">
            {VOTE_LABELS[5]}
          </span>
        </div>
        {/* Spacer to match Pass button width */}
        <div className="w-[88px]" />
      </div>
    </div>
  );
}
