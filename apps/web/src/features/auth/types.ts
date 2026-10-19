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
  login(credentials: LoginCredentials): Promise<AuthUser>;
  signup(credentials: SignupCredentials): Promise<AuthUser>;
  loginWithGoogle(): Promise<AuthUser>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
}
