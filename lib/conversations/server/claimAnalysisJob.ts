import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimAnalysisJobResult =
  | { claimed: true; lockedAt: string }
  | { claimed: false; reason: "not_queued_or_locked" };

function supabaseHostFromEnv(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function claimAnalysisJob(
  supabase: SupabaseClient,
  opts: {
    jobId: string;
    lockTtlMs: number;
  }
): Promise<ClaimAnalysisJobResult> {
  const now = new Date();
  const lockedAt = now.toISOString();
  const cutoff = new Date(now.getTime() - opts.lockTtlMs).toISOString();

  console.log("[claimAnalysisJob] Attempting to claim job:", {
    jobId: opts.jobId,
    lockedAt,
    cutoff,
    supabaseHost: supabaseHostFromEnv(),
  });

  const { data, error } = await supabase
    .from("conversation_analysis_jobs")
    .update({
      status: "running",
      locked_at: lockedAt,
      // Keep this conservative: not all DBs may have started_at/locked_by columns.
      updated_at: lockedAt,
    })
    .eq("id", opts.jobId)
    .or(
      [
        // Normal claim: queued and not locked
        "and(status.eq.queued,locked_at.is.null)",
        // Reclaim: queued but stale lock (shouldn't happen often, but safe)
        `and(status.eq.queued,locked_at.lt.${cutoff})`,
        // Reclaim: running but stale lock (crashed executor)
        "and(status.eq.running,locked_at.is.null)",
        `and(status.eq.running,locked_at.lt.${cutoff})`,
      ].join(",")
    )
    .select("id");

  console.log("[claimAnalysisJob] Update result:", {
    jobId: opts.jobId,
    hasData: !!data,
    dataLength: Array.isArray(data) ? data.length : 0,
    hasError: !!error,
    errorCode: error?.code,
    errorMessage: error?.message,
    errorDetails: error?.details,
  });

  if (error) {
    const message = error.message || "Unknown error";
    const errorCode = error.code;

    console.log("[claimAnalysisJob] Error details for fallback check:", {
      errorCode,
      message,
      includesStatus: message.includes("conversation_analysis_jobs.status"),
      includesDoesNotExist: message.includes("does not exist"),
      isCode42703: errorCode === "42703",
    });

    // PostgreSQL error code 42703 = "column does not exist"
    // OR message indicates column doesn't exist
    if (
      errorCode === "42703" ||
      (message.includes("conversation_analysis_jobs.status") &&
        message.includes("does not exist"))
    ) {
      console.warn(
        "[claimAnalysisJob] PostgREST schema cache issue detected - attempting fallback without status column"
      );

      // Fallback: if PostgREST schema cache is out-of-date (or a legacy table is missing `status`),
      // try even more minimal approach - just SELECT to verify row exists
      console.log("[claimAnalysisJob] Trying SELECT-only approach to verify row exists...");

      const selectTest = await supabase
        .from("conversation_analysis_jobs")
        .select("id")
        .eq("id", opts.jobId)
        .single();

      console.log("[claimAnalysisJob] SELECT test result:", {
        hasError: !!selectTest.error,
        errorCode: selectTest.error?.code,
        errorMessage: selectTest.error?.message,
        hasData: !!selectTest.data,
      });

      if (selectTest.error) {
        console.error(
          "[claimAnalysisJob] ❌ Even SELECT by ID fails:",
          selectTest.error
        );
        throw new Error(
          `Failed to claim analysis job: Cannot even SELECT from conversation_analysis_jobs. Error: ${selectTest.error.message}`
        );
      }

      // If SELECT works, try UPDATE without any column references in the payload
      console.log("[claimAnalysisJob] SELECT works, but UPDATE with columns fails.");
      console.log("[claimAnalysisJob] This indicates PostgREST can READ the table but has stale write schema.");

      // Since we can't update the job table, we'll just return that we couldn't claim it
      // The calling code will handle this by proceeding without job tracking

      throw new Error(
        "Failed to claim analysis job: PostgREST schema cache doesn't include 'status' column. " +
          "Please reload PostgREST schema cache: run `SELECT pg_notify('pgrst', 'reload schema');` in Supabase SQL editor, " +
          "or restart your Supabase project. " +
          `Connected Supabase host: ${supabaseHostFromEnv() ?? "unknown"}`
      );
    }
    throw new Error(`Failed to claim analysis job: ${message}`);
  }

  if (Array.isArray(data) && data.length > 0) {
    return { claimed: true, lockedAt };
  }

  return { claimed: false, reason: "not_queued_or_locked" };
}
