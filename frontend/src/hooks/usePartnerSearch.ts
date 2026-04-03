// src/hooks/usePartnerSearch.ts
import { useMemo } from 'react';
import type { PartnerResponse } from './usePartners';

export function usePartnerSearch(partners: PartnerResponse[], inputValue: string) {
  // 1. 生成建议列表逻辑
  const suggestions = useMemo(() => {
    const normalized = inputValue.trim().toLowerCase();
    return partners
      .filter((p) => {
        if (!normalized) return true;
        return p.name.toLowerCase().includes(normalized) || String(p.id).includes(normalized);
      })
      .slice(0, 50)
      .map((p) => `${p.name}${p.id ? ` (#${p.id})` : ''}`);
  }, [partners, inputValue]);

  // 2. 解析 ID 逻辑 (支持纯数字或 #ID 格式)
  const resolvedId = useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return null;
    
    // 匹配数字或 #数字
    const idMatch = trimmed.match(/^#?(\d+)$/);
    if (idMatch) {
      const id = Number(idMatch[1]);
      return partners.find((p) => p.id === id) ? id : null;
    }
    
    // 精确名称匹配
    const normalized = trimmed.toLowerCase();
    const exact = partners.find((p) => p.name.toLowerCase() === normalized);
    return exact ? exact.id : null;
  }, [partners, inputValue]);

  return { suggestions, resolvedId };
}