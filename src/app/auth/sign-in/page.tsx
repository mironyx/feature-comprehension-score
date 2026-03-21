import { SignInButton } from './SignInButton';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Sign-in failed: missing authorisation code.',
  auth_failed: 'Sign-in failed: could not exchange code for session.',
};

export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Sign-in failed.') : null;

  return (
    <main>
      <h1>Sign in to Feature Comprehension Score</h1>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <SignInButton />
    </main>
  );
}
