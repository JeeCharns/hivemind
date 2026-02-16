# Leave Hive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to leave a hive via a button in the navbar dropdown, with a styled confirmation modal.

**Architecture:** Add a reusable `ConfirmationModal` component, a `LeaveHiveButton` that combines the trigger and modal, and a `leaveHiveAction` server action that reuses existing validation logic.

**Tech Stack:** Next.js 13+ (App Router), React, TypeScript, Server Actions, Tailwind CSS

---

### Task 1: Create ConfirmationModal Component

**Files:**
- Create: `app/components/ConfirmationModal.tsx`
- Create: `app/components/__tests__/ConfirmationModal.test.tsx`

**Step 1: Write the failing test**

```typescript
// app/components/__tests__/ConfirmationModal.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmationModal from "../ConfirmationModal";

describe("ConfirmationModal", () => {
  const defaultProps = {
    isOpen: true,
    title: "Confirm Action",
    message: "Are you sure?",
    confirmLabel: "Yes",
    cancelLabel: "No",
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("Confirm Action")).not.toBeInTheDocument();
  });

  it("renders title and message when open", () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    render(<ConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Yes"));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button clicked", () => {
    render(<ConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByText("No"));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop clicked", () => {
    render(<ConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows loading state when isLoading is true", () => {
    render(<ConfirmationModal {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Yes")).toBeDisabled();
  });

  it("shows error message when provided", () => {
    render(<ConfirmationModal {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app/components/__tests__/ConfirmationModal.test.tsx`
Expected: FAIL with "Cannot find module '../ConfirmationModal'"

**Step 3: Write the implementation**

```typescript
// app/components/ConfirmationModal.tsx
/**
 * Confirmation Modal Component
 *
 * Reusable modal for confirming destructive actions
 * Supports loading state, error display, and danger variant
 */

"use client";

import { useEffect, useCallback } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
  variant?: "default" | "danger";
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
  error = null,
  variant = "default",
}: ConfirmationModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onCancel();
      }
    },
    [onCancel, isLoading]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const confirmButtonClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
      : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-black/50"
        onClick={isLoading ? undefined : onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p className="mt-2 text-body text-slate-600">{message}</p>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-body text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-body text-white rounded-md transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmButtonClass}`}
          >
            {isLoading ? "Loading..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- app/components/__tests__/ConfirmationModal.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add app/components/ConfirmationModal.tsx app/components/__tests__/ConfirmationModal.test.tsx
git commit -m "feat: add reusable ConfirmationModal component"
```

---

### Task 2: Create leaveHiveAction Server Action

**Files:**
- Modify: `app/hives/[hiveId]/members/actions.ts` (add after line 176)

**Step 1: Write the failing test**

The validation logic is already tested in `lib/members/validation/memberValidation.test.ts`. The server action reuses `canRemoveMember`, so we only need integration-level testing. For now, we add the action and rely on existing validation tests.

**Step 2: Add the leaveHiveAction**

Add after line 176 in `app/hives/[hiveId]/members/actions.ts`:

```typescript
/**
 * Leave a hive (self-removal)
 *
 * Security:
 * - User must be authenticated
 * - User must be a member of the hive
 * - Prevents last admin from leaving
 *
 * @param hiveId - Hive UUID
 */
export async function leaveHiveAction(hiveId: string): Promise<MemberActionResult> {
  try {
    // 1. Validate inputs
    if (!hiveId) {
      return { success: false, error: "Invalid input: missing hive ID" };
    }

    // 2. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Unauthorized: Not authenticated" };
    }

    const supabase = await supabaseServerClient();
    const userId = session.user.id;

    // 3. Fetch current members to validate the removal
    const members = await getMembersWithSignedUrls(supabase, hiveId, userId);

    // Check if user is actually a member
    const isMember = members.some((m) => m.userId === userId);
    if (!isMember) {
      return { success: false, error: "You are not a member of this hive" };
    }

    // 4. Validate removal (prevents last admin from leaving)
    const validation = canRemoveMember(members, userId);

    if (!validation.canRemove) {
      return { success: false, error: validation.reason || "Cannot leave hive" };
    }

    // 5. Remove the member
    const { error: deleteError } = await supabase
      .from("hive_members")
      .delete()
      .eq("hive_id", hiveId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("[leaveHiveAction] Delete failed:", deleteError);
      return { success: false, error: "Failed to leave hive" };
    }

    // 6. Revalidate the page
    revalidatePath(`/hives/${hiveId}/members`);
    revalidatePath(`/hives`);

    return { success: true };
  } catch (error) {
    console.error("[leaveHiveAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to leave hive",
    };
  }
}
```

**Step 3: Run lint to verify no errors**

Run: `npm run lint`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add app/hives/[hiveId]/members/actions.ts
git commit -m "feat: add leaveHiveAction server action"
```

---

### Task 3: Create LeaveHiveButton Component

**Files:**
- Create: `app/components/navbar/LeaveHiveButton.tsx`
- Create: `app/components/navbar/__tests__/LeaveHiveButton.test.tsx`

**Step 1: Write the failing test**

```typescript
// app/components/navbar/__tests__/LeaveHiveButton.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import LeaveHiveButton from "../LeaveHiveButton";
import { leaveHiveAction } from "@/app/hives/[hiveId]/members/actions";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/app/hives/[hiveId]/members/actions", () => ({
  leaveHiveAction: jest.fn(),
}));

describe("LeaveHiveButton", () => {
  const mockRouter = { push: jest.fn() };
  const mockLeaveHiveAction = leaveHiveAction as jest.MockedFunction<typeof leaveHiveAction>;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  it("renders the leave button", () => {
    render(<LeaveHiveButton hiveId="123" hiveName="Test Hive" onMenuClose={jest.fn()} />);
    expect(screen.getByText("leave hive")).toBeInTheDocument();
  });

  it("opens modal when button clicked", () => {
    render(<LeaveHiveButton hiveId="123" hiveName="Test Hive" onMenuClose={jest.fn()} />);
    fireEvent.click(screen.getByText("leave hive"));
    expect(screen.getByText("Leave Test Hive?")).toBeInTheDocument();
  });

  it("closes modal when cancel clicked", () => {
    render(<LeaveHiveButton hiveId="123" hiveName="Test Hive" onMenuClose={jest.fn()} />);
    fireEvent.click(screen.getByText("leave hive"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Leave Test Hive?")).not.toBeInTheDocument();
  });

  it("calls leaveHiveAction and redirects on success", async () => {
    mockLeaveHiveAction.mockResolvedValue({ success: true });

    render(<LeaveHiveButton hiveId="123" hiveName="Test Hive" onMenuClose={jest.fn()} />);
    fireEvent.click(screen.getByText("leave hive"));
    fireEvent.click(screen.getByText("Leave"));

    await waitFor(() => {
      expect(mockLeaveHiveAction).toHaveBeenCalledWith("123");
      expect(mockRouter.push).toHaveBeenCalledWith("/hives");
    });
  });

  it("shows error message on failure", async () => {
    mockLeaveHiveAction.mockResolvedValue({ success: false, error: "Cannot leave" });

    render(<LeaveHiveButton hiveId="123" hiveName="Test Hive" onMenuClose={jest.fn()} />);
    fireEvent.click(screen.getByText("leave hive"));
    fireEvent.click(screen.getByText("Leave"));

    await waitFor(() => {
      expect(screen.getByText("Cannot leave")).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app/components/navbar/__tests__/LeaveHiveButton.test.tsx`
Expected: FAIL with "Cannot find module '../LeaveHiveButton'"

**Step 3: Write the implementation**

```typescript
// app/components/navbar/LeaveHiveButton.tsx
/**
 * Leave Hive Button Component
 *
 * Renders in PageSelector dropdown, opens confirmation modal
 * Handles the leave action and redirects on success
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmationModal from "@/app/components/ConfirmationModal";
import { leaveHiveAction } from "@/app/hives/[hiveId]/members/actions";

interface LeaveHiveButtonProps {
  hiveId: string;
  hiveName: string;
  onMenuClose: () => void;
}

export default function LeaveHiveButton({
  hiveId,
  hiveName,
  onMenuClose,
}: LeaveHiveButtonProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setError(null);
  };

  const handleCloseModal = () => {
    if (!isLoading) {
      setIsModalOpen(false);
      setError(null);
    }
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await leaveHiveAction(hiveId);

      if (result.success) {
        onMenuClose();
        router.push("/hives");
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        className="w-full text-left px-4 py-2 text-body text-red-600 hover:bg-red-50 transition"
      >
        leave hive
      </button>

      <ConfirmationModal
        isOpen={isModalOpen}
        title={`Leave ${hiveName}?`}
        message="You will lose access to all conversations and data in this hive. You can rejoin later if the hive is public."
        confirmLabel="Leave"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={handleCloseModal}
        isLoading={isLoading}
        error={error}
        variant="danger"
      />
    </>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- app/components/navbar/__tests__/LeaveHiveButton.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add app/components/navbar/LeaveHiveButton.tsx app/components/navbar/__tests__/LeaveHiveButton.test.tsx
git commit -m "feat: add LeaveHiveButton with confirmation modal"
```

---

### Task 4: Integrate LeaveHiveButton into PageSelector

**Files:**
- Modify: `app/components/navbar/PageSelector.tsx`

**Step 1: Update PageSelector to include LeaveHiveButton**

Modify `app/components/navbar/PageSelector.tsx`:

1. Add import at top (after line 13):
```typescript
import LeaveHiveButton from "./LeaveHiveButton";
```

2. Add `hiveName` to props interface (after line 19):
```typescript
  hiveName?: string;
```

3. Update function signature (line 29):
```typescript
export default function PageSelector({ hiveId, hiveSlug, hiveName, currentPage, isAdmin = false }: PageSelectorProps) {
```

4. Add LeaveHiveButton inside the dropdown menu, after the pages map (after line 98, before the closing `</div>`):
```typescript
          {/* Divider */}
          <div className="my-2 border-t border-slate-200" />

          {/* Leave Hive Button */}
          <LeaveHiveButton
            hiveId={hiveId}
            hiveName={hiveName || "this hive"}
            onMenuClose={() => setMenuOpen(false)}
          />
```

**Step 2: Update where PageSelector is used to pass hiveName**

Find where `PageSelector` is rendered and add the `hiveName` prop. Check `app/components/navbar/Navbar.tsx` or similar.

Run: `grep -r "PageSelector" app/components/navbar/`

**Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add app/components/navbar/PageSelector.tsx
git commit -m "feat: integrate LeaveHiveButton into PageSelector dropdown"
```

---

### Task 5: Pass hiveName to PageSelector from Navbar

**Files:**
- Modify: Parent component that renders PageSelector (likely `Navbar.tsx` or similar)

**Step 1: Find the parent component**

Run: `grep -rn "PageSelector" app/`

**Step 2: Update the parent to pass hiveName**

Add `hiveName={currentHive.name}` to the PageSelector props.

**Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 4: Run build to verify no errors**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add <modified-navbar-file>
git commit -m "feat: pass hiveName to PageSelector for leave hive modal"
```

---

### Task 6: Update Documentation

**Files:**
- Modify: `docs/feature-map.md` (add leave hive flow)

**Step 1: Add leave hive to feature map**

Add under the appropriate section:

```markdown
### Leave Hive
- **Trigger**: Click "leave hive" in PageSelector dropdown
- **Modal**: `app/components/ConfirmationModal.tsx`
- **Button**: `app/components/navbar/LeaveHiveButton.tsx`
- **Action**: `app/hives/[hiveId]/members/actions.ts` → `leaveHiveAction()`
- **Validation**: `lib/members/validation/memberValidation.ts` → `canRemoveMember()`
- **Redirect**: `/hives` on success
```

**Step 2: Commit**

```bash
git add docs/feature-map.md
git commit -m "docs: add leave hive flow to feature map"
```

---

### Task 7: Manual Testing

**Steps:**
1. Log in and navigate to a hive where you're a member (not the only admin)
2. Click the page dropdown (shows "home", "members", etc.)
3. Verify "leave hive" button appears at bottom with red text
4. Click "leave hive" - modal should appear
5. Click "Cancel" - modal should close
6. Click "leave hive" again, then "Leave" - should redirect to `/hives`
7. Verify you're no longer a member of that hive

**Edge case testing:**
1. As the only admin, try to leave - should see error message
2. Verify error message matches: "Cannot remove the only admin..."

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | ConfirmationModal component | `app/components/ConfirmationModal.tsx` |
| 2 | leaveHiveAction server action | `app/hives/[hiveId]/members/actions.ts` |
| 3 | LeaveHiveButton component | `app/components/navbar/LeaveHiveButton.tsx` |
| 4 | Integrate into PageSelector | `app/components/navbar/PageSelector.tsx` |
| 5 | Pass hiveName from parent | Navbar parent component |
| 6 | Update documentation | `docs/feature-map.md` |
| 7 | Manual testing | N/A |
