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
