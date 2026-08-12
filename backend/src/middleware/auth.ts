import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export type PerfilUsuario = 'admin' | 'financeiro' | 'contratado';

export interface AuthUser {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  colaborador_id: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-secret-troque-em-producao';
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      colaborador_id: user.colaborador_id,
    },
    jwtSecret(),
    { expiresIn: '7d' }
  );
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), jwtSecret()) as AuthUser;
    req.user = payload;
  } catch {
    // token inválido — segue sem usuário
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Autenticação necessária' });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), jwtSecret()) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireRole(...perfis: PerfilUsuario[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Autenticação necessária' });
      return;
    }
    if (!perfis.includes(req.user.perfil)) {
      res.status(403).json({ error: 'Sem permissão para esta ação' });
      return;
    }
    next();
  };
}

export function canManageAll(req: Request): boolean {
  return req.user?.perfil === 'admin' || req.user?.perfil === 'financeiro';
}

export function canLiberarServico(req: Request, responsavelId: number | null): boolean {
  if (!req.user) return false;
  if (canManageAll(req)) return true;
  if (req.user.perfil === 'contratado' && req.user.colaborador_id && responsavelId) {
    return req.user.colaborador_id === responsavelId;
  }
  return false;
}
