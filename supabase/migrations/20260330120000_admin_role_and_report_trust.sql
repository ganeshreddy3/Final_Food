-- Assign admin role on signup for the designated admin email (app UI checks this email too).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = lower('21054cs051@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant admin role to existing account (if user signed up before this fix).
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(coalesce(email, '')) = lower('21054cs051@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- When an admin confirms a fake report, lower trust on matching products (name + manufacturer vs brand).
CREATE OR REPLACE FUNCTION public.apply_fake_report_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed'
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.products p
    SET
      trust_score = GREATEST(0, LEAST(100, COALESCE(p.trust_score, 50) - 10)),
      report_count = COALESCE(p.report_count, 0) + 1,
      status = CASE
        WHEN GREATEST(0, LEAST(100, COALESCE(p.trust_score, 50) - 10)) < 40 THEN 'fake'::text
        WHEN GREATEST(0, LEAST(100, COALESCE(p.trust_score, 50) - 10)) < 60 THEN 'suspicious'::text
        ELSE p.status
      END,
      updated_at = now()
    WHERE lower(trim(p.name)) = lower(trim(NEW.product_name))
      AND lower(trim(p.manufacturer)) = lower(trim(NEW.brand_name));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fake_report_confirmed_trust ON public.fake_reports;

CREATE TRIGGER fake_report_confirmed_trust
  AFTER UPDATE OF status ON public.fake_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_fake_report_confirmation();

-- Allow visitors to submit reports without logging in (reporter_id may be null).
CREATE POLICY "Anon can create fake reports"
  ON public.fake_reports FOR INSERT TO anon
  WITH CHECK (true);
