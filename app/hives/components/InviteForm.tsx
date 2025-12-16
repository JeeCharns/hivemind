"use client";

/**
 * InviteForm Component
 *
 * Presentational form component for inviting members
 * Props-only, no business logic
 */

import { useState } from "react";
import Input from "@/app/components/input";
import Button from "@/app/components/button";

interface InviteFormProps {
  onSubmit: (emails: string[]) => void;
  isSubmitting: boolean;
  error: string | null;
}

export default function InviteForm({
  onSubmit,
  isSubmitting,
  error,
}: InviteFormProps) {
  const [emailsText, setEmailsText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parse comma-separated emails
    const emails = emailsText
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emails.length > 0) {
      onSubmit(emails);
    }
  };

  const emailCount = emailsText
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0).length;

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
      <Input
        label="Email Addresses (comma-separated)"
        value={emailsText}
        onChange={(e) => setEmailsText(e.target.value)}
        placeholder="user1@example.com, user2@example.com"
        disabled={isSubmitting}
        helperText={`Enter up to 10 email addresses separated by commas. (${emailCount} entered)`}
        required
      />

      {error && (
        <div className="text-sm text-red-600 px-2">{error}</div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting || emailCount === 0 || emailCount > 10}
      >
        {isSubmitting ? "Sending Invites..." : `Send ${emailCount} Invite${emailCount !== 1 ? "s" : ""}`}
      </Button>
    </form>
  );
}
