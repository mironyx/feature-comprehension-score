import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './env';
import type { Database } from './types';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
