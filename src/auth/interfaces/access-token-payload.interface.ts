export interface AccessTokenPayload {
  sub: number;
  id: number;
  sid: string;
  type: 'access';
  jti: string;
  name: string;
  iat?: number;
  exp?: number;
}
