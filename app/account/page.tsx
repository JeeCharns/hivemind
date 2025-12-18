/**
 * Account Page - Redirect to Settings
 *
 * Legacy /account route redirects to canonical /settings route
 */

import { redirect } from "next/navigation";

export default function AccountPage() {
  redirect("/settings");
}
