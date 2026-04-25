import type { PartnerResponse } from '../hooks/usePartners';

export const formatPartner = (name?: string, id?: number) => {
  if (!name && !id) return '';
  return name ? `${name}${id ? ` (#${id})` : ''}` : (id ? `#${id}` : '');
};

export const resolvePartnerId = (value: string, partners: PartnerResponse[]) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const directMatch = trimmed.match(/^#?(\d+)$/);
  if (directMatch) {
    const id = Number(directMatch[1]);
    return partners.find(p => p.id === id) ? id : null;
  }
  const embeddedMatch = trimmed.match(/#(\d+)/);
  if (embeddedMatch) {
    const id = Number(embeddedMatch[1]);
    return partners.find(p => p.id === id) ? id : null;
  }
  const normalized = trimmed.toLowerCase();
  const exact = partners.find(p => p.name.toLowerCase() === normalized);
  return exact ? exact.id : null;
};

export const buildPartnerSuggestions = (partners: PartnerResponse[], keyword: string) => {
  const normalized = keyword.trim().toLowerCase();
  return partners
    .filter(p => !normalized || p.name.toLowerCase().includes(normalized) || String(p.id).includes(normalized))
    .slice(0, 50)
    .map(p => formatPartner(p.name, p.id));
};

export const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};
