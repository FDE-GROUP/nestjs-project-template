CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "workspaceId" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_org_slug_idx" ON "workspace" USING btree ("organizationId","slug");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_organization_workspace_idx" ON "post" USING btree ("organizationId","workspaceId");