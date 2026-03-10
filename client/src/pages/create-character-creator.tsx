import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { StandaloneCharacterCreator } from "@/components/standalone-character-creator";
import { ChevronLeft } from "lucide-react";

export default function CreateCharacterCreatorPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />

      <main className="flex-1 container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <Button
            variant="ghost"
            className="mb-6 -ml-2"
            onClick={() => navigate("/create")}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Create
          </Button>

          <StandaloneCharacterCreator
            isOpen={true}
            onClose={() => navigate("/create")}
            onCharacterGenerated={() => {}}
            asPage={true}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
