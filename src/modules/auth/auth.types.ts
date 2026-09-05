export interface SupabaseUser {
  id: string;
  phone?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseUser;
}

export interface SupabaseEmailSignUpResponse {
  id?: string;
  phone?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_in?: number | null;
  token_type?: string | null;
  user?: SupabaseUser;
}

export interface AuthUserResponse {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  location: string | null;
  experience: string | null;
  avatarUrl: string | null;
}

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: AuthUserResponse;
}

export interface AuthRegistrationResponse {
  confirmationRequired: boolean;
  user: AuthUserResponse;
  session: AuthSessionResponse | null;
}
