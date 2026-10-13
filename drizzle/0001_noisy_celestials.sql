CREATE TABLE "consent" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"purpose" text NOT NULL,
	"version" text NOT NULL,
	"grantedAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp,
	"evidence" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_user_purpose_idx" ON "consent" USING btree ("userId","purpose");