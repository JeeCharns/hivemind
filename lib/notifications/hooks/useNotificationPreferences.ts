'use client';

/**
 * useNotificationPreferences Hook
 *
 * Fetches and updates email notification preferences.
 * Provides optimistic updates with rollback on error.
 */

import { useState, useEffect, useCallback } from 'react';
import type { EmailPreferences } from '../domain/notification.types';

interface UseNotificationPreferencesResult {
  preferences: EmailPreferences | null;
  loading: boolean;
  error: string | null;
  updatePreferences: (updates: Partial<EmailPreferences>) => Promise<void>;
}

export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch preferences
  useEffect(() => {
    let cancelled = false;

    async function fetchPreferences() {
      try {
        const response = await fetch('/api/profile/notifications');
        if (!response.ok) {
          throw new Error('Failed to fetch preferences');
        }
        const data = await response.json();
        if (!cancelled) {
          setPreferences(data.email_preferences);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  // Update preferences with optimistic update
  const updatePreferences = useCallback(
    async (updates: Partial<EmailPreferences>) => {
      if (!preferences) return;

      const previousPreferences = preferences;
      const optimisticUpdate = { ...preferences, ...updates };
      setPreferences(optimisticUpdate);
      setError(null);

      try {
        const response = await fetch('/api/profile/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email_preferences: updates }),
        });

        if (!response.ok) {
          // Rollback on error
          setPreferences(previousPreferences);
          throw new Error('Failed to update preferences');
        }

        const data = await response.json();
        setPreferences(data.email_preferences);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [preferences]
  );

  return { preferences, loading, error, updatePreferences };
}
