-- Add fssai_number column to fake_reports table
ALTER TABLE public.fake_reports
ADD COLUMN IF NOT EXISTS fssai_number TEXT;

-- Update the applied trigger to factor in the fssai_number
CREATE OR REPLACE FUNCTION public.apply_fake_report_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    
    -- If an FSSAI number is provided in the report, use it to strictly match and reduce trust score
    IF NEW.fssai_number IS NOT NULL AND trim(NEW.fssai_number) != '' THEN
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
      WHERE lower(trim(p.license_number)) = lower(trim(NEW.fssai_number));
    ELSE
      -- Fall back to name and brand/manufacturer matching if FSSAI is not provided
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

  END IF;
  RETURN NEW;
END;
$$;
