# OTP Authentication Design

**Date:** 2026-02-16
**Status:** Approved
**Author:** Claude Code + George Charnley

## Problem

The current magic link authentication has two issues:
1. Email redirects break the flow for users with email forwarding/filtering
2. Magic links open in a new browser tab, creating poor UX

## Solution

Replace magic link authentication with OTP (one-time passcode) authentication using Supabase's native OTP support.

## Approach

Use Supabase's existing `signInWithOtp()` without the `emailRedirectTo` option. This causes Supabase to send a 6-digit code instead of a magic link. Verify with `verifyOtp()`. Session is established directly in the browser—no callback page needed.

## UI/UX Flow

```
┌─────────────────────────────────────┐
│  State 1: EMAIL ENTRY               │
│                                     │
│  "Sign Up or Create Account"        │
│                                     │
│  [ Enter your email            ]    │
│                                     │
│  [ Send verification code ]         │
└─────────────────────────────────────┘
          │
          ▼ (email submitted)
┌─────────────────────────────────────┐
│  State 2: OTP ENTRY                 │
│                                     │
│  "Enter the code sent to            │
│   user@example.com"                 │
│                                     │
│  [_] [_] [_] [_] [_] [_]            │
│                                     │
│  [ Verify ]                         │
│                                     │
│  Didn't receive it? Resend (30s)    │
│  Change email                       │
└─────────────────────────────────────┘
          │
          ▼ (code verified)
┌─────────────────────────────────────┐
│  Redirects to /hives, /invite,      │
│  or /profile-setup as appropriate   │
└─────────────────────────────────────┘
```

**Key interactions:**
- Auto-focus moves to next box as digits are entered
- Paste support: pasting "123456" fills all boxes
- Backspace moves focus to previous box
- "Change email" returns to email entry state
- "Resend" has 30s cooldown
- Auto-submit when 6th digit entered

## Components

### New: `OtpInput.tsx`

Location: `app/(auth)/components/OtpInput.tsx`

Props:
- `length: number` (default 6)
- `value: string`
- `onChange: (value: string) => void`
- `onComplete: (value: string) => void`
- `disabled: boolean`
- `error: boolean`

Behaviour:
- Renders 6 individual `<input>` elements with `maxLength={1}`
- Manages focus movement internally
- Handles paste by splitting and distributing digits
- Keyboard: digits advance, backspace retreats, arrows navigate

### Modified: `LoginPageClient.tsx`

New state:
- `step: 'email' | 'otp'`
- `submittedEmail: string`
- `otp: string`

### Modified: `useAuth.ts`

- Remove `emailRedirectTo` from `signInWithOtp()`
- Add `verifyOtp(email: string, token: string)` function

## Data Flow

### Send OTP

```
User enters email
    ↓
supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: true }
})
    ↓
Supabase sends email with 6-digit code
    ↓
UI transitions to OTP entry state
```

### Verify OTP

```
User enters 6 digits (auto-submits)
    ↓
supabase.auth.verifyOtp({
  email,
  token: code,
  type: 'email'
})
    ↓
Session stored in cookies
    ↓
refresh() + notifySessionChange()
    ↓
Route to destination (invite/profile-setup/hives)
```

## Error Handling

### Send OTP errors

| Error | User Message | Action |
|-------|--------------|--------|
| Rate limit (429) | "Too many requests. Please wait 30s." | Cooldown timer |
| Invalid email | "Please enter a valid email address" | Stay on email step |
| Network error | "Connection failed. Please try again." | Allow retry |

### Verify OTP errors

| Error | User Message | Action |
|-------|--------------|--------|
| Invalid code | "Invalid code. Please check and try again." | Clear input |
| Expired code | "Code expired. Please request a new one." | Show resend |
| Too many attempts | "Too many failed attempts. Please request a new code." | Show resend |
| Network error | "Connection failed. Please try again." | Keep code, allow retry |

## Testing Strategy

### Unit tests

- `OtpInput`: digit input, auto-advance, paste handling, backspace, onComplete callback
- `useAuth.verifyOtp`: Supabase calls, success/error handling

### Integration tests

- Email → OTP → Success redirect
- Email → OTP → Invalid code → Error → Retry
- Email → OTP → Change email → Back to email step
- Resend cooldown behaviour

### Manual testing checklist

- [ ] Paste full code works
- [ ] Paste partial code works
- [ ] Keyboard navigation works
- [ ] Mobile numeric keyboard appears
- [ ] Screen reader announces boxes
- [ ] Invite flow preserved
- [ ] Profile setup redirect works

## Files Changed

**Create:**
- `app/(auth)/components/OtpInput.tsx`

**Modify:**
- `app/(auth)/login/LoginPageClient.tsx`
- `app/(auth)/hooks/useAuth.ts`

**Unchanged:**
- `app/(auth)/callback/page.tsx` (keep for potential OAuth)
- `lib/auth/*` (session management unchanged)

## Alternatives Considered

### Custom OTP with API routes

Server-side OTP generation with database storage. Rejected: duplicates Supabase functionality, more code to maintain.

### Hybrid (OTP + magic link fallback)

Offer both options. Rejected: adds UI complexity, confusing for users.
