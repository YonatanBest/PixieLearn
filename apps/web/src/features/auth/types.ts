export type AuthMode = "login" | "signup";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
  remember: boolean;
};

export type SignupCredentials = {
  name: string;
  email: string;
  password: string;
};

export interface AuthService {
  getSession(): Promise<AuthUser | null>;
  login(credentials: LoginCredentials): Promise<AuthUser>;
  signup(credentials: SignupCredentials): Promise<AuthUser>;
  updateAvatar(image: string | null): Promise<AuthUser>;
  loginWithGoogle(): Promise<AuthUser | null>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
}
