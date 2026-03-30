-- Remove duplicate products, keeping only the most recently updated one
DELETE FROM public.products p1
USING public.products p2
WHERE p1.license_number = p2.license_number
  AND p1.name = p2.name
  AND p1.id > p2.id; -- Delete if there is another row with a smaller UUID (or just updated_at)

-- More accurate duplicate deletion using CTE
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY license_number, name ORDER BY updated_at DESC) as row_num
  FROM public.products
  WHERE license_number IS NOT NULL
)
DELETE FROM public.products
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- Add unique constraint to prevent duplicate products
ALTER TABLE public.products
ADD CONSTRAINT products_license_name_key UNIQUE (license_number, name);

-- Prevent spam reports: A user cannot report the exact same product twice
WITH report_duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY reporter_id, fssai_number, product_name ORDER BY created_at DESC) as row_num
  FROM public.fake_reports
  WHERE reporter_id IS NOT NULL
)
DELETE FROM public.fake_reports
WHERE id IN (
  SELECT id FROM report_duplicates WHERE row_num > 1
);

ALTER TABLE public.fake_reports
ADD CONSTRAINT fake_reports_spam_key UNIQUE NULLS NOT DISTINCT (reporter_id, fssai_number, product_name);
