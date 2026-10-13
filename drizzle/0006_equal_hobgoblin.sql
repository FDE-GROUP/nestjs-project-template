CREATE TABLE "user_status" (
	"userId" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_status" ADD CONSTRAINT "user_status_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;