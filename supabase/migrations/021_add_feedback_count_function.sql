-- Migration: Add get_feedback_counts function for O(1) feedback aggregation
-- This replaces the N+1 pattern of fetching all rows and counting in JS

CREATE OR REPLACE FUNCTION public.get_feedback_counts(p_response_id BIGINT)
RETURNS TABLE(agree INT, pass INT, disagree INT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE feedback = 'agree')::INT as agree,
    COUNT(*) FILTER (WHERE feedback = 'pass')::INT as pass,
    COUNT(*) FILTER (WHERE feedback = 'disagree')::INT as disagree
  FROM public.response_feedback
  WHERE response_id = p_response_id;
$$;

COMMENT ON FUNCTION public.get_feedback_counts(BIGINT) IS
  'Efficiently aggregates feedback counts for a response using SQL COUNT with FILTER.
   Returns agree, pass, disagree counts in a single row.
   O(index scan) vs O(n) row transfer.';

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_feedback_counts(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feedback_counts(BIGINT) TO service_role;
