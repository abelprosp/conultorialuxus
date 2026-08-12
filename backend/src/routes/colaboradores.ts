import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.nome, c.ativo,
        (SELECT COUNT(*) FROM clientes_servicos cs
         JOIN colaboradores col ON col.id = cs.responsavel_id
         WHERE cs.responsavel_id = c.id AND cs.ativo = TRUE)::int AS clientes_vinculados
       FROM colaboradores c
       ORDER BY c.nome`
    );
    res.json(result.rows);
  } catch (err) {
    logDbError('GET /api/colaboradores', err);
    res.status(500).json({ error: 'Erro ao listar colaboradores' });
  }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { nome } = req.body as { nome?: string };
    if (!nome?.trim()) {
      res.status(400).json({ error: 'Nome é obrigatório' });
      return;
    }
    const result = await query(
      'INSERT INTO colaboradores (nome) VALUES ($1) RETURNING *',
      [nome.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logDbError('POST /api/colaboradores', err);
    res.status(500).json({ error: 'Erro ao criar colaborador' });
  }
});

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { nome, ativo } = req.body as { nome?: string; ativo?: boolean };
    if (nome?.trim()) {
      await query('UPDATE colaboradores SET nome = $1 WHERE id = $2', [nome.trim(), id]);
    }
    if (ativo !== undefined) {
      await query('UPDATE colaboradores SET ativo = $1 WHERE id = $2', [ativo, id]);
    }
    const result = await query('SELECT * FROM colaboradores WHERE id = $1', [id]);
    res.json(result.rows[0]);
  } catch (err) {
    logDbError('PATCH /api/colaboradores/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar colaborador' });
  }
});

router.get('/usuarios', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.colaborador_id, c.nome AS colaborador_nome
       FROM usuarios u
       LEFT JOIN colaboradores c ON c.id = u.colaborador_id
       ORDER BY u.nome`
    );
    res.json(result.rows);
  } catch (err) {
    logDbError('GET /api/colaboradores/usuarios', err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

router.post('/usuarios', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const body = req.body as {
      nome?: string;
      email?: string;
      senha?: string;
      perfil?: string;
      colaborador_id?: number | null;
    };
    if (!body.nome?.trim() || !body.email?.trim() || !body.senha || !body.perfil) {
      res.status(400).json({ error: 'Nome, e-mail, senha e perfil são obrigatórios' });
      return;
    }
    const hash = await bcrypt.hash(body.senha, 10);
    const result = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, colaborador_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, perfil, colaborador_id, ativo`,
      [
        body.nome.trim(),
        body.email.trim().toLowerCase(),
        hash,
        body.perfil,
        body.colaborador_id ?? null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logDbError('POST /api/colaboradores/usuarios', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

export default router;
