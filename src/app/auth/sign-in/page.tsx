import { SignInButton } from './SignInButton';

interface Props {
  readonly searchParams: Promise<{ readonly error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Sign-in failed: missing authorisation code.',
  auth_failed: 'Sign-in failed: could not exchange code for session.',
};

export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Sign-in failed.') : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-content-pad-sm">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-heading-xl font-display">Sign in</h1>
        <p className="text-body text-text-secondary">Feature Comprehension Score</p>
        {errorMessage && (
          <p role="alert" className="text-body text-destructive">{errorMessage}</p>
        )}
        <SignInButton />
      </div>
    </main>
  );
}
