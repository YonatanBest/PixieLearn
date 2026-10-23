import { apiRequest } from "../../lib/api/client";
import { appConfig } from "../../lib/config";
import type { AuthService, AuthUser, LoginCredentials, SignupCredentials } from "./types";

type BetterAuthResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  session?: {
    id: string;
    expiresAt: string;
  };
};

const MOCK_SESSION_KEY = "pixielearn.demo-user";

function mapUser(user: BetterAuthResponse["user"]): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    ...(user.image ? { avatarUrl: user.image } : {}),
  };
}

const demoUser: AuthUser = {
  id: "demo-user",
  name: "Alex Morgan",
  email: "alex@example.com",
};

class HttpAuthService implements AuthService {
  async getSession() {
    const response = await apiRequest<BetterAuthResponse | null>("/auth/get-session");
    return response?.user ? mapUser(response.user) : null;
  }

  async login(credentials: LoginCredentials) {
    const response = await apiRequest<BetterAuthResponse>("/auth/sign-in/email", {
      method: "POST",
      body: {
        email: credentials.email,
        password: credentials.password,
        rememberMe: credentials.remember,
      },
    });
    return mapUser(response.user);
  }

  async signup(credentials: SignupCredentials) {
    const response = await apiRequest<BetterAuthResponse>("/auth/sign-up/email", {
      method: "POST",
      body: credentials,
    });
    return mapUser(response.user);
  }

  async updateAvatar(image: string | null) {
    await apiRequest<unknown>("/auth/update-user", {
      method: "POST",
      body: { image },
    });
    const updatedUser = await this.getSession();
    if (!updatedUser) throw new Error("Your session ended while updating your profile picture. Sign in and try again.");
    return updatedUser;
  }

  async loginWithGoogle() {
    const response = await apiRequest<{ url?: string; redirect?: boolean; user?: BetterAuthResponse["user"] }>("/auth/sign-in/social", {
      method: "POST",
      body: {
        provider: "google",
        callbackURL: window.location.origin,
      },
    });
    if (response.url) window.location.assign(response.url);
    return response.user ? mapUser(response.user) : null;
  }

  async requestPasswordReset(email: string) {
    await apiRequest<void>("/auth/request-password-reset", {
      method: "POST",
      body: {
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    });
  }

  async logout() {
    await apiRequest<void>("/auth/sign-out", { method: "POST" });
  }
}

class MockAuthService implements AuthService {
  async getSession() {
    const storedUser = sessionStorage.getItem(MOCK_SESSION_KEY);
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      sessionStorage.removeItem(MOCK_SESSION_KEY);
      return null;
    }
  }

  async login() {
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(demoUser));
    return demoUser;
  }

  async signup(credentials: SignupCredentials) {
    const user = { ...demoUser, name: credentials.name, email: credentials.email };
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    return user;
  }

  async updateAvatar(image: string | null) {
    const storedUser = await this.getSession();
    if (!storedUser) throw new Error("Sign in before changing your profile picture.");
    const user = { ...storedUser };
    if (image) user.avatarUrl = image;
    else delete user.avatarUrl;
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    return user;
  }

  async loginWithGoogle() {
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(demoUser));
    return demoUser;
  }

  async requestPasswordReset() {}

  async logout() {
    sessionStorage.removeItem(MOCK_SESSION_KEY);
  }
}

export const authService: AuthService = appConfig.useMockAuth ? new MockAuthService() : new HttpAuthService();
