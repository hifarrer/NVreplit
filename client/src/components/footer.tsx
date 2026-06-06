import { Link } from "wouter";
import { SiTiktok, SiFacebook, SiYoutube } from "react-icons/si";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 backdrop-blur-sm mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              © 2025 Neonvideo.ai. All rights reserved.
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://www.tiktok.com/@neonvideoai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-tiktok"
                aria-label="TikTok"
              >
                <SiTiktok className="w-5 h-5" />
              </a>
              <a
                href="https://www.facebook.com/neonvideoai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-facebook"
                aria-label="Facebook"
              >
                <SiFacebook className="w-5 h-5" />
              </a>
              <a
                href="https://www.youtube.com/@NeonVideoAI"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-youtube"
                aria-label="YouTube"
              >
                <SiYoutube className="w-5 h-5" />
              </a>
            </div>
          </div>
          <nav className="flex items-center gap-4 sm:gap-6">
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-blog">
              Blog
            </Link>
            <Link href="/news" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-news">
              News
            </Link>
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Terms & Conditions
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
