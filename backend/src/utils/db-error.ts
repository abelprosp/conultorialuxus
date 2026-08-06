import type pg from 'pg';

export function isPgError(err: unknown): err is pg.DatabaseError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as pg.DatabaseError).message === 'string'
  );
}

/** Loga detalhes do Postgres no servidor — nunca enviar isso ao cliente. */
export function logDbError(context: string, err: unknown): void {
  if (isPgError(err)) {
    console.error(`[db] ${context}:`, {
      code: err.code,
      message: err.message,
      detail: err.detail,
      hint: err.hint,
      table: err.table,
      schema: err.schema,
    });
    return;
  }

  if (err instanceof Error) {
    console.error(`[db] ${context}:`, err.message, err.stack);
    return;
  }

  console.error(`[db] ${context}:`, err);
}
