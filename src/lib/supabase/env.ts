function required(value: string | undefined, key: string): string {
  if (value === undefined) throw new Error(`Missing ${key}`);
  return value;
}

export const supabaseUrl = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
export const supabasePublishableKey = required(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
// secretKey intentionally not exported here — only used in secret.ts
