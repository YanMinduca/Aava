import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { mergeContent } from './site-content';

export const getSiteContent = createServerFn({ method: 'GET' }).handler(async () => {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Não foi possível carregar as informações da igreja.');
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from('site_content').select('content').eq('id', 'main').maybeSingle();
  if (error) throw error;
  return mergeContent(data?.content);
});