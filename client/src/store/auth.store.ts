import { create } from "zustand";
import {
  fetchSessionUser,
  signInEmail,
  signOutRemote,
  signUpEmail,
  type AuthUser,
} from "../lib/auth.ts";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: async () => {
    set({ user: await fetchSessionUser(), loading: false });
  },

  signIn: async (email, password) => {
    const error = await signInEmail(email, password);
    if (error) return error;
    set({ user: await fetchSessionUser() });
    return null;
  },

  signUp: async (email, password) => {
    const error = await signUpEmail(email, password);
    if (error) return error;
    set({ user: await fetchSessionUser() });
    return null;
  },

  signOut: async () => {
    await signOutRemote();
    set({ user: null });
  },
}));
