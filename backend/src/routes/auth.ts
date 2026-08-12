import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import { requireAuth, signToken, type AuthUser } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string };
    if (!email?.trim() || !senha) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
      return;
    }

    const result = await query<{
      id: number;
      nome: string;
      email: string;
      senha_hash: string;
      perfil: AuthUser['perfil'];
      colaborador_id: number | null;
      ativo: boolean;
    }>(
      `SELECT id, nome, email, senha_hash, perfil, colaborador_id, ativo
       FROM usuarios WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];
    if (!user || !user.ativo) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const authUser: AuthUser = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      colaborador_id: user.colaborador_id,
    };

    res.json({ token: signToken(authUser), user: authUser });
  } catch (err) {
    logDbError('POST /api/auth/login', err);
    res.status(500).json({ error: 'Erro no login' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/trocar-senha', requireAuth, async (req, res) => {
  try {
    const { senha_atual, senha_nova } = req.body as { senha_atual?: string; senha_nova?: string };
    if (!senha_atual || !senha_nova || senha_nova.length < 6) {
      res.status(400).json({ error: 'Senha nova deve ter ao menos 6 caracteres' });
      return;
    }

    const row = await query<{ senha_hash: string }>(
      'SELECT senha_hash FROM usuarios WHERE id = $1',
      [req.user!.id]
    );
    const ok = await bcrypt.compare(senha_atual, row.rows[0].senha_hash);
    if (!ok) {
      res.status(401).json({ error: 'Senha atual incorreta' });
      return;
    }

    const hash = await bcrypt.hash(senha_nova, 10);
    await query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, req.user!.id]);
    res.json({ success: true });
  } catch (err) {
    logDbError('POST /api/auth/trocar-senha', err);
    res.status(500).json({ error: 'Erro ao trocar senha' });
  }
});

export default router;
