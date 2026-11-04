/**
 * Concorrência das filas Bull.
 *
 * No Bull (v3/v4), cada `@Process('nome')` registrado na mesma fila SOMA a sua
 * concorrência (padrão 1). Com 7 handlers nomeados na fila `aluno-sync` e 4 na
 * `responsavel-sync`, até 11 jobs rodavam ao mesmo tempo por instância — cada um
 * executando procedures pesadas no CORPORE_ERP (incidente de 04/11/2026).
 *
 * Por isso cada fila agora tem UM único processador (`name: '*'`) que despacha
 * pelo nome do job, e a concorrência real da fila é este valor.
 */
export function getQueueConcurrency(envName: string, fallback = 1): number {
  const raw = Number.parseInt(process.env[envName] ?? "", 10);

  if (!Number.isFinite(raw) || raw < 1) {
    return fallback;
  }

  return raw;
}

export const ALUNO_SYNC_CONCURRENCY = getQueueConcurrency(
  "ALUNO_SYNC_CONCURRENCY",
);

export const RESPONSAVEL_SYNC_CONCURRENCY = getQueueConcurrency(
  "RESPONSAVEL_SYNC_CONCURRENCY",
);

/**
 * Opções do job de sincronização completa por coligada.
 * jobId fixo impede que disparos repetidos (cron + POST manual, cliques
 * repetidos, retentativas) empilhem várias cargas completas da mesma
 * coligada ao mesmo tempo. Remover ao concluir/falhar é obrigatório: com o
 * job guardado, o mesmo jobId bloquearia as próximas execuções.
 */
export function buildSyncColigadaJobOptions(
  periodoLetivo: string,
  coligadaId: number,
) {
  return {
    jobId: `sync-coligada:${periodoLetivo}:${coligadaId}`,
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  };
}
