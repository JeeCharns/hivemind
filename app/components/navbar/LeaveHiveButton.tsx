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
        setError(result.error ?? "Failed to leave hive");
      }
    } catch {
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
