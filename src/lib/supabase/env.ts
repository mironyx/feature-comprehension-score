function required(key: string): string {
  return (
    process.env[key] ??
    (() => {
      throw new Error(`Missing ${key}`);
    })()
  );
}

export const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
export const supabasePublishableKey = required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
// secretKey intentionally not exported here — only used in secret.ts
