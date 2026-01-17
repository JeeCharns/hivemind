


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."claim_analysis_job"("p_job_id" "uuid", "p_locked_at" timestamp with time zone, "p_cutoff" timestamp with time zone) RETURNS TABLE("id" "uuid", "claimed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Attempt to claim the job with the same logic as the TypeScript version
  UPDATE public.conversation_analysis_jobs
  SET
    status = 'running',
    locked_at = p_locked_at,
    updated_at = p_locked_at
  WHERE
    conversation_analysis_jobs.id = p_job_id
    AND (
      -- Normal claim: queued and not locked
      (status = 'queued' AND locked_at IS NULL)
      -- Reclaim: queued but stale lock
      OR (status = 'queued' AND locked_at < p_cutoff)
      -- Reclaim: running but no lock
      OR (status = 'running' AND locked_at IS NULL)
      -- Reclaim: running but stale lock (crashed executor)
      OR (status = 'running' AND locked_at < p_cutoff)
    );

  -- Get the number of rows updated
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Return result
  IF v_updated_count > 0 THEN
    RETURN QUERY SELECT p_job_id, TRUE;
  ELSE
    RETURN QUERY SELECT p_job_id, FALSE;
  END IF;
END;
$$;


ALTER FUNCTION "public"."claim_analysis_job"("p_job_id" "uuid", "p_locked_at" timestamp with time zone, "p_cutoff" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_analysis_job"("p_job_id" "uuid", "p_locked_at" timestamp with time zone, "p_cutoff" timestamp with time zone) IS 'Atomically claims an analysis job for processing, bypassing PostgREST schema cache issues';



CREATE OR REPLACE FUNCTION "public"."fetch_next_analysis_job"("p_cutoff" timestamp with time zone) RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "status" "text", "attempts" integer, "strategy" "text", "locked_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "created_by" "uuid", "last_error" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.conversation_id,
    j.status,
    j.attempts,
    j.strategy,
    j.locked_at,
    j.created_at,
    j.updated_at,
    j.created_by,
    j.last_error
  FROM public.conversation_analysis_jobs j
  WHERE
    j.status = 'queued'
    OR (j.status = 'running' AND j.locked_at IS NULL)
    OR (j.status = 'running' AND j.locked_at < p_cutoff)
  ORDER BY j.created_at ASC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."fetch_next_analysis_job"("p_cutoff" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fetch_next_analysis_job"("p_cutoff" timestamp with time zone) IS 'Fetches the next available analysis job, bypassing PostgREST schema cache issues';



CREATE OR REPLACE FUNCTION "public"."slugify"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select regexp_replace(lower(trim(input)), '[^a-z0-9]+', '-', 'g');
$$;


ALTER FUNCTION "public"."slugify"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_hive_invite_links_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_hive_invite_links_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_hive_invites_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_hive_invites_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vote_on_proposal"("p_conversation_id" "uuid", "p_response_id" bigint, "p_user_id" "uuid", "p_delta" integer) RETURNS TABLE("success" boolean, "new_votes" integer, "remaining_credits" integer, "error_code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_current_votes INTEGER;
  v_new_votes INTEGER;
  v_new_cost INTEGER;
  v_current_spend INTEGER;
  v_total_spend INTEGER;
  v_conversation_type TEXT;
  v_response_tag TEXT;
  v_max_budget INTEGER := 99;
  v_hive_id UUID;
  v_budget_total INTEGER;
  v_budget_spent INTEGER;
BEGIN
  -- Prevent spoofing: callers must vote as themselves
  IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'UNAUTHORIZED_USER';
    RETURN;
  END IF;

  -- Validate conversation exists and is a decision session
  SELECT type, hive_id INTO v_conversation_type, v_hive_id
  FROM conversations
  WHERE id = p_conversation_id;

  IF v_conversation_type IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'CONVERSATION_NOT_FOUND';
    RETURN;
  END IF;

  IF v_conversation_type != 'decide' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'NOT_DECISION_SESSION';
    RETURN;
  END IF;

  -- Validate hive membership (SECURITY DEFINER bypasses RLS)
  IF NOT EXISTS (
    SELECT 1
    FROM hive_members
    WHERE hive_id = v_hive_id AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'NOT_HIVE_MEMBER';
    RETURN;
  END IF;

  -- Validate response exists and is a proposal
  SELECT tag INTO v_response_tag
  FROM conversation_responses
  WHERE id = p_response_id AND conversation_id = p_conversation_id;

  IF v_response_tag IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'RESPONSE_NOT_FOUND';
    RETURN;
  END IF;

  IF v_response_tag != 'proposal' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'NOT_A_PROPOSAL';
    RETURN;
  END IF;

  -- Get current votes for this proposal
  SELECT votes INTO v_current_votes
  FROM public.quadratic_vote_allocations
  WHERE conversation_id = p_conversation_id
    AND proposal_response_id = p_response_id
    AND user_id = p_user_id;

  IF v_current_votes IS NULL THEN
    v_current_votes := 0;
  END IF;

  -- Ensure a budget row exists and lock it for update to avoid race conditions
  INSERT INTO public.quadratic_vote_budgets (conversation_id, user_id, credits_total, credits_spent)
  VALUES (p_conversation_id, p_user_id, v_max_budget, 0)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  SELECT credits_total, credits_spent
  INTO v_budget_total, v_budget_spent
  FROM public.quadratic_vote_budgets
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_budget_total IS NULL THEN
    RETURN QUERY SELECT FALSE, v_current_votes, 0, 'BUDGET_ROW_MISSING';
    RETURN;
  END IF;

  -- Calculate new votes
  v_new_votes := v_current_votes + p_delta;

  -- Votes cannot be negative
  IF v_new_votes < 0 THEN
    RETURN QUERY SELECT FALSE, v_current_votes, 0, 'NEGATIVE_VOTES';
    RETURN;
  END IF;

  -- Calculate current total spend for this user in this conversation
  SELECT COALESCE(SUM(votes * votes), 0) INTO v_current_spend
  FROM public.quadratic_vote_allocations
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;

  -- Calculate cost change for this vote adjustment
  v_new_cost := (v_new_votes * v_new_votes) - (v_current_votes * v_current_votes);

  -- Check budget
  v_total_spend := v_current_spend + v_new_cost;
  IF v_total_spend > v_budget_total THEN
    RETURN QUERY SELECT FALSE, v_current_votes, v_budget_total - v_current_spend, 'BUDGET_EXCEEDED';
    RETURN;
  END IF;

  -- Upsert the vote
  INSERT INTO public.quadratic_vote_allocations (conversation_id, user_id, proposal_response_id, votes, created_at)
  VALUES (p_conversation_id, p_user_id, p_response_id, v_new_votes, now())
  ON CONFLICT (conversation_id, user_id, proposal_response_id)
  DO UPDATE SET votes = EXCLUDED.votes;

  -- Persist updated spend in budgets table (authoritative spend is sum(votes^2))
  UPDATE public.quadratic_vote_budgets
  SET credits_spent = v_total_spend
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  -- Return success with new state
  RETURN QUERY SELECT TRUE, v_new_votes, v_budget_total - v_total_spend, NULL::TEXT;
END;
$$;


ALTER FUNCTION "public"."vote_on_proposal"("p_conversation_id" "uuid", "p_response_id" bigint, "p_user_id" "uuid", "p_delta" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."conversation_analysis_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "last_error" "text",
    "strategy" "text" DEFAULT 'full'::"text",
    CONSTRAINT "conversation_analysis_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'succeeded'::"text", 'failed'::"text"]))),
    CONSTRAINT "conversation_analysis_jobs_strategy_check" CHECK (("strategy" = ANY (ARRAY['incremental'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."conversation_analysis_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_attachments" (
    "id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_attachments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."conversation_attachments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."conversation_attachments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conversation_attachments_id_seq" OWNED BY "public"."conversation_attachments"."id";



CREATE TABLE IF NOT EXISTS "public"."conversation_cluster_models" (
    "conversation_id" "uuid" NOT NULL,
    "cluster_index" integer NOT NULL,
    "centroid_embedding" real[] NOT NULL,
    "centroid_x_umap" double precision NOT NULL,
    "centroid_y_umap" double precision NOT NULL,
    "spread_radius" double precision DEFAULT 0.1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_cluster_models" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_cluster_models" IS 'Internal table: cluster models for incremental analysis. Written by worker (service role), read by server code only. RLS disabled.';



COMMENT ON COLUMN "public"."conversation_cluster_models"."centroid_embedding" IS 'Cluster centroid in embedding space (float4[])';



COMMENT ON COLUMN "public"."conversation_cluster_models"."centroid_x_umap" IS 'Cluster centroid X coordinate in 2D UMAP space';



COMMENT ON COLUMN "public"."conversation_cluster_models"."centroid_y_umap" IS 'Cluster centroid Y coordinate in 2D UMAP space';



COMMENT ON COLUMN "public"."conversation_cluster_models"."spread_radius" IS 'Cluster spread radius for jitter placement';



CREATE TABLE IF NOT EXISTS "public"."conversation_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "html" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_response_embeddings" (
    "response_id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "embedding" real[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_response_embeddings" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_response_embeddings" IS 'Internal table: response embeddings for analysis. Written by worker (service role), read by server code only. RLS disabled.';



COMMENT ON COLUMN "public"."conversation_response_embeddings"."embedding" IS 'OpenAI embedding vector (normalized to unit length)';



CREATE TABLE IF NOT EXISTS "public"."conversation_response_group_members" (
    "group_id" "uuid" NOT NULL,
    "response_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_response_group_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_response_group_members" IS 'Membership mapping for response groups';



CREATE TABLE IF NOT EXISTS "public"."conversation_response_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "cluster_index" integer NOT NULL,
    "representative_response_id" bigint NOT NULL,
    "group_size" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."conversation_response_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_response_groups" IS 'Frequently mentioned response groups (near-duplicates within themes)';



COMMENT ON COLUMN "public"."conversation_response_groups"."cluster_index" IS 'Theme cluster index this group belongs to';



COMMENT ON COLUMN "public"."conversation_response_groups"."representative_response_id" IS 'Representative response ID (most characteristic)';



COMMENT ON COLUMN "public"."conversation_response_groups"."group_size" IS 'Number of responses in this group';



COMMENT ON COLUMN "public"."conversation_response_groups"."params" IS 'Grouping parameters: sim_threshold, min_group_size, algorithm_version';



CREATE TABLE IF NOT EXISTS "public"."conversation_responses" (
    "id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "original_row_index" integer,
    "response_text" "text" NOT NULL,
    "tag" "text",
    "embedding" "public"."vector"(1536),
    "cluster_index" integer,
    "x_umap" double precision,
    "y_umap" double precision,
    "is_cluster_central" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT 'c8661a31-3493-4c0f-9f14-0c08fcc68696'::"uuid" NOT NULL,
    "import_batch_id" "uuid",
    "x" double precision,
    "y" double precision,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "distance_to_centroid" double precision,
    "outlier_score" double precision,
    "is_misc" boolean DEFAULT false,
    CONSTRAINT "conversation_responses_cluster_index_check" CHECK ((("cluster_index" IS NULL) OR ("cluster_index" >= '-1'::integer))),
    CONSTRAINT "conversation_responses_tag_check" CHECK (("tag" = ANY (ARRAY['data'::"text", 'problem'::"text", 'need'::"text", 'want'::"text", 'risk'::"text", 'proposal'::"text"])))
);


ALTER TABLE "public"."conversation_responses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversation_responses"."tag" IS 'Optional tag for categorizing responses (question, idea, concern, blocker, proposal)';



COMMENT ON COLUMN "public"."conversation_responses"."cluster_index" IS 'Cluster assignment: NULL = unanalyzed, -1 = misc/outlier, 0..N-1 = regular clusters (0 = largest)';



COMMENT ON COLUMN "public"."conversation_responses"."distance_to_centroid" IS 'Cosine distance from response embedding to assigned cluster centroid (0 = identical, 2 = opposite)';



COMMENT ON COLUMN "public"."conversation_responses"."outlier_score" IS 'MAD-based modified z-score for outlier detection (z > 3.5 = outlier)';



COMMENT ON COLUMN "public"."conversation_responses"."is_misc" IS 'TRUE if response was marked as outlier/misc based on distance threshold';



CREATE SEQUENCE IF NOT EXISTS "public"."conversation_responses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."conversation_responses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conversation_responses_id_seq" OWNED BY "public"."conversation_responses"."id";



CREATE TABLE IF NOT EXISTS "public"."conversation_themes" (
    "id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "cluster_index" integer NOT NULL,
    "name" "text",
    "description" "text",
    "size" integer,
    "avg_similarity" double precision,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_themes_cluster_index_check" CHECK (("cluster_index" >= '-1'::integer))
);


ALTER TABLE "public"."conversation_themes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversation_themes"."cluster_index" IS 'Cluster index: -1 = misc theme, 0..N-1 = regular themes (0 = largest)';



CREATE SEQUENCE IF NOT EXISTS "public"."conversation_themes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."conversation_themes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conversation_themes_id_seq" OWNED BY "public"."conversation_themes"."id";



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hive_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "type" "text" NOT NULL,
    "phase" "text" DEFAULT 'listen_open'::"text" NOT NULL,
    "analysis_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "analysis_error" "text",
    "report_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "slug" "text",
    "created_by" "uuid",
    "analysis_response_count" integer,
    "analysis_updated_at" timestamp with time zone,
    "source_conversation_id" "uuid",
    "source_report_version" integer,
    CONSTRAINT "conversations_analysis_status_check" CHECK (("analysis_status" = ANY (ARRAY['not_started'::"text", 'embedding'::"text", 'analyzing'::"text", 'ready'::"text", 'error'::"text"]))),
    CONSTRAINT "conversations_phase_check" CHECK (("phase" = ANY (ARRAY['listen_open'::"text", 'understand_open'::"text", 'respond_open'::"text", 'vote_open'::"text", 'report_open'::"text"]))),
    CONSTRAINT "conversations_type_check" CHECK (("type" = ANY (ARRAY['understand'::"text", 'decide'::"text"])))
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hive_invite_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hive_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "access_mode" "text" DEFAULT 'anyone'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hive_invite_links_access_mode_check" CHECK (("access_mode" = ANY (ARRAY['anyone'::"text", 'invited_only'::"text"])))
);


ALTER TABLE "public"."hive_invite_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."hive_invite_links" IS 'Stores shareable invite links for hives with configurable access modes';



COMMENT ON COLUMN "public"."hive_invite_links"."id" IS 'Unique identifier for the invite link';



COMMENT ON COLUMN "public"."hive_invite_links"."hive_id" IS 'The hive this invite link is for';



COMMENT ON COLUMN "public"."hive_invite_links"."token" IS 'Cryptographically strong random token used in the invite URL';



COMMENT ON COLUMN "public"."hive_invite_links"."access_mode" IS 'Access mode: anyone (any user with link can join) or invited_only (only invited emails can join)';



COMMENT ON COLUMN "public"."hive_invite_links"."created_by" IS 'User ID of the admin who created this link';



CREATE TABLE IF NOT EXISTS "public"."hive_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hive_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "accepted_at" timestamp with time zone,
    CONSTRAINT "hive_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."hive_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."hive_invites" IS 'Stores pending and accepted invitations to hives';



COMMENT ON COLUMN "public"."hive_invites"."id" IS 'Unique identifier for the invite';



COMMENT ON COLUMN "public"."hive_invites"."hive_id" IS 'The hive this invite is for';



COMMENT ON COLUMN "public"."hive_invites"."email" IS 'Email address of the invited user';



COMMENT ON COLUMN "public"."hive_invites"."status" IS 'Status of the invite: pending, accepted, or revoked';



COMMENT ON COLUMN "public"."hive_invites"."created_by" IS 'User ID of the admin who created this invite';



COMMENT ON COLUMN "public"."hive_invites"."accepted_at" IS 'Timestamp when the invite was accepted';



CREATE TABLE IF NOT EXISTS "public"."hive_members" (
    "id" bigint NOT NULL,
    "hive_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hive_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."hive_members" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."hive_members_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."hive_members_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."hive_members_id_seq" OWNED BY "public"."hive_members"."id";



CREATE TABLE IF NOT EXISTS "public"."hives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_url" "text",
    "slug" "text",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    CONSTRAINT "hives_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."hives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "avatar_path" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quadratic_vote_allocations" (
    "id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "proposal_response_id" bigint NOT NULL,
    "votes" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quadratic_vote_allocations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."quadratic_vote_allocations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."quadratic_vote_allocations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."quadratic_vote_allocations_id_seq" OWNED BY "public"."quadratic_vote_allocations"."id";



CREATE TABLE IF NOT EXISTS "public"."quadratic_vote_budgets" (
    "id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "credits_total" integer DEFAULT 99 NOT NULL,
    "credits_spent" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quadratic_vote_budgets" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."quadratic_vote_budgets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."quadratic_vote_budgets_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."quadratic_vote_budgets_id_seq" OWNED BY "public"."quadratic_vote_budgets"."id";



CREATE TABLE IF NOT EXISTS "public"."response_feedback" (
    "id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "response_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feedback" "text" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "response_feedback_feedback_check" CHECK (("feedback" = ANY (ARRAY['agree'::"text", 'pass'::"text", 'disagree'::"text"])))
);


ALTER TABLE "public"."response_feedback" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."response_feedback_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."response_feedback_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."response_feedback_id_seq" OWNED BY "public"."response_feedback"."id";



CREATE TABLE IF NOT EXISTS "public"."response_likes" (
    "id" bigint NOT NULL,
    "response_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."response_likes" OWNER TO "postgres";


ALTER TABLE "public"."response_likes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."response_likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."conversation_attachments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversation_attachments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conversation_responses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversation_responses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conversation_themes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversation_themes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."hive_members" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."hive_members_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."quadratic_vote_allocations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."quadratic_vote_allocations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."quadratic_vote_budgets" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."quadratic_vote_budgets_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."response_feedback" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."response_feedback_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conversation_analysis_jobs"
    ADD CONSTRAINT "conversation_analysis_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_attachments"
    ADD CONSTRAINT "conversation_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_cluster_models"
    ADD CONSTRAINT "conversation_cluster_models_pkey" PRIMARY KEY ("conversation_id", "cluster_index");



ALTER TABLE ONLY "public"."conversation_reports"
    ADD CONSTRAINT "conversation_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_response_embeddings"
    ADD CONSTRAINT "conversation_response_embeddings_pkey" PRIMARY KEY ("response_id");



ALTER TABLE ONLY "public"."conversation_response_group_members"
    ADD CONSTRAINT "conversation_response_group_members_pkey" PRIMARY KEY ("group_id", "response_id");



ALTER TABLE ONLY "public"."conversation_response_groups"
    ADD CONSTRAINT "conversation_response_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_responses"
    ADD CONSTRAINT "conversation_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_themes"
    ADD CONSTRAINT "conversation_themes_conversation_id_cluster_index_key" UNIQUE ("conversation_id", "cluster_index");



ALTER TABLE ONLY "public"."conversation_themes"
    ADD CONSTRAINT "conversation_themes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hive_invite_links"
    ADD CONSTRAINT "hive_invite_links_hive_id_key" UNIQUE ("hive_id");



ALTER TABLE ONLY "public"."hive_invite_links"
    ADD CONSTRAINT "hive_invite_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hive_invite_links"
    ADD CONSTRAINT "hive_invite_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."hive_invites"
    ADD CONSTRAINT "hive_invites_hive_id_email_status_key" UNIQUE ("hive_id", "email", "status");



ALTER TABLE ONLY "public"."hive_invites"
    ADD CONSTRAINT "hive_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hive_members"
    ADD CONSTRAINT "hive_members_hive_id_user_id_key" UNIQUE ("hive_id", "user_id");



ALTER TABLE ONLY "public"."hive_members"
    ADD CONSTRAINT "hive_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hives"
    ADD CONSTRAINT "hives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hives"
    ADD CONSTRAINT "hives_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quadratic_vote_allocations"
    ADD CONSTRAINT "quadratic_vote_allocations_conversation_id_user_id_proposal_key" UNIQUE ("conversation_id", "user_id", "proposal_response_id");



ALTER TABLE ONLY "public"."quadratic_vote_allocations"
    ADD CONSTRAINT "quadratic_vote_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quadratic_vote_budgets"
    ADD CONSTRAINT "quadratic_vote_budgets_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."quadratic_vote_budgets"
    ADD CONSTRAINT "quadratic_vote_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_feedback"
    ADD CONSTRAINT "response_feedback_conversation_id_response_id_user_id_key" UNIQUE ("conversation_id", "response_id", "user_id");



ALTER TABLE ONLY "public"."response_feedback"
    ADD CONSTRAINT "response_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_likes"
    ADD CONSTRAINT "response_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_likes"
    ADD CONSTRAINT "unique_like" UNIQUE ("response_id", "user_id");



CREATE INDEX "conversation_reports_convo_version_desc_idx" ON "public"."conversation_reports" USING "btree" ("conversation_id", "version" DESC);



CREATE UNIQUE INDEX "conversation_reports_convo_version_idx" ON "public"."conversation_reports" USING "btree" ("conversation_id", "version");



CREATE INDEX "conversation_responses_conv_created_idx" ON "public"."conversation_responses" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "conversation_responses_user_id_idx" ON "public"."conversation_responses" USING "btree" ("user_id");



CREATE UNIQUE INDEX "conversations_hive_id_slug_key" ON "public"."conversations" USING "btree" ("hive_id", "slug");



CREATE INDEX "idx_cluster_models_conversation" ON "public"."conversation_cluster_models" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_analysis_jobs_conversation_id" ON "public"."conversation_analysis_jobs" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_analysis_jobs_locked_at" ON "public"."conversation_analysis_jobs" USING "btree" ("locked_at");



CREATE INDEX "idx_conversation_analysis_jobs_status" ON "public"."conversation_analysis_jobs" USING "btree" ("status");



CREATE INDEX "idx_conversation_analysis_jobs_status_created_at" ON "public"."conversation_analysis_jobs" USING "btree" ("status", "created_at");



CREATE UNIQUE INDEX "idx_conversation_analysis_jobs_unique_active" ON "public"."conversation_analysis_jobs" USING "btree" ("conversation_id") WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"]));



CREATE INDEX "idx_conversation_attachments_conversation_id" ON "public"."conversation_attachments" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_responses_cluster" ON "public"."conversation_responses" USING "btree" ("conversation_id", "cluster_index");



CREATE INDEX "idx_conversation_responses_conversation_id" ON "public"."conversation_responses" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_responses_import_batch_id" ON "public"."conversation_responses" USING "btree" ("import_batch_id");



CREATE INDEX "idx_conversation_responses_is_misc" ON "public"."conversation_responses" USING "btree" ("conversation_id", "is_misc") WHERE ("is_misc" = true);



CREATE INDEX "idx_conversation_responses_umap" ON "public"."conversation_responses" USING "btree" ("conversation_id", "x_umap", "y_umap") WHERE (("x_umap" IS NOT NULL) AND ("y_umap" IS NOT NULL));



CREATE INDEX "idx_conversation_themes_conversation_id" ON "public"."conversation_themes" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversations_source_conversation_id" ON "public"."conversations" USING "btree" ("source_conversation_id");



CREATE INDEX "idx_group_members_group" ON "public"."conversation_response_group_members" USING "btree" ("group_id");



CREATE INDEX "idx_group_members_response" ON "public"."conversation_response_group_members" USING "btree" ("response_id");



CREATE INDEX "idx_hive_invite_links_hive_id" ON "public"."hive_invite_links" USING "btree" ("hive_id");



CREATE INDEX "idx_hive_invite_links_token" ON "public"."hive_invite_links" USING "btree" ("token");



CREATE INDEX "idx_hive_invites_email" ON "public"."hive_invites" USING "btree" ("email");



CREATE INDEX "idx_hive_invites_hive_id" ON "public"."hive_invites" USING "btree" ("hive_id");



CREATE INDEX "idx_hive_invites_status" ON "public"."hive_invites" USING "btree" ("status");



CREATE INDEX "idx_hives_visibility" ON "public"."hives" USING "btree" ("visibility");



CREATE UNIQUE INDEX "idx_one_group_per_response" ON "public"."conversation_response_group_members" USING "btree" ("response_id");



CREATE INDEX "idx_qv_allocations_conversation_id" ON "public"."quadratic_vote_allocations" USING "btree" ("conversation_id");



CREATE INDEX "idx_qv_allocations_proposal" ON "public"."quadratic_vote_allocations" USING "btree" ("proposal_response_id");



CREATE INDEX "idx_qv_budgets_conversation_id" ON "public"."quadratic_vote_budgets" USING "btree" ("conversation_id");



CREATE INDEX "idx_response_embeddings_conversation" ON "public"."conversation_response_embeddings" USING "btree" ("conversation_id");



CREATE INDEX "idx_response_feedback_conversation_id" ON "public"."response_feedback" USING "btree" ("conversation_id");



CREATE INDEX "idx_response_feedback_response_id" ON "public"."response_feedback" USING "btree" ("response_id");



CREATE INDEX "idx_response_groups_cluster" ON "public"."conversation_response_groups" USING "btree" ("conversation_id", "cluster_index");



CREATE INDEX "idx_response_groups_conversation" ON "public"."conversation_response_groups" USING "btree" ("conversation_id");



CREATE INDEX "idx_response_groups_representative" ON "public"."conversation_response_groups" USING "btree" ("representative_response_id");



CREATE INDEX "response_likes_response_idx" ON "public"."response_likes" USING "btree" ("response_id");



CREATE UNIQUE INDEX "uniq_conversation_analysis_jobs_active" ON "public"."conversation_analysis_jobs" USING "btree" ("conversation_id") WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"]));



CREATE OR REPLACE TRIGGER "update_hive_invite_links_updated_at" BEFORE UPDATE ON "public"."hive_invite_links" FOR EACH ROW EXECUTE FUNCTION "public"."update_hive_invite_links_updated_at"();



CREATE OR REPLACE TRIGGER "update_hive_invites_updated_at" BEFORE UPDATE ON "public"."hive_invites" FOR EACH ROW EXECUTE FUNCTION "public"."update_hive_invites_updated_at"();



ALTER TABLE ONLY "public"."conversation_analysis_jobs"
    ADD CONSTRAINT "conversation_analysis_jobs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_analysis_jobs"
    ADD CONSTRAINT "conversation_analysis_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."conversation_attachments"
    ADD CONSTRAINT "conversation_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_attachments"
    ADD CONSTRAINT "conversation_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_cluster_models"
    ADD CONSTRAINT "conversation_cluster_models_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_reports"
    ADD CONSTRAINT "conversation_reports_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_reports"
    ADD CONSTRAINT "conversation_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversation_response_embeddings"
    ADD CONSTRAINT "conversation_response_embeddings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_response_embeddings"
    ADD CONSTRAINT "conversation_response_embeddings_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."conversation_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_response_group_members"
    ADD CONSTRAINT "conversation_response_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."conversation_response_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_response_group_members"
    ADD CONSTRAINT "conversation_response_group_members_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."conversation_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_response_groups"
    ADD CONSTRAINT "conversation_response_groups_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_response_groups"
    ADD CONSTRAINT "conversation_response_groups_representative_response_id_fkey" FOREIGN KEY ("representative_response_id") REFERENCES "public"."conversation_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_responses"
    ADD CONSTRAINT "conversation_responses_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_responses"
    ADD CONSTRAINT "conversation_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversation_themes"
    ADD CONSTRAINT "conversation_themes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "public"."hives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hive_invite_links"
    ADD CONSTRAINT "hive_invite_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hive_invite_links"
    ADD CONSTRAINT "hive_invite_links_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "public"."hives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hive_invites"
    ADD CONSTRAINT "hive_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hive_invites"
    ADD CONSTRAINT "hive_invites_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "public"."hives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hive_members"
    ADD CONSTRAINT "hive_members_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "public"."hives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hive_members"
    ADD CONSTRAINT "hive_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quadratic_vote_allocations"
    ADD CONSTRAINT "quadratic_vote_allocations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quadratic_vote_allocations"
    ADD CONSTRAINT "quadratic_vote_allocations_proposal_response_id_fkey" FOREIGN KEY ("proposal_response_id") REFERENCES "public"."conversation_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quadratic_vote_allocations"
    ADD CONSTRAINT "quadratic_vote_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quadratic_vote_budgets"
    ADD CONSTRAINT "quadratic_vote_budgets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quadratic_vote_budgets"
    ADD CONSTRAINT "quadratic_vote_budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_feedback"
    ADD CONSTRAINT "response_feedback_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_feedback"
    ADD CONSTRAINT "response_feedback_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."conversation_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_feedback"
    ADD CONSTRAINT "response_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_likes"
    ADD CONSTRAINT "response_likes_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."conversation_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_likes"
    ADD CONSTRAINT "response_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create hive invites" ON "public"."hive_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."hive_members"
  WHERE (("hive_members"."hive_id" = "hive_invites"."hive_id") AND ("hive_members"."user_id" = "auth"."uid"()) AND ("hive_members"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete hive invites" ON "public"."hive_invites" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."hive_members"
  WHERE (("hive_members"."hive_id" = "hive_invites"."hive_id") AND ("hive_members"."user_id" = "auth"."uid"()) AND ("hive_members"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage hive invite links" ON "public"."hive_invite_links" USING ((EXISTS ( SELECT 1
   FROM "public"."hive_members"
  WHERE (("hive_members"."hive_id" = "hive_invite_links"."hive_id") AND ("hive_members"."user_id" = "auth"."uid"()) AND ("hive_members"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."hive_members"
  WHERE (("hive_members"."hive_id" = "hive_invite_links"."hive_id") AND ("hive_members"."user_id" = "auth"."uid"()) AND ("hive_members"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update hive invites" ON "public"."hive_invites" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."hive_members"
  WHERE (("hive_members"."hive_id" = "hive_invites"."hive_id") AND ("hive_members"."user_id" = "auth"."uid"()) AND ("hive_members"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view hive invites" ON "public"."hive_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."hive_members"
  WHERE (("hive_members"."hive_id" = "hive_invites"."hive_id") AND ("hive_members"."user_id" = "auth"."uid"()) AND ("hive_members"."role" = 'admin'::"text")))));



CREATE POLICY "Members can view hive invite links" ON "public"."hive_invite_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."hive_members"
  WHERE (("hive_members"."hive_id" = "hive_invite_links"."hive_id") AND ("hive_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view cluster models for conversations in their hives" ON "public"."conversation_cluster_models" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."hive_members" "hm" ON (("hm"."hive_id" = "c"."hive_id")))
  WHERE (("c"."id" = "conversation_cluster_models"."conversation_id") AND ("hm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view embeddings for conversations in their hives" ON "public"."conversation_response_embeddings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."hive_members" "hm" ON (("hm"."hive_id" = "c"."hive_id")))
  WHERE (("c"."id" = "conversation_response_embeddings"."conversation_id") AND ("hm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view group members for conversations in their hives" ON "public"."conversation_response_group_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."conversation_response_groups" "grp"
     JOIN "public"."conversations" "c" ON (("c"."id" = "grp"."conversation_id")))
     JOIN "public"."hive_members" "hm" ON (("hm"."hive_id" = "c"."hive_id")))
  WHERE (("grp"."id" = "conversation_response_group_members"."group_id") AND ("hm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view groups for conversations in their hives" ON "public"."conversation_response_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."hive_members" "hm" ON (("hm"."hive_id" = "c"."hive_id")))
  WHERE (("c"."id" = "conversation_response_groups"."conversation_id") AND ("hm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."conversation_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_attachments_delete_all_authenticated" ON "public"."conversation_attachments" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "conversation_attachments_insert_all_authenticated" ON "public"."conversation_attachments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "conversation_attachments_select_all_authenticated" ON "public"."conversation_attachments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "conversation_attachments_update_all_authenticated" ON "public"."conversation_attachments" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."conversation_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_response_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_response_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_responses_delete_all_authenticated" ON "public"."conversation_responses" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "conversation_responses_insert_all_authenticated" ON "public"."conversation_responses" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "conversation_responses_select_all_authenticated" ON "public"."conversation_responses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "conversation_responses_update_all_authenticated" ON "public"."conversation_responses" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."conversation_themes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_themes_delete_all_authenticated" ON "public"."conversation_themes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "conversation_themes_insert_all_authenticated" ON "public"."conversation_themes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "conversation_themes_select_all_authenticated" ON "public"."conversation_themes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "conversation_themes_update_all_authenticated" ON "public"."conversation_themes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_delete_all_authenticated" ON "public"."conversations" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "conversations_insert_all_authenticated" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "conversations_select_all_authenticated" ON "public"."conversations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "conversations_update_all_authenticated" ON "public"."conversations" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."hive_invite_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hive_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hive_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hive_members_delete_all_authenticated" ON "public"."hive_members" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "hive_members_insert_all_authenticated" ON "public"."hive_members" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "hive_members_select_all_authenticated" ON "public"."hive_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hive_members_update_all_authenticated" ON "public"."hive_members" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."hives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hives_delete_all_authenticated" ON "public"."hives" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "hives_insert_all_authenticated" ON "public"."hives" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "hives_select_all_authenticated" ON "public"."hives" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hives_update_all_authenticated" ON "public"."hives" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "insert own response" ON "public"."conversation_responses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert reports admins" ON "public"."conversation_reports" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."hive_members" "hm" ON (("hm"."hive_id" = "c"."hive_id")))
  WHERE (("c"."id" = "conversation_reports"."conversation_id") AND ("hm"."user_id" = "auth"."uid"()) AND ("hm"."role" = 'admin'::"text")))));



CREATE POLICY "like response" ON "public"."response_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_all_authenticated" ON "public"."profiles" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "profiles_insert_all_authenticated" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "profiles_select_all_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_update_all_authenticated" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."quadratic_vote_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quadratic_vote_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qv_allocations_delete_all_authenticated" ON "public"."quadratic_vote_allocations" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "qv_allocations_insert_all_authenticated" ON "public"."quadratic_vote_allocations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "qv_allocations_select_all_authenticated" ON "public"."quadratic_vote_allocations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "qv_allocations_update_all_authenticated" ON "public"."quadratic_vote_allocations" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "qv_budgets_delete_all_authenticated" ON "public"."quadratic_vote_budgets" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "qv_budgets_insert_all_authenticated" ON "public"."quadratic_vote_budgets" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "qv_budgets_select_all_authenticated" ON "public"."quadratic_vote_budgets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "qv_budgets_update_all_authenticated" ON "public"."quadratic_vote_budgets" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "read all likes" ON "public"."response_likes" FOR SELECT USING (true);



CREATE POLICY "read conversation responses" ON "public"."conversation_responses" FOR SELECT USING (true);



CREATE POLICY "read latest reports" ON "public"."conversation_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."hive_members" "hm" ON (("hm"."hive_id" = "c"."hive_id")))
  WHERE (("c"."id" = "conversation_reports"."conversation_id") AND ("hm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."response_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "response_feedback_delete_all_authenticated" ON "public"."response_feedback" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "response_feedback_insert_all_authenticated" ON "public"."response_feedback" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "response_feedback_select_all_authenticated" ON "public"."response_feedback" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "response_feedback_update_all_authenticated" ON "public"."response_feedback" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."response_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unlike own" ON "public"."response_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_analysis_job"("p_job_id" "uuid", "p_locked_at" timestamp with time zone, "p_cutoff" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_analysis_job"("p_job_id" "uuid", "p_locked_at" timestamp with time zone, "p_cutoff" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_analysis_job"("p_job_id" "uuid", "p_locked_at" timestamp with time zone, "p_cutoff" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."fetch_next_analysis_job"("p_cutoff" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fetch_next_analysis_job"("p_cutoff" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fetch_next_analysis_job"("p_cutoff" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_hive_invite_links_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_hive_invite_links_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_hive_invite_links_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_hive_invites_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_hive_invites_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_hive_invites_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vote_on_proposal"("p_conversation_id" "uuid", "p_response_id" bigint, "p_user_id" "uuid", "p_delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vote_on_proposal"("p_conversation_id" "uuid", "p_response_id" bigint, "p_user_id" "uuid", "p_delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vote_on_proposal"("p_conversation_id" "uuid", "p_response_id" bigint, "p_user_id" "uuid", "p_delta" integer) TO "service_role";



GRANT ALL ON TABLE "public"."conversation_analysis_jobs" TO "anon";
GRANT ALL ON TABLE "public"."conversation_analysis_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_analysis_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_attachments" TO "anon";
GRANT ALL ON TABLE "public"."conversation_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_attachments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_attachments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_attachments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_attachments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_cluster_models" TO "anon";
GRANT ALL ON TABLE "public"."conversation_cluster_models" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_cluster_models" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_reports" TO "anon";
GRANT ALL ON TABLE "public"."conversation_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_reports" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_response_embeddings" TO "anon";
GRANT ALL ON TABLE "public"."conversation_response_embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_response_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_response_group_members" TO "anon";
GRANT ALL ON TABLE "public"."conversation_response_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_response_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_response_groups" TO "anon";
GRANT ALL ON TABLE "public"."conversation_response_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_response_groups" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_responses" TO "anon";
GRANT ALL ON TABLE "public"."conversation_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_responses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_responses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_responses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_responses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_themes" TO "anon";
GRANT ALL ON TABLE "public"."conversation_themes" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_themes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_themes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_themes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_themes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."hive_invite_links" TO "anon";
GRANT ALL ON TABLE "public"."hive_invite_links" TO "authenticated";
GRANT ALL ON TABLE "public"."hive_invite_links" TO "service_role";



GRANT ALL ON TABLE "public"."hive_invites" TO "anon";
GRANT ALL ON TABLE "public"."hive_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."hive_invites" TO "service_role";



GRANT ALL ON TABLE "public"."hive_members" TO "anon";
GRANT ALL ON TABLE "public"."hive_members" TO "authenticated";
GRANT ALL ON TABLE "public"."hive_members" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hive_members_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hive_members_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hive_members_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."hives" TO "anon";
GRANT ALL ON TABLE "public"."hives" TO "authenticated";
GRANT ALL ON TABLE "public"."hives" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."quadratic_vote_allocations" TO "anon";
GRANT ALL ON TABLE "public"."quadratic_vote_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."quadratic_vote_allocations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."quadratic_vote_allocations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."quadratic_vote_allocations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."quadratic_vote_allocations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."quadratic_vote_budgets" TO "anon";
GRANT ALL ON TABLE "public"."quadratic_vote_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."quadratic_vote_budgets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."quadratic_vote_budgets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."quadratic_vote_budgets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."quadratic_vote_budgets_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."response_feedback" TO "anon";
GRANT ALL ON TABLE "public"."response_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."response_feedback" TO "service_role";



GRANT ALL ON SEQUENCE "public"."response_feedback_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."response_feedback_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."response_feedback_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."response_likes" TO "anon";
GRANT ALL ON TABLE "public"."response_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."response_likes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."response_likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."response_likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."response_likes_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







