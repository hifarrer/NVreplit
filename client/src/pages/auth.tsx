import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Loader2, Music, Video, Sparkles } from 'lucide-react';
import { FaGoogle } from 'react-icons/fa';
import { useLocation } from 'wouter';
import logoImage from "@assets/neonlogo_1756693683433.png";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { login, register, user, setUserAndToken, setTokenOnly, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isGmailEmail, setIsGmailEmail] = useState(false);
  const [emailWarning, setEmailWarning] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const handleGoogleLogin = () => {
    // Preserve affiliate code during OAuth flow
    if (referralCode) {
      localStorage.setItem('pending_affiliate_code', referralCode);
    }
    
    // Preserve redirect URL during OAuth flow
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect');
    if (redirectUrl) {
      localStorage.setItem('pending_redirect_url', redirectUrl);
    }
    
    window.location.href = '/api/auth/google';
  };

  // Handle OAuth callback and capture referral code
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const userParam = urlParams.get('user');
    const oauthError = urlParams.get('error');
    const affCode = urlParams.get('aff');
    
    // Capture affiliate code from URL
    if (affCode) {
      setReferralCode(affCode);
    }

    if (oauthError) {
      setError('Google login failed. Please try again.');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (token && userParam) {
      try {
        // Set the token in auth context so user appears logged in
        setTokenOnly(token);
        
        // CRITICAL FIX: Handle affiliate code after OAuth login
        const storedAffiliateCode = localStorage.getItem('pending_affiliate_code');
        if (storedAffiliateCode) {
          // Process affiliate code for OAuth user
          fetch('/api/process-oauth-affiliate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ affiliateCode: storedAffiliateCode })
          }).then(response => {
            if (!response.ok) {
              console.error('Failed to process OAuth affiliate code');
            }
          }).catch(error => {
            console.error('Error processing OAuth affiliate code:', error);
          }).finally(() => {
            // Clean up stored affiliate code
            localStorage.removeItem('pending_affiliate_code');
          });
        }
        
        // CRITICAL FIX: Load full user data with credits/plan BEFORE navigation
        refreshUser(token).then(() => {
          // Check for pending redirect URL from OAuth flow
          const pendingRedirect = localStorage.getItem('pending_redirect_url');
          if (pendingRedirect) {
            localStorage.removeItem('pending_redirect_url');
            window.location.href = pendingRedirect;
          } else {
            setLocation('/'); // Navigate only after full user data is loaded
          }
        }).catch((err) => {
          console.error('Failed to load user data after OAuth:', err);
          setError('Failed to load user data. Please try again.');
        });
      } catch (err) {
        setError('Failed to process Google login. Please try again.');
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setLocation, setUserAndToken, setTokenOnly, refreshUser]);

  // Handle automatic redirect when user becomes logged in
  useEffect(() => {
    if (user) {
      // Check for redirect parameter in URL
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect');
      
      // Also check localStorage for pending redirect (from Google OAuth or other flows)
      const pendingRedirect = localStorage.getItem('pending_redirect_url');
      
      if (redirectUrl) {
        // Redirect to the specified URL (e.g., OAuth authorization page)
        window.location.href = redirectUrl;
      } else if (pendingRedirect) {
        // Use the pending redirect from localStorage
        localStorage.removeItem('pending_redirect_url');
        window.location.href = pendingRedirect;
      } else {
        // Default to create page
        setLocation('/create');
      }
    }
  }, [user, setLocation]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage(''); // Clear success message when switching forms

    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    try {
      await login(username, password);
      // Redirect is now handled by the useEffect when user state changes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const gmailDomains = ['gmail.com', 'googlemail.com'];

  const knownPublicDomains = new Set([
    ...gmailDomains,
    'hotmail.com', 'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk', 'msn.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
    'aol.com',
    'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'zoho.com', 'zohomail.com',
    'mail.com', 'email.com',
    'gmx.com', 'gmx.net',
    'yandex.com', 'yandex.ru',
    'tutanota.com', 'tuta.com',
    'fastmail.com',
    'hey.com',
    'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net',
    'cox.net', 'charter.net', 'earthlink.net', 'juno.com', 'netzero.com',
  ]);

  const checkGmailEmail = (emailValue: string) => {
    const domain = emailValue.toLowerCase().split('@')[1];
    return gmailDomains.includes(domain);
  };

  const checkSubdomainEmail = (emailValue: string) => {
    const domain = emailValue.toLowerCase().split('@')[1];
    if (!domain) return false;
    if (knownPublicDomains.has(domain)) return false;
    return domain.split('.').length > 2;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const emailValue = e.target.value;
    setEmail(emailValue);
    setIsGmailEmail(checkGmailEmail(emailValue));

    if (emailValue.includes('@')) {
      if (checkSubdomainEmail(emailValue)) {
        setEmailWarning('Please use your main email address (e.g., user@domain.com). Subdomain emails are not allowed.');
      } else {
        setEmailWarning('');
      }
    } else {
      setEmailWarning('');
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage(''); // Clear success message on new registration attempt

    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    // Block subdomain emails
    if (checkSubdomainEmail(email)) {
      setError('Please use your main email address (e.g., user@domain.com). Subdomain emails are not allowed.');
      setIsLoading(false);
      return;
    }

    // Block Gmail registration 
    if (checkGmailEmail(email)) {
      setError('Gmail accounts must use Google Login. Please use the "Continue with Google" button.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await register(username, email, password, referralCode);
      // For non-Gmail accounts, show success message instead of redirecting
      if (response && response.message) {
        setError(''); // Clear any previous errors
        setEmail(''); // Clear the form
        // Show success message - the user now needs to check their email
        setSuccessMessage(`Registration successful! ${response.message} Please check your email and click the verification link before logging in.`);
      } else {
        // Fallback - this should not happen with the new flow for regular registration
        setLocation('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" data-testid="auth-page">
      {/* Left side - Forms (appears first/on top on mobile) */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 order-1">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 sm:mb-8">
            <div className="mb-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-32 sm:h-48 mx-auto" 
                data-testid="app-logo"
              />
            </div>
            <p className="text-muted-foreground">
              Create stunning music videos with AI
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full" onValueChange={() => { setError(''); setSuccessMessage(''); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Sign Up</TabsTrigger>
            </TabsList>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription data-testid="error-message">{error}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert className="mt-4 border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800" data-testid="success-message">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Enter your credentials to access your projects
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-username">Username or Email</Label>
                      <Input
                        id="login-username"
                        name="username"
                        type="text"
                        placeholder="Enter your username or email"
                        required
                        disabled={isLoading}
                        data-testid="input-login-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        name="password"
                        type="password"
                        placeholder="Enter your password"
                        required
                        disabled={isLoading}
                        data-testid="input-login-password"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600"
                      disabled={isLoading}
                      data-testid="button-login"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </Button>
                    
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      data-testid="button-google-login"
                    >
                      <FaGoogle className="mr-2 h-4 w-4" />
                      Continue with Google
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Create account</CardTitle>
                  <CardDescription>
                    Join thousands creating amazing music videos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-username">Username</Label>
                      <Input
                        id="register-username"
                        name="username"
                        type="text"
                        placeholder="Choose a username"
                        required
                        disabled={isLoading}
                        data-testid="input-register-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        name="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={handleEmailChange}
                        required
                        disabled={isLoading}
                        data-testid="input-register-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        name="password"
                        type="password"
                        placeholder="Create a password"
                        required
                        disabled={isLoading}
                        data-testid="input-register-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-confirm-password">Confirm Password</Label>
                      <Input
                        id="register-confirm-password"
                        name="confirmPassword"
                        type="password"
                        placeholder="Confirm your password"
                        required
                        disabled={isLoading}
                        data-testid="input-register-confirm-password"
                      />
                    </div>
                    
                    {emailWarning && !isGmailEmail && (
                      <Alert variant="destructive" className="bg-orange-50 border-orange-200">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-orange-800">
                          {emailWarning}
                        </AlertDescription>
                      </Alert>
                    )}

                    {isGmailEmail && email && (
                      <Alert variant="destructive" className="bg-yellow-50 border-yellow-200">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-yellow-800">
                          Gmail accounts must use Google Login. Please use the "Continue with Google" button below.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600"
                      disabled={isLoading || (isGmailEmail && email.trim() !== "") || !!emailWarning}
                      data-testid="button-register"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        'Create Account'
                      )}
                    </Button>
                    
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      data-testid="button-google-register"
                    >
                      <FaGoogle className="mr-2 h-4 w-4" />
                      Continue with Google
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right side - Hero section (appears second/below on mobile) */}
      <div className="flex-1 bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 flex items-center justify-center p-4 sm:p-8 order-2">
        <div className="text-center text-white max-w-md">
          <div className="mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center space-x-2 mb-4">
              <Music className="h-6 w-6 sm:h-8 sm:w-8" />
              <Video className="h-6 w-6 sm:h-8 sm:w-8" />
              <Sparkles className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4">
              Create Magic with AI
            </h2>
            <p className="text-base sm:text-lg text-white/90 mb-4 sm:mb-6">
              Transform your ideas into stunning music videos using cutting-edge AI technology
            </p>
          </div>

          <div className="space-y-3 sm:space-y-4 text-left text-sm sm:text-base">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 rounded-full bg-white"></div>
              <span>Generate music from text prompts</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 rounded-full bg-white"></div>
              <span>Create AI characters and scenes</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 rounded-full bg-white"></div>
              <span>Professional video production</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 rounded-full bg-white"></div>
              <span>Download high-quality results</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}