import type { FinanceTransactionMock } from '../mockData';

interface FinanceListProps {
  transactions: FinanceTransactionMock[];
}

export default function FinanceList({ transactions }: FinanceListProps) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-slate-400">财务流水</p>
        <h3 className="text-2xl font-semibold text-slate-900">近期转账</h3>
      </div>

      <ul className="mt-6 space-y-4">
        {transactions.map((txn) => (
          <li key={txn.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{txn.partner}</p>
              <p className="text-xs text-slate-500">{new Date(txn.createdAt).toLocaleString()}</p>
              <p className="text-sm text-slate-600">{txn.note}</p>
            </div>
            <p className={`text-lg font-bold ${txn.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {txn.amount >= 0 ? '+' : '-'}¥ {Math.abs(txn.amount).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
