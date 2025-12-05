CREATE TABLE "gift_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchaser_user_id" varchar NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"personal_message" text,
	"plan_id" varchar NOT NULL,
	"billing_period" text NOT NULL,
	"amount" integer NOT NULL,
	"redemption_code" text NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_session_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"redeemed_by_user_id" varchar,
	"redeemed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gift_subscriptions_redemption_code_unique" UNIQUE("redemption_code")
);
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "monthly_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_public" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "scene_order" jsonb;--> statement-breakpoint
ALTER TABLE "gift_subscriptions" ADD CONSTRAINT "gift_subscriptions_purchaser_user_id_users_id_fk" FOREIGN KEY ("purchaser_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_subscriptions" ADD CONSTRAINT "gift_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_subscriptions" ADD CONSTRAINT "gift_subscriptions_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;