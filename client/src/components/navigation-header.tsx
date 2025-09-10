import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home as HomeIcon, Music, Video, User, LogOut, Menu, ChevronDown, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import logoImage from "@assets/neonlogo_1756693683433.png";

interface NavigationHeaderProps {
  currentPage?: "home" | "songs" | "videos" | "characters" | "plans" | "profile";
}

export function NavigationHeader({ currentPage }: NavigationHeaderProps) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Create", icon: <HomeIcon className="h-4 w-4" />, page: "home" },
    { href: "/my-songs", label: "Songs", icon: <Music className="h-4 w-4" />, page: "songs" },
    { href: "/my-videos", label: "Videos", icon: <Video className="h-4 w-4" />, page: "videos" },
    { href: "/characters", label: "Characters", icon: <User className="h-4 w-4" />, page: "characters" },
    { href: "/plans", label: "Plans", icon: <i className="fas fa-crown h-4 w-4"></i>, page: "plans" },
  ];

  const handleNavClick = (href: string) => {
    navigate(href);
    setMobileMenuOpen(false);
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Desktop Navigation */}
          <div className="flex items-center space-x-4">
            <Link href="/">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-12 sm:h-16 cursor-pointer" 
                data-testid="app-logo"
              />
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-2 xl:space-x-4">
              {navItems.map((item) => (
                <Link key={item.page} href={item.href}>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled={currentPage === item.page}
                    className={currentPage === item.page ? "text-foreground" : "text-muted-foreground hover:text-foreground"}
                  >
                    <span className="mr-1">{item.icon}</span>
                    {item.label}
                  </Button>
                </Link>
              ))}
            </nav>
          </div>
          
          {/* Desktop User Section */}
          <div className="hidden lg:flex items-center space-x-4">
            {user ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 p-1">
                      <Avatar className="h-6 w-6">
                        {user.avatarUrl ? (
                          <AvatarImage src={user.avatarUrl} alt={user.username} />
                        ) : (
                          <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-secondary/20">
                            {user.username?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="text-sm">{user.username}</span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <Link href="/profile">
                      <DropdownMenuItem className="cursor-pointer">
                        <User className="h-4 w-4 mr-2" />
                        Profile
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/contact">
                      <DropdownMenuItem className="cursor-pointer" data-testid="link-support">
                        <HelpCircle className="h-4 w-4 mr-2" />
                        Support
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem 
                      onClick={logout}
                      className="cursor-pointer text-red-500 focus:text-red-500"
                      data-testid="button-logout"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Link href="/auth">
                <Button size="sm">Sign In</Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="sm" className="px-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[350px]">
              <div className="flex flex-col h-full">
                {/* Mobile Menu Header */}
                <div className="flex items-center justify-between mb-6">
                  <img 
                    src={logoImage} 
                    alt="neonvideo.ai" 
                    className="h-10" 
                  />
                </div>

                {/* Mobile Navigation */}
                <nav className="flex flex-col space-y-2 flex-1">
                  {navItems.map((item) => (
                    <Button
                      key={item.page}
                      variant={currentPage === item.page ? "secondary" : "ghost"}
                      className="justify-start w-full"
                      onClick={() => handleNavClick(item.href)}
                    >
                      <span className="mr-3">{item.icon}</span>
                      {item.label}
                    </Button>
                  ))}
                </nav>

                {/* Mobile User Section */}
                <div className="border-t pt-4 mt-4">
                  {user ? (
                    <div className="space-y-3">
                      <Button
                        variant="ghost"
                        className="justify-start w-full"
                        onClick={() => handleNavClick("/profile")}
                      >
                        <Avatar className="h-6 w-6 mr-3">
                          {user.avatarUrl ? (
                            <AvatarImage src={user.avatarUrl} alt={user.username} />
                          ) : (
                            <AvatarFallback className="text-xs">
                              {user.username?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        {user.username}
                      </Button>
                      <Button
                        variant="ghost"
                        className="justify-start w-full"
                        onClick={() => handleNavClick("/contact")}
                        data-testid="link-support-mobile"
                      >
                        <HelpCircle className="h-4 w-4 mr-3" />
                        Support
                      </Button>
                      <Button
                        variant="ghost"
                        className="justify-start w-full text-red-500 hover:text-red-600"
                        onClick={() => {
                          logout();
                          setMobileMenuOpen(false);
                        }}
                      >
                        <LogOut className="h-4 w-4 mr-3" />
                        Logout
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => handleNavClick("/auth")}
                    >
                      Sign In
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}