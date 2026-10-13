ALTER TABLE "post" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_organization_created_idx" ON "post" USING btree ("organizationId","createdAt");