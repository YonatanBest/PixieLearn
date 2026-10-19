import { apiRequest } from "../../lib/api/client";
import { appConfig } from "../../lib/config";
import type { AuthService, AuthUser, LoginCredentials, SignupCredentials } from "./types";

const demoUser: AuthUser = {
  id: "demo-user",
  name: "Alex Morgan",
  email: "alex@example.com",
};

class HttpAuthService implements AuthService {
  login(credentials: LoginCredentials) {
    return apiRequest<AuthUser>("/auth/login", { method: "POST", body: credentials });
  }

  signup(credentials: SignupCredentials) {
    return apiRequest<AuthUser>("/auth/signup", { method: "POST", body: credentials });
  }

  loginWithGoogle() {
    return apiRequest<AuthUser>("/auth/google", { method: "POST" });
  }

  async requestPasswordReset(email: string) {
    await apiRequest<void>("/auth/password-reset", { method: "POST", body: { email } });
  }

  async logout() {
    await apiRequest<void>("/auth/logout", { method: "POST" });
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
