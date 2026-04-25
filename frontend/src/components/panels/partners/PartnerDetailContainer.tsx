import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import type { PartnerResponse } from '../../../hooks/usePartners';
import { PartnerDetailView } from './PartnerDetailView';
import { LedgerTable } from './LedgerTable';
import Pagination from '../../common/Pagination';

type DetailView = 'orders' | 'transactions' | 'ledger';

interface PartnerDetailContainerProps {
  partner: PartnerResponse;
  onBack: () => void;
}

function resolveFinanceType(partnerType: string) {
  return partnerType === 'SUPPLIER' ? 'payable' : 'receivable';
}

export function PartnerDetailContainer({ partner, onBack }: PartnerDetailContainerProps) {
  const [view, setView] = useState<DetailView>('orders');
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerExporting, setLedgerExporting] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const PAGE_SIZE = 6;
  const TXN_PAGE_SIZE = 8;

  useEffect(() => {
    setView('orders');
    setLedgerPage(1);
    setDetailData(null);
    setOrdersPage(1);
    setTransactionsPage(1);
  }, [partner.id]);

  useEffect(() => {
    let active = true;
    const fetchDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await api.getFinancePartnerDetail(
          partner.id,
          resolveFinanceType(partner.partner_type),
          { ledgerPage },
        );
        if (!active) return;
        setDetailData(data);
      } catch (err) {
        if (!active) return;
        setDetailError(err instanceof Error ? err.message : '详情加载失败');
      } finally {
        if (active) setDetailLoading(false);
      }
    };
    fetchDetail();
    return () => {
      active = false;
    };
  }, [partner.id, partner.partner_type, ledgerPage]);

  const fallbackDetail = useMemo(
    () => ({
      partner_name: partner.name,
      partner_id: partner.id,
      partner_type: partner.partner_type,
      balance: partner.balance,
      orders: [],
      transactions: [],
      ledger_entries: [],
    }),
    [partner],
  );

  const pagedOrders = useMemo(() => {
    const orders = detailData?.orders || [];
    const total = orders.length;
    const start = (ordersPage - 1) * PAGE_SIZE;
    return {
      data: orders.slice(start, start + PAGE_SIZE),
      total,
    };
  }, [detailData, ordersPage]);

  const pagedTransactions = useMemo(() => {
    const transactions = detailData?.transactions || [];
    const total = transactions.length;
    const start = (transactionsPage - 1) * TXN_PAGE_SIZE;
    return {
      data: transactions.slice(start, start + TXN_PAGE_SIZE),
      total,
    };
  }, [detailData, transactionsPage]);

  const handleLedgerPageChange = (page: number) => {
    if (page !== ledgerPage) {
      setLedgerPage(page);
    }
  };

  const handleExport = async () => {
    try {
      setLedgerExporting(true);
      const blob = await api.exportFinancePartnerLedger(
        partner.id,
        resolveFinanceType(partner.partner_type),
        { summary: true },
      );
      const partnerName = detailData?.partner_name || partner.name || 'partner';
      const safeName = partnerName.replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName}_ledger_${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setLedgerExporting(false);
    }
  };

  const ledgerContent = (
    <div className="space-y-6">
      {detailError && (
        <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-sm font-bold">
          {detailError}
        </div>
      )}
      {detailLoading ? (
        <div className="py-20 text-center text-slate-300 font-bold">同步中...</div>
      ) : (
        <>
          <LedgerTable entries={detailData?.ledger_entries || []} />
          {detailData?.ledger_pagination && (
            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400">
                页码 {detailData.ledger_pagination.page} / {detailData.ledger_pagination.total_pages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={detailData.ledger_pagination.page <= 1}
                  onClick={() => handleLedgerPageChange(detailData.ledger_pagination.page - 1)}
                  className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold disabled:opacity-30"
                >
                  上一页
                </button>
                <button
                  disabled={detailData.ledger_pagination.page >= detailData.ledger_pagination.total_pages}
                  onClick={() => handleLedgerPageChange(detailData.ledger_pagination.page + 1)}
                  className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <PartnerDetailView
      detail={{
        ...(detailData || fallbackDetail),
        orders: pagedOrders.data,
        transactions: pagedTransactions.data,
      }}
      view={view}
      onViewChange={setView}
      onBack={onBack}
      onExport={handleExport}
      ledgerContent={ledgerContent}
      ledgerExporting={ledgerExporting}
      ordersPagination={
        pagedOrders.total > PAGE_SIZE ? (
          <Pagination page={ordersPage} total={pagedOrders.total} pageSize={PAGE_SIZE} onPageChange={setOrdersPage} />
        ) : null
      }
      transactionsPagination={
        pagedTransactions.total > TXN_PAGE_SIZE ? (
          <Pagination page={transactionsPage} total={pagedTransactions.total} pageSize={TXN_PAGE_SIZE} onPageChange={setTransactionsPage} />
        ) : null
      }
    />
  );
}
