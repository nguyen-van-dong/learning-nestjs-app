export const AUDIT_LOG_OPTIONS = Symbol('AUDIT_LOG_OPTIONS');

export const AUDIT_ACTION_KEY = 'audit-log:action';
export const SKIP_AUDIT_KEY = 'audit-log:skip';

export const DEFAULT_AUDIT_SENSITIVE_FIELDS = [
  'password',
  'newPassword',
  'confirmPassword',
  'token',
  'tokenHash',
  'token_hash',
  'authorization',
  'cookie',
  'secret',
  'accessToken',
  'refreshToken',
];
