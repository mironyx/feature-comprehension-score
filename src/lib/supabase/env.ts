function required(key: string): string {
  return (
    process.env[key] ??
    (() => {
      throw new Error(`Missing ${key}`);
    })()
  );
}

export const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
// serviceRoleKey intentionally not exported here — only used in service-role.ts
