"use client";

/**
 * CreateHiveForm Component
 *
 * Presentational form component for creating a new hive
 * Props-only, no business logic
 */

import { useState } from "react";
import Input from "@/app/components/input";
import Button from "@/app/components/button";

interface CreateHiveFormProps {
  onSubmit: (name: string) => void;
  isSubmitting: boolean;
  error: string | null;
}

export default function CreateHiveForm({
  onSubmit,
  isSubmitting,
  error,
}: CreateHiveFormProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
      <Input
        label="Hive Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter hive name"
        disabled={isSubmitting}
        required
      />
      {error && (
        <div className="text-sm text-red-600 px-2">{error}</div>
      )}
      <Button type="submit" disabled={isSubmitting || !name.trim()}>
        {isSubmitting ? "Creating..." : "Create Hive"}
      </Button>
    </form>
  );
}
