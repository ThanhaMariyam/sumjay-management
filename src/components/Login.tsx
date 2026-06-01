import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { loginWithCredentials, loginWithGoogle, signupWithCredentials } from '../lib/firebase';
import { Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import sumjayLogo from '../assets/sumjay-logo.png';

const getFriendlyAuthError = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: string }).code === 'string'
  ) {
    const code = (error as { code: string }).code;
    if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) {
      return 'Invalid username/email or password.';
    }
    if (code.includes('auth/user-not-found')) {
      return 'No account found for this username/email.';
    }
    if (code.includes('auth/email-already-in-use')) {
      return 'This username/email already exists. Try signing in.';
    }
    if (code.includes('auth/weak-password')) {
      return 'Password must be at least 6 characters.';
    }
    if (code.includes('auth/popup-blocked') || code.includes('auth/popup-closed-by-user')) {
      return 'Google popup was blocked or closed. Please try again.';
    }
    if (code.includes('auth/unauthorized-domain')) {
      return 'This domain is not authorized in Firebase Authentication settings.';
    }
    if (code.includes('auth/operation-not-allowed')) {
      return 'Sign-in method is disabled in Firebase. Enable Email/Password (and Google if needed) in Firebase Authentication.';
    }
    if (code.includes('auth/admin-restricted-operation')) {
      return 'This sign-in method is restricted by Firebase project settings.';
    }
  }

  return 'Authentication failed. Please try again.';
};

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleManualAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signupWithCredentials(identifier, password, displayName);
      } else {
        await loginWithCredentials(identifier, password);
      }
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <img
            src={sumjayLogo}
            alt="Sumjay logo"
            className="w-16 h-16 rounded-lg object-contain mx-auto mb-4 border border-primary/20 p-1 bg-white"
          />
          <CardTitle className="text-2xl font-bold">Sumjay Football Camp</CardTitle>
          <CardDescription>
            {mode === 'signup'
              ? 'Create your coach/admin account to manage camp students.'
              : 'Sign in to manage attendance, fees, and student records.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === 'signin' ? 'default' : 'outline'}
              onClick={() => {
                setMode('signin');
                setError('');
              }}
            >
              Sign In
            </Button>
            <Button
              type="button"
              variant={mode === 'signup' ? 'default' : 'outline'}
              onClick={() => {
                setMode('signup');
                setError('');
              }}
            >
              Sign Up
            </Button>
          </div>

          <form onSubmit={handleManualAuth} className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Coach name"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="identifier">Username or Email</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. coach1 or coach@sumjay.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                minLength={6}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button className="w-full" type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button className="w-full" onClick={handleGoogleLogin} disabled={loading} type="button">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
