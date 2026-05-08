import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import { syncUser } from '@/src/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await syncUser(result.user.uid, result.user.email);
      toast.success('Logged in with Google');
      navigate('/');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await syncUser(result.user.uid, result.user.email);
      toast.success('Logged in successfully');
      navigate('/');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await syncUser(result.user.uid, result.user.email);
      toast.success('Account created successfully');
      navigate('/');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      toast.success('Password reset email sent');
      setIsResetting(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (isResetting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-12 bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-5xl border-4 border-slate-900 shadow-bento-lg transform -rotate-3 transition-transform">✓</div>
          <div>
            <h1 className="text-5xl font-black tracking-tighter uppercase text-slate-900">Checkify <span className="text-indigo-600">Pro</span></h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-2">Recovery Terminal</p>
          </div>
        </div>

        <Card className="bento-card w-full max-w-md p-4">
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl font-black uppercase tracking-tight">Reset Password</CardTitle>
            <CardDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Enter your email to receive a recovery link</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Registered Email</Label>
                <Input 
                  type="email" 
                  placeholder="alex@audit.pro" 
                  className="h-14 border-2 border-slate-900 rounded-xl bg-slate-50 font-bold focus-visible:ring-indigo-600/20"
                  value={resetEmail} 
                  onChange={(e) => setResetEmail(e.target.value)} 
                  required 
                />
              </div>
              <Button type="submit" className="bento-button w-full h-14 bg-indigo-600 text-white text-sm">SEND RECOVERY LINK</Button>
            </form>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" onClick={() => setIsResetting(false)} className="w-full font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-indigo-600 gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Authorization
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-12 bg-slate-50">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-5xl border-4 border-slate-900 shadow-bento-lg transform -rotate-3 transition-transform hover:rotate-0">✓</div>
        <div>
          <h1 className="text-5xl font-black tracking-tighter uppercase text-slate-900">Checkify <span className="text-indigo-600">Pro</span></h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-2">Precision Audit & Data Integrity Control</p>
        </div>
      </div>
      
      <Tabs defaultValue="login" className="w-full max-w-md">
        <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1.5 rounded-2xl border-2 border-slate-900 mb-6">
          <TabsTrigger value="login" className="rounded-xl font-black uppercase text-xs">Login</TabsTrigger>
          <TabsTrigger value="signup" className="rounded-xl font-black uppercase text-xs">Sign Up</TabsTrigger>
        </TabsList>
        
        <TabsContent value="login">
          <Card className="bento-card p-4">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Welcome Commander</CardTitle>
              <CardDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Access your secure verification logs</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Secure Email</Label>
                    <Input 
                      type="email" 
                      placeholder="alex@audit.pro" 
                      className="h-14 border-2 border-slate-900 rounded-xl bg-slate-50 font-bold focus-visible:ring-indigo-600/20"
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Access Token</Label>
                    <div className="relative">
                      <Input 
                        type={showPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        className="h-14 border-2 border-slate-900 rounded-xl bg-slate-50 font-bold focus-visible:ring-indigo-600/20 pr-12"
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <Button type="submit" className="bento-button w-full h-14 bg-indigo-600 text-white text-sm" disabled={loading}>
                  {loading ? 'INITIALIZING...' : 'AUTHORIZE ACCESS'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col pt-2 pb-2">
              <Button variant="link" size="sm" onClick={() => setIsResetting(true)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600">
                Recovery Lost Credentials?
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="signup">
          <Card className="bento-card p-4">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">New Operative</CardTitle>
              <CardDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Register a new audit identifier</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignUp} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Designate Email</Label>
                    <Input 
                      type="email" 
                      placeholder="commander@veri.check" 
                      className="h-14 border-2 border-slate-900 rounded-xl bg-slate-50 font-bold focus-visible:ring-indigo-600/20"
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Secure Password</Label>
                    <div className="relative">
                      <Input 
                        type={showPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        className="h-14 border-2 border-slate-900 rounded-xl bg-slate-50 font-bold focus-visible:ring-indigo-600/20 pr-12"
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <Button type="submit" className="bento-button w-full h-14 bg-indigo-600 text-white text-sm" disabled={loading}>
                  {loading ? 'DEPLOYING...' : 'INITIALIZE ACCOUNT'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="w-full max-w-md space-y-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t-2 border-slate-900 border-dashed" />
          </div>
          <div className="relative flex justify-center text-[10px] font-black uppercase">
            <span className="bg-slate-50 px-2 text-slate-400">Secure Protocol Bridge</span>
          </div>
        </div>

        <Button 
          type="button" 
          onClick={handleGoogleLogin} 
          variant="outline" 
          className="bento-button w-full h-14 bg-white border-2 border-slate-900 text-slate-900 rounded-xl font-bold text-sm gap-3 transition-transform hover:-translate-y-1 active:translate-y-0"
          disabled={loading}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Authorize with Google
        </Button>
      </div>
    </div>
  );
}
