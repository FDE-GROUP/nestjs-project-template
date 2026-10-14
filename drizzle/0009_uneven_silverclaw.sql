CREATE TABLE "event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"eventId" text NOT NULL,
	"aggregateId" text NOT NULL,
	"aggregateType" text NOT NULL,
	"version" integer NOT NULL,
	"eventType" text NOT NULL,
	"eventVersion" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb,
	"occurredAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_aggregate_version_key" UNIQUE("aggregateType","aggregateId","version"),
	CONSTRAINT "event_event_id_key" UNIQUE("eventId")
);
--> statement-breakpoint
CREATE INDEX "event_aggregate_idx" ON "event" USING btree ("aggregateType","aggregateId");