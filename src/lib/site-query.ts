import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { getSiteContent } from './site-content.functions';
export const siteQuery = queryOptions({ queryKey: ['site-content'], queryFn: () => getSiteContent(), staleTime: 60_000 });
export function useSiteContent() { return useSuspenseQuery(siteQuery).data; }
export function siteMeta(title: string, description: string) {
  return { meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
}