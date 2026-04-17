-- Fix Supabase linter warning 0011 (function_search_path_mutable).
-- SECURITY DEFINER functions must pin search_path to prevent search-path
-- based privilege escalation via malicious schemas.

alter function public.enforce_single_default_pipeline()
  set search_path = public, pg_temp;

alter function public.handle_new_user()
  set search_path = public, pg_temp;

alter function public.update_lead_score(uuid, integer, text)
  set search_path = public, pg_temp;

alter function public.update_campaign_counters()
  set search_path = public, pg_temp;
