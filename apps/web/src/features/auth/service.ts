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

  async loginWithGoogle() {
    const response = await apiRequest<BetterAuthResponse>("/auth/sign-in/social", {
      method: "POST",
      body: {
        provider: "google",
        callbackURL: window.location.origin,
        disableRedirect: true,
      },
    });
    return mapUser(response.user);
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
  async login() {
    return demoUser;
  }

  async signup(credentials: SignupCredentials) {
    return { ...demoUser, name: credentials.name, email: credentials.email };
  }

  async loginWithGoogle() {
    return demoUser;
  }

  async requestPasswordReset() {}

  async logout() {}
}

export const authService: AuthService = appConfig.useMockAuth ? new MockAuthService() : new HttpAuthService();
