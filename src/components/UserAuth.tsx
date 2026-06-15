import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useAuth } from '../lib/AuthContext';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import sumjayLogo from '../assets/sumjay-logo.png';
import { MemberRole } from '../types';

const PENDING_MEMBER_ROLE_KEY = 'sumjay.pendingMemberRole';

const GoogleLogo = () => (
  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
    />
  </svg>
);

export default function UserAuth({ mode }: { mode: 'login' | 'signup' }) {
  const { user, isMemberUser, login, loginMember, signupMember, loginMemberWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [memberRole, setMemberRole] = useState<MemberRole>('local');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const isSignup = mode === 'signup';

  if (user && isMemberUser) return <Navigate to="/user" replace />;
  if (user && !isMemberUser) return <Navigate to="/" replace />;

  const finishAuth = (ok: boolean, nextPath = '/user') => {
    if (ok) navigate(nextPath, { replace: true, state: location.state });
    else setError('Unable to continue. Please check your details and try again.');
  };

  const claimExistingMemberProfile = async () => {
    if (!isSignup) return;

    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) {
      return;
    }

    const loginEmail = firebaseUser.email.trim().toLowerCase();
    const matchingMembers = await getDocs(query(collection(db, 'members'), where('email', '==', loginEmail), limit(1)));
    const memberSnap = matchingMembers.docs[0];
    if (!memberSnap) return;

    const member = memberSnap.data();
    if (typeof member.userId === 'string' && member.userId.trim()) {
      if (member.userId === firebaseUser.uid) return;
      throw new Error('This email is already linked to another member account.');
    }

    await updateDoc(memberSnap.ref, {
      userId: firebaseUser.uid,
      email: loginEmail,
      memberRole,
      updatedAt: Date.now(),
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = isSignup ? await signupMember(email, password, name) : await login(email, password);
      if (!isSignup && ok) {
        finishAuth(true, '/');
        return;
      }
      const memberOk = isSignup ? ok : await loginMember(email, password);
      if (ok && isSignup) sessionStorage.setItem(PENDING_MEMBER_ROLE_KEY, memberRole);
      if (memberOk) await claimExistingMemberProfile();
      finishAuth(memberOk);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const ok = await loginMemberWithGoogle();
      if (ok && isSignup) sessionStorage.setItem(PENDING_MEMBER_ROLE_KEY, memberRole);
      if (ok) await claimExistingMemberProfile();
      finishAuth(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="auth-sky-theme min-h-screen bg-sky-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <img
            src={sumjayLogo}
            alt="Sumjay logo"
            className="w-16 h-16 rounded-lg object-contain mx-auto mb-4 border border-primary/20 p-1 bg-white"
          />
          <CardTitle className="text-2xl font-bold">SUMJAY PARAVANNA</CardTitle>
          <CardDescription>{isSignup ? 'Create a member account.' : 'Login to continue.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" required />
              </div>
            )}
            {isSignup && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={memberRole} onValueChange={(value) => setMemberRole(value as MemberRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="abroad">Abroad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required minLength={6} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" type="submit" disabled={loading || googleLoading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignup ? 'Create Member Account' : 'Login'}
            </Button>
          </form>

          <Button type="button" variant="outline" className="w-full" disabled={loading || googleLoading} onClick={handleGoogle}>
            {googleLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!googleLoading && <GoogleLogo />}
            Continue with Google
          </Button>

          <div className="text-center text-sm text-gray-600">
            {isSignup ? (
              <>Already have an account? <Link className="font-medium text-primary hover:underline" to="/user/login">Login</Link></>
            ) : (
              <>New member? <Link className="font-medium text-primary hover:underline" to="/user/signup">Create account</Link></>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
