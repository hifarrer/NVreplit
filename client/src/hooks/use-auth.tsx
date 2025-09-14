import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { User, Plan } from '@shared/schema';

// Extended user type that includes credit and plan information from API
interface AuthUser extends User {
  creditsRemaining?: number;
  plan?: {
    id: string;
    name: string;
    credits: number;
    features: string[];
    monthlyPrice: number;
    yearlyPrice: number;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<{ message?: string; email?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUserAndToken: (user: AuthUser, token: string) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on app load
    const savedToken = localStorage.getItem('auth_token');
    if (savedToken) {
      setToken(savedToken);
      // Verify token and get user info
      verifyToken(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async (authToken: string) => {
    try {
      const response = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('Fetched user data:', userData); // Debug log
        setUser(userData);
        setToken(authToken);
      } else {
        // Token is invalid, remove it
        localStorage.removeItem('auth_token');
        setToken(null);
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      localStorage.removeItem('auth_token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const response = await apiRequest('POST', '/api/login', {
      username,
      password
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('auth_token', data.token);
    
    // CRITICAL FIX: Refresh user data to get complete credits/plan info after login
    // This ensures the user has complete data including credits/plan immediately
    try {
      await verifyToken(data.token);
    } catch (error) {
      console.error('Failed to refresh user data after login:', error);
      // Don't throw - login was successful, just refresh failed
    }
  };

  const register = async (username: string, email: string, password: string) => {
    const response = await apiRequest('POST', '/api/register', {
      username,
      email,
      password
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    
    // New flow: if message is present, email verification is required
    if (data.message) {
      return { message: data.message, email: data.email };
    }
    
    // Legacy flow: direct login (for Google OAuth or if verification is disabled)
    if (data.user && data.token) {
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('auth_token', data.token);
    }
    
    return data;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
  };

  const refreshUser = async () => {
    if (token) {
      await verifyToken(token);
    }
  };

  const setUserAndToken = (userData: AuthUser, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('auth_token', authToken);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      register,
      logout,
      refreshUser,
      setUserAndToken,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}