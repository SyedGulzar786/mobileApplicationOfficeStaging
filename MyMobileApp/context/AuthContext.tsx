import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';

type DecodedToken = {
  userId: string;
  name: string;
  email: string;
  exp: number;
};

type AuthContextType = {
  token: string | null;
  user: DecodedToken | null;
  isLoggedIn: boolean;
  isAuthReady: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  isLoggedIn: false,
  isAuthReady: false,
  login: async () => {},
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<DecodedToken | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const loadToken = async () => {
      try {
        const stored = await AsyncStorage.getItem('token');
        if (stored) {
          const decoded: DecodedToken = jwtDecode(stored);
          setToken(stored);
          setUser(decoded);
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error('Error loading or decoding token:', error);
        await AsyncStorage.removeItem('token'); // Remove invalid token
      } finally {
        setIsAuthReady(true);
      }
    };
    loadToken();
  }, []);

  const login = async (newToken: string) => {
    try {
      const decoded: DecodedToken = jwtDecode(newToken);
      await AsyncStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(decoded);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('Invalid token at login:', error);
    } finally {
      setIsAuthReady(true);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setIsLoggedIn(false);
    setIsAuthReady(true);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoggedIn, isAuthReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
