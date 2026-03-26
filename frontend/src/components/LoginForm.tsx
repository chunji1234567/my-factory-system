import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginForm() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    try {
      await login(username, password);
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '登录失败');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="text-center text-2xl font-semibold text-slate-900">My Factory Login</h1>
        <p className="mt-1 text-center text-sm text-slate-500">请输入后台账号密码</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-600">用户名</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              value={username}
              onChange={(evt) => setUsername(evt.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">密码</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(evt) => setPassword(evt.target.value)}
              required
            />
          </div>

          {notice && <p className="text-sm text-rose-600">{notice}</p>}
          {error && !notice && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
