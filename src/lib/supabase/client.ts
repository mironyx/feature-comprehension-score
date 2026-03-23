import { createBrowserClient } from '@supabase/ssr';
import { supabaseUrl, supabasePublishableKey } from './env';
import type { Database } from './types';

export const supabase = createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
