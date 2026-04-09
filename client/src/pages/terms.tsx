import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <NavigationHeader />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <ScrollText className="h-8 w-8" />
              Terms and Conditions
            </CardTitle>
            <p className="text-muted-foreground">Last updated: January 9, 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  By accessing and using Neonvideo.ai, you accept and agree to be bound by these Terms and Conditions. 
                  If you do not agree to these terms, please do not use our service.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">2. Service Description</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Neonvideo.ai is an AI-powered platform that enables users to create music videos through a 
                  multi-step process involving music generation, character creation, scene generation, and video 
                  production. The service utilizes various AI technologies to generate content based on user inputs.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    To use our service, you must:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>Create an account with accurate information</li>
                    <li>Be at least 13 years old</li>
                    <li>Maintain the security of your account credentials</li>
                    <li>Be responsible for all activities under your account</li>
                    <li>Notify us immediately of any unauthorized use</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">4. Subscription Plans and Credits</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    Our service operates on a credit-based system:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li><strong>Basic $1 Trial:</strong> 4,000 credits for $1/month</li>
                    <li><strong>Starter Plan:</strong> Monthly credits for regular users</li>
                    <li><strong>Creator Plan:</strong> Enhanced credits for content creators</li>
                    <li><strong>Pro Plan:</strong> Maximum credits for professional use</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    Credits are non-transferable and expire at the end of each billing cycle. Unused credits do not roll over.
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">5. Content Generation and Ownership</h2>
                <div className="space-y-3">
                  <h3 className="text-lg font-medium mb-2">User Input</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    You retain all rights to the prompts, descriptions, and original content you provide to the service.
                  </p>
                  
                  <h3 className="text-lg font-medium mb-2 mt-4">Generated Content</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Content generated using our AI services is subject to the following terms:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>You own the rights to use generated content for personal and commercial purposes</li>
                    <li>Generated content may not be unique and similar results may be produced for other users</li>
                    <li>You are responsible for ensuring generated content doesn't infringe on third-party rights</li>
                    <li>Neonvideo.ai retains the right to use generated content for service improvement and training</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">6. Acceptable Use Policy</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    You agree not to use our service to:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>Generate illegal, harmful, or offensive content</li>
                    <li>Violate intellectual property rights</li>
                    <li>Create deepfakes or misleading content about real persons</li>
                    <li>Harass, abuse, or harm others</li>
                    <li>Attempt to bypass usage limits or security measures</li>
                    <li>Reverse engineer or copy our service</li>
                    <li>Use automated systems or bots without permission</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">7. Intellectual Property</h2>
                <p className="text-muted-foreground leading-relaxed">
                  The Neonvideo.ai platform, including its design, features, and technology, is owned by us and 
                  protected by intellectual property laws. You may not copy, modify, or distribute our platform 
                  without written permission.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">8. Payment Terms</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    For paid subscriptions:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>Payments are processed securely through our payment provider</li>
                    <li>Subscriptions auto-renew unless cancelled</li>
                    <li>Refunds are provided according to our refund policy</li>
                    <li>Prices may change with 30 days notice</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">9. Disclaimers and Limitations</h2>
                <div className="space-y-3">
                  <p className="text-muted-foreground leading-relaxed">
                    Our service is provided "as is" without warranties of any kind. We do not guarantee:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    <li>Uninterrupted or error-free service</li>
                    <li>Specific results from AI generation</li>
                    <li>Fitness for a particular purpose</li>
                    <li>Accuracy or quality of generated content</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    Our liability is limited to the amount you paid for the service in the last 12 months.
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">10. Indemnification</h2>
                <p className="text-muted-foreground leading-relaxed">
                  You agree to indemnify and hold harmless Neonvideo.ai from any claims, damages, or expenses 
                  arising from your use of the service, violation of these terms, or infringement of any rights.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may suspend or terminate your account for violation of these terms. You may cancel your 
                  account at any time. Upon termination, your right to use the service ceases immediately.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">12. Changes to Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We reserve the right to modify these terms at any time. Continued use of the service after 
                  changes constitutes acceptance of the new terms.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">13. Governing Law</h2>
                <p className="text-muted-foreground leading-relaxed">
                  These terms are governed by the laws of the jurisdiction in which Neonvideo.ai operates, 
                  without regard to conflict of law principles.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">14. Contact Information</h2>
                <p className="text-muted-foreground leading-relaxed">
                  For questions about these terms, please contact us at:
                  <br />
                  <strong>Email:</strong> legal@neonvideo.ai
                  <br />
                  <strong>Support:</strong> support@neonvideo.ai
                </p>
              </div>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}