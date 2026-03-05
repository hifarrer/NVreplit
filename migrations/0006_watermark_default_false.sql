-- Default watermark to false for new projects (e.g. public API create video)
ALTER TABLE "projects" ALTER COLUMN "include_watermark" SET DEFAULT false;
