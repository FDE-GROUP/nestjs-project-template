CREATE TABLE "tenant_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"seatsLimit" integer NOT NULL,
	"storageQuota" integer,
	"apiQuota" integer,
	"periodStart" timestamp DEFAULT now() NOT NULL,
	"periodEnd" timestamp,
	"provider" text,
	"providerCustomerId" text,
	"providerSubscriptionId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_subscription" ADD CONSTRAINT "tenant_subscription_tenantId_organization_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_subscription_tenant_status_idx" ON "tenant_subscription" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "tenant_subscription_tenant_period_idx" ON "tenant_subscription" USING btree ("tenantId","periodStart");