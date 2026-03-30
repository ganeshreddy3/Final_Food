-- Allow the designated admin account (JWT email) to manage data even if user_roles is missing/out of sync.
-- Complements has_role(...) policies: any matching policy allows the operation (RLS is OR for permissive).

CREATE POLICY "Designated admin email inserts products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'));

CREATE POLICY "Designated admin email updates products"
  ON public.products FOR UPDATE TO authenticated
  USING (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'))
  WITH CHECK (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'));

CREATE POLICY "Designated admin email deletes products"
  ON public.products FOR DELETE TO authenticated
  USING (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'));

CREATE POLICY "Designated admin email manages fssai licenses"
  ON public.fssai_licenses FOR ALL TO authenticated
  USING (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'))
  WITH CHECK (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'));

CREATE POLICY "Designated admin email manages blacklist"
  ON public.blacklisted_brands FOR ALL TO authenticated
  USING (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'))
  WITH CHECK (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'));

CREATE POLICY "Designated admin email updates fake reports"
  ON public.fake_reports FOR UPDATE TO authenticated
  USING (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'))
  WITH CHECK (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'));

CREATE POLICY "Designated admin email deletes fake reports"
  ON public.fake_reports FOR DELETE TO authenticated
  USING (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('21054cs051@gmail.com'));
