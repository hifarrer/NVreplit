import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCcw } from "lucide-react";

export default function RefundsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <NavigationHeader />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <RefreshCcw className="h-8 w-8" />
              Refund Terms
            </CardTitle>
            <p className="text-muted-foreground">Last updated: June 9, 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
                <p className="text-muted-foreground leading-relaxed">
                  These Refund Terms explain how refunds, cancellations, and billing disputes are handled for
                  Neonvideo.ai subscriptions, trials, credit purchases, and other paid services. By purchasing a paid
                  plan or credits, you agree to these terms.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">2. Subscription Cancellations</h2>
                <p className="text-muted-foreground leading-relaxed">
                  You may cancel your subscription at any time from your account settings or by contacting support.
                  Cancellation stops future renewals, but it does not automatically refund charges that have already
                  been processed. After cancellation, you may continue to access your paid plan benefits until the end
                  of the current billing period, unless otherwise stated at the time of cancellation.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">3. Refund Eligibility</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    Refunds may be considered in the following situations:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>You were charged after canceling and can provide evidence of the cancellation request.</li>
                    <li>A duplicate charge was made for the same billing period or purchase.</li>
                    <li>A payment was processed because of a billing or technical error on our side.</li>
                    <li>The paid service was unavailable for an extended period due to an issue controlled by us.</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">4. Non-Refundable Items</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    The following charges are generally non-refundable:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>Subscription fees for billing periods that have already started.</li>
                    <li>Used credits, generated videos, generated songs, generated images, or completed AI jobs.</li>
                    <li>One-time credit purchases after credits have been used.</li>
                    <li>Charges caused by forgetting to cancel before renewal.</li>
                    <li>Refund requests based only on dissatisfaction with subjective AI output quality.</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">5. Trials and Promotional Pricing</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Trial offers and promotional plans are billed according to the price and renewal terms shown at
                  checkout. Unless the offer states otherwise, trial and promotional charges are non-refundable once
                  processed. You are responsible for canceling before the renewal date if you do not want the plan to
                  continue.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">6. AI Generation Credits</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Neonvideo.ai uses credits to process AI generation requests. Credits may be consumed when a request is
                  submitted, processed, or completed depending on the feature. Because AI generation uses third-party
                  processing resources, credits used for completed or partially completed generation jobs are generally
                  not refundable.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">7. How to Request a Refund</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    To request a refund, contact us within 14 days of the charge and include:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>The email address associated with your Neonvideo.ai account.</li>
                    <li>The date and amount of the charge.</li>
                    <li>A short explanation of why you are requesting a refund.</li>
                    <li>Any relevant receipt, invoice, or Stripe payment information.</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">8. Review and Processing Time</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We review refund requests case by case. If approved, refunds are issued to the original payment
                  method through our payment processor. Refunds may take several business days to appear on your bank
                  or card statement after they are processed.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">9. Chargebacks and Billing Disputes</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you believe a charge is incorrect, please contact us before opening a chargeback so we can review
                  the issue. Accounts associated with unresolved chargebacks, payment reversals, or fraudulent payment
                  activity may be restricted or suspended.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">10. Changes to These Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may update these Refund Terms from time to time. The updated version will be posted on this page
                  with a revised "Last updated" date. Continued use of Neonvideo.ai after changes are posted means you
                  accept the updated terms.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">11. Contact Information</h2>
                <p className="text-muted-foreground leading-relaxed">
                  For refund requests or billing questions, please contact us at:
                  <br />
                  <strong>Email:</strong> support@neonvideo.ai
                  <br />
                  <strong>Legal:</strong> legal@neonvideo.ai
                </p>
              </div>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
