-- ═══════════════════════════════════════════════════════════════════════════
-- 0043 · REPAIR canonicals_update_creator
--
-- The fault: `using (created_by = auth.uid())` with created_by NULL evaluates
-- to NULL, not true. An unowned row is therefore writable by NOBODY. Nine rows
-- in production have created_by null, all written by server functions that do
-- not sign their work.
--
-- Because saveCanonicals sends the user's ENTIRE library as one upsert, a
-- single unwritable row refuses the whole statement, and every save in it is
-- lost. That is the 403 Dan sees. It has nothing to do with 0041.
--
-- This grants NO new permission: a row owned by another user stays untouchable.
-- It adds `with check` so the policy also constrains the row being written,
-- which the original omitted.
--
-- RUN ONE AT A TIME IN THE SUPABASE SQL EDITOR.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · replace the policy ──────────────────────────────────────────────
-- Postgres has no `create or replace policy`, so this is a drop and a create.
-- Between them, canonicals has NO update policy and every update is refused —
-- which is the state it is effectively in already. Run 2 immediately after 1.
drop policy if exists canonicals_update_creator on public.canonicals;

-- ─── 2 · the repaired policy ─────────────────────────────────────────────
create policy canonicals_update_creator on public.canonicals
  for update
  using (created_by = auth.uid() or created_by is null)
  with check (created_by = auth.uid());

-- ─── 3 · VERIFY · read it back ───────────────────────────────────────────
select policyname, cmd, qual as using_expr, with_check as with_check_expr
  from pg_policies
 where tablename = 'canonicals'
 order by policyname;
