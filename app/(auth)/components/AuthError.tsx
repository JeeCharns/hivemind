"use client";

type AuthErrorProps = {
  message: string;
};

export default function AuthError({ message }: AuthErrorProps) {
  return (
    <div className="error-message text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
      <p>{message}</p>
    </div>
  );
}
