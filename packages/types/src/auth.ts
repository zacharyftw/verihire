// =============================================================================
// AUTH TYPES
// =============================================================================

export interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  userType: 'CANDIDATE' | 'RECRUITER';
}

export interface OAuthCredentials {
  provider: 'GOOGLE' | 'GITHUB' | 'LINKEDIN';
  code: string;
  redirectUri: string;
}

// =============================================================================
// TOKEN TYPES
// =============================================================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AccessTokenPayload {
  sub: string; // User ID
  email: string;
  userType: 'CANDIDATE' | 'RECRUITER' | 'ADMIN';
  roles: string[];
  sessionId: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

export interface Session {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface SessionInfo {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

// =============================================================================
// MFA TYPES
// =============================================================================

export interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MfaVerifyRequest {
  code: string;
}

export interface MfaBackupCodesResponse {
  backupCodes: string[];
}

// =============================================================================
// PASSWORD TYPES
// =============================================================================

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

// =============================================================================
// AUTH RESPONSE TYPES
// =============================================================================

export interface AuthResponse {
  user: AuthUser;
  tokens: TokenPair;
  mfaRequired?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  userType: 'CANDIDATE' | 'RECRUITER' | 'ADMIN';
  mfaEnabled: boolean;
  roles: string[];
}

// =============================================================================
// OAUTH PROFILE TYPES
// =============================================================================

export interface OAuthProfile {
  provider: 'GOOGLE' | 'GITHUB' | 'LINKEDIN';
  providerId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export interface GitHubProfile {
  id: number;
  login: string;
  email: string;
  name: string;
  avatar_url: string;
}

export interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: {
    displayImage: string;
  };
}
