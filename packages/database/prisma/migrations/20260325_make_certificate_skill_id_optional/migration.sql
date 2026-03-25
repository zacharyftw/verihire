-- Make skill_id nullable on certificates (challenges may not have a linked skill)
ALTER TABLE certificates ALTER COLUMN skill_id DROP NOT NULL;
