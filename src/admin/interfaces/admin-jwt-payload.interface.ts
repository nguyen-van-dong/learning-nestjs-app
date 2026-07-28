export interface AdminJwtPayload {
  sub: number;
  actor: 'admin';
  iat?: number;
  exp?: number;
}
