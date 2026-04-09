import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isFreePlanUser } from "@/lib/plan-utils";

type UserLike = { plan?: { name?: string | null } | null } | null | undefined;

const upgradeHref = "/plans?trial=1";

/** Paragraph-style upsell when Free plan user lacks credits (video flows). */
export function FreePlanVideoUpsellParagraph({
  user,
  className = "text-center text-sm text-muted-foreground mt-3",
}: {
  user: UserLike;
  className?: string;
}) {
  if (!isFreePlanUser(user)) return null;
  return (
    <p className={className}>
      Try this video model for just $1,{" "}
      <Link href={upgradeHref} className="text-primary font-medium hover:underline">
        click here to upgrade
      </Link>
      .
    </p>
  );
}

/** Alert-style upsell when Free plan user lacks credits (lyric / instrumental / etc.). */
export function FreePlanVideoUpsellAlert({
  user,
  className,
}: {
  user: UserLike;
  className?: string;
}) {
  if (!isFreePlanUser(user)) return null;
  return (
    <Alert className={className}>
      <AlertTitle>Upgrade to create videos</AlertTitle>
      <AlertDescription className="text-foreground">
        Try this video model for just $1,{" "}
        <Link href={upgradeHref} className="text-primary font-medium hover:underline">
          click here to upgrade
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}
