/**
 * Hives Layout
 *
 * Server component that wraps /hives and all child routes
 * Intentionally does not render the navbar.
 *
 * The fixed navbar is rendered in nested layouts (e.g. /hives/:hiveId),
 * but the /hives index page is a standalone entrypoint without it.
 */

export default async function HivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
