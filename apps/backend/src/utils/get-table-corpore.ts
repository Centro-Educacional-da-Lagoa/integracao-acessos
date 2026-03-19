export function getTotvsTableName(): string {
  const tableCorpore =
    process.env.NODE_ENV === 'production'
      ? 'CORPORE_ERP'
      : 'CORPORE_ERP_MANUTENCAO'

  return `${tableCorpore}`
}
