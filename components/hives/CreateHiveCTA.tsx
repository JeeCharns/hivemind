/**
 * Create Hive CTA Component
 *
 * Displays a call-to-action encouraging users to create their own hive.
 * Used on the Welcome Hive page to guide users toward creating their own space.
 *
 * Follows SRP: only responsible for rendering the CTA UI
 */

import Link from "next/link";

interface CreateHiveCTAProps {
  /** Visual style variant */
  variant?: "subtle" | "prominent";
}

/**
 * Call-to-action component for creating a new hive.
 *
 * @param variant - 'subtle' for inline/footer placement, 'prominent' for main content area
 */
export function CreateHiveCTA({ variant = "subtle" }: CreateHiveCTAProps) {
  if (variant === "prominent") {
    return (
      <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-center">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          Ready to start your own?
        </h3>
        <p className="mb-4 text-sm text-gray-600">
          Create a hive for your team, community, or project.
        </p>
        <Link
          href="/hives/new"
          className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          Create a Hive
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
      <span className="text-sm text-gray-600">Ready to start your own?</span>
      <Link
        href="/hives/new"
        className="text-sm font-medium text-amber-600 hover:text-amber-700"
      >
        Create a Hive
      </Link>
    </div>
  );
}
