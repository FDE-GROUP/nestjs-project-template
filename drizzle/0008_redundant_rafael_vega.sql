-- S2/S3 NOT-NULL tightening: remove legacy orphan rows (pre-S2 seed) that have no tenant,
-- then enforce the constraint. All writes via DrizzlePostRepository always stamp organizationId.
DELETE FROM post WHERE "organizationId" IS NULL;
ALTER TABLE "post" ALTER COLUMN "organizationId" SET NOT NULL;