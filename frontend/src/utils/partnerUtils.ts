import type { PartnerResponse } from '../hooks/usePartners';

// 统一格式化显示：供应商名称 (#ID)
export function formatPartner(name?: string, id?: number) {
  if (!name && !id) return '';
  return name ? `${name}${id ? ` (#${id})` : ''}` : `#${id}`;
}

// 统一解析逻辑：支持名称搜索和 #ID 搜索
export function resolvePartnerId(value: string, partners: PartnerResponse[]) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // 匹配数字或 #123
  const idMatch = trimmed.match(/^#?(\d+)$/);
  if (idMatch) {
    const id = Number(idMatch[1]);
    return partners.find((p) => p.id === id) ? id : null;
  }
  const normalized = trimmed.toLowerCase();
  const exact = partners.find((p) => p.name.toLowerCase() === normalized);
  return exact ? exact.id : null;
}

// 统一生成建议列表
export function buildPartnerSuggestions(partners: PartnerResponse[], keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  return partners
    .filter((p) => !normalized || p.name.toLowerCase().includes(normalized) || String(p.id).includes(normalized))
    .slice(0, 50)
    .map((p) => formatPartner(p.name, p.id));
}