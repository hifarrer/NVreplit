import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <NavigationHeader />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Shield className="h-8 w-8" />
              Privacy Policy
            </CardTitle>
            <p className="text-muted-foreground">Last updated: January 9, 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Welcome to Neonvideo.ai. We respect your privacy and are committed to protecting your personal data. 
                  This privacy policy explains how we collect, use, and safeguard your information when you use our 
                  AI-powered music video creation service.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2">Account Information</h3>
                    <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                      <li>Username and email address</li>
                      <li>Profile information and avatar</li>
                      <li>Account preferences and settings</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium mb-2">Content Data</h3>
                    <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                      <li>Generated songs, lyrics, and audio files</li>
                      <li>Character images and prompts</li>
                      <li>Video scenes and final music videos</li>
                      <li>Project metadata and creation history</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium mb-2">Usage Data</h3>
                    <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                      <li>Service usage patterns and preferences</li>
                      <li>Feature interactions and generation requests</li>
                      <li>Technical information about your device and browser</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  We use your information to:
                </p>
                <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                  <li>Provide and maintain our music video generation service</li>
                  <li>Process your AI generation requests</li>
                  <li>Store and manage your created content</li>
                  <li>Improve our AI models and service quality</li>
                  <li>Communicate with you about your account and service updates</li>
                  <li>Ensure security and prevent abuse</li>
                </ul>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">4. Data Storage and Security</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Your data is stored securely using industry-standard encryption. Generated content is stored in 
                  secure cloud storage with access controls. We implement appropriate technical and organizational 
                  measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">5. Third-Party Services</h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  We use the following third-party AI services to power our features:
                </p>
                <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                  <li><strong>OpenAI:</strong> For lyrics and scene prompt generation</li>
                  <li><strong>ElevenLabs:</strong> For AI music generation</li>
                  <li><strong>Fal.ai:</strong> For image generation</li>
                  <li><strong>Wavespeed:</strong> For video generation</li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-3">
                  These services process data according to their respective privacy policies. We only share the 
                  minimum necessary data required for generation.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  You have the right to:
                </p>
                <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                  <li>Access your personal data</li>
                  <li>Correct inaccurate data</li>
                  <li>Delete your account and associated data</li>
                  <li>Export your created content</li>
                  <li>Opt-out of non-essential communications</li>
                </ul>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">7. Data Retention</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We retain your account data for as long as your account is active. Generated content is retained 
                  until you choose to delete it. After account deletion, we may retain certain data for legal 
                  compliance and abuse prevention for up to 90 days.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">8. Children's Privacy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Neonvideo.ai is not intended for users under 13 years of age. We do not knowingly collect 
                  personal information from children under 13.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may update this privacy policy from time to time. We will notify you of any changes by 
                  posting the new policy on this page and updating the "Last updated" date.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you have questions about this privacy policy or our data practices, please contact us at:
                  <br />
                  <strong>Email:</strong> privacy@neonvideo.ai
                  <br />
                  <strong>Address:</strong> Neonvideo.ai, Data Protection Officer
                </p>
              </div>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}