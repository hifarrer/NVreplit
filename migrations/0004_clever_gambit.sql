CREATE TABLE "coupon_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"credits" integer NOT NULL,
	"max_uses" integer,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"credits_awarded" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "greeting_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"sender_email" text NOT NULL,
	"sender_name" text,
	"recipient_email" text NOT NULL,
	"message" text,
	"scheduled_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"unique_token" text NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "greeting_cards_unique_token_unique" UNIQUE("unique_token")
);
--> statement-breakpoint
ALTER TABLE "postiz_posts" ADD COLUMN "posted_reddit" timestamp;--> statement-breakpoint
ALTER TABLE "postiz_posts" ADD COLUMN "reddit_post_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "aspect_ratio" text DEFAULT '3:4';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "video_quality" text DEFAULT 'quick';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "scene_lipsync_settings" jsonb;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupon_codes_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greeting_cards" ADD CONSTRAINT "greeting_cards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_user_unique" ON "coupon_redemptions" USING btree ("coupon_id","user_id");