/**
 * Navbar View Model Types
 *
 * Defines the data contract between server-side logic and presentational navbar component
 * Following SRP: view models are separate from domain models
 */

export interface NavbarUser {
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface HiveOption {
  id: string;
  slug: string | null;
  name: string;
}

export interface CurrentHive {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  isAdmin: boolean;
}

export type NavbarPage = "home" | "members" | "settings" | "invite";

export interface NavbarViewModel {
  user: NavbarUser | null;
  hives: HiveOption[];
  currentHive: CurrentHive | null;
  currentPage: NavbarPage;
}
