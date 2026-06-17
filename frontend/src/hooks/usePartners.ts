import { api, PartnersQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'SELF';

export interface PartnerResponse {
  id: number;
  name: string;
  partner_type: PartnerType;
  balance: number;
}

export type PartnersFilters = object;

function normalizePartner(raw: any): PartnerResponse {
  return {
    ...raw,
    balance: Number(raw.balance ?? 0),
  };
}

type LegacyArg = boolean;

export function usePartners(
  optionsOrEnabled: UseListHookOptions<PartnersFilters> | LegacyArg = {},
): UseListHookResult<PartnerResponse> {
  const options: UseListHookOptions<PartnersFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<PartnerResponse, PartnersFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getPartners(qp as PartnersQueryParams),
    normalize: normalizePartner,
  });
}
