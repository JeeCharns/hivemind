"use client";

import { useState } from "react";
import Button from "../../components/button";
import Input from "../../components/input";

type LoginFormProps = {
  onSubmit: (email: string) => void;
  loading?: boolean;
  disabled?: boolean;
  buttonText?: string;
};

export default function LoginForm({
  onSubmit,
  loading = false,
  disabled = false,
  buttonText,
}: LoginFormProps) {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <Input
        label="Email Address"
        type="email"
        id="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        placeholder="Bob@hivemind.com"
        className="h-10 rounded-sm"
      />
      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={loading || disabled}
        className="font-semibold h-10 rounded-lg bg-[#3A1DC8] hover:bg-[#341ab3]"
      >
        {loading ? "Sending..." : (buttonText ?? "Send verification code")}
      </Button>
    </form>
  );
}
