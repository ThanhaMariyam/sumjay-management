import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import sumjayLogo from '../assets/sumjay-logo.png';
import { useAuth } from '../lib/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleManualAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = await login(identifier, password);
      if (!ok) {
        setError('Invalid username or password.');
      }
    } catch {
      setError('Invalid username or password.');
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
          <CardTitle className="text-2xl font-bold">SUMJAY PARAVANNA</CardTitle>
          <CardDescription>Sign in as Student Admin or Membership Admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleManualAuth} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="identifier">Username</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter admin username"
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
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button className="w-full" type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
