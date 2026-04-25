import { FormEvent, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { PartnerResponse } from '../../hooks/usePartners';
import Pagination from '../common/Pagination';

// --- 引用你已经创建好的外部零件 ---
import { PartnerHeader } from './partners/PartnerHeader';
import { PartnerTable } from './partners/PartnerTable';
import { PartnerDetailContainer } from './partners/PartnerDetailContainer';

interface Props {
  partners: PartnerResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
}

export default function PartnerManagementPanel({ partners = [], loading, error, onRefresh }: Props) {
  // 1. 列表分页与过滤状态
  const [listPage, setListPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [name, setName] = useState('');
  const [partnerType, setPartnerType] = useState('CUSTOMER');
  const [submitting, setSubmitting] = useState(false);

  // 2. 详情视图状态
  const [selectedPartner, setSelectedPartner] = useState<any>(null);

  // 3. 逻辑计算
  const filteredPartners = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    let result = typeFilter === 'ALL' ? partners : partners.filter(p => p.partner_type === typeFilter);
    if (trimmed) {
      result = result.filter((p) =>
        p.name.toLowerCase().includes(trimmed) || String(p.id).includes(trimmed),
      );
    }
    return [...result].sort((a, b) => b.balance - a.balance);
  }, [partners, typeFilter, keyword]);

  const pagedPartners = useMemo(() => {
    return filteredPartners.slice((listPage - 1) * 20, listPage * 20);
  }, [filteredPartners, listPage]);

  // 4. 业务方法
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setSubmitting(true);
      await api.createPartner({ name: name.trim(), partner_type: partnerType });
      setName('');
      onRefresh();
    } catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const handleOpenDetail = (partner: any) => {
    setSelectedPartner(partner);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-32">
      {error && <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-sm font-bold">⚠️ {error}</div>}

      {!selectedPartner ? (
        <>
          {/* A. 头部创建栏 */}
          <PartnerHeader 
            name={name} setName={setName} 
            type={partnerType} setType={setPartnerType} 
            onSubmit={handleCreate} submitting={submitting}
            typeFilter={typeFilter} onTypeFilter={(t: string) => { setTypeFilter(t); setListPage(1); }}
            keyword={keyword} onKeywordChange={(val: string) => { setKeyword(val); setListPage(1); }}
          />

          {/* B. 列表表格 */}
          <PartnerTable partners={pagedPartners} onSelect={handleOpenDetail} loading={loading} />
          
          <Pagination page={listPage} total={filteredPartners.length} onPageChange={setListPage} />
        </>
      ) : (
        /* C. 详情视图 (这里统一引用 PartnerDetailView) */
        <PartnerDetailContainer
          partner={selectedPartner}
          onBack={() => setSelectedPartner(null)}
        />
      )}
    </div>
  );
}
