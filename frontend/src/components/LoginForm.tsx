import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from './primitives';

/**
 * 登录页（Stage C-9 redesign，2026-06-18）。
 *
 * 视觉拉齐 design tokens：
 *   - 容器底色 bg-surface-subtle（替代 slate-100）
 *   - 卡片 Card primitive（替代 rounded-2xl bg-white shadow-lg）
 *   - 字号 text-heading / text-body / text-caption（替代 text-2xl / text-sm）
 *   - 错误提示 Card tone="danger"（替代裸 text-rose-600）
 *   - 输入框 rounded-input border-line + focus:border-line-focus + ring-primary/5
 *   - 提交按钮 rounded-pill bg-primary text-on-primary（替代 rounded-xl bg-slate-900）
 */

const FIELD_LABEL_CLS =
  'block text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';
const INPUT_CLS =
  'w-full rounded-input border border-line bg-surface px-3 py-2 text-body text-ink outline-none ' +
  'focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors';

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

  const errorText = notice || (!notice && error) || null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="text-micro text-ink-faint uppercase tracking-widest">
            My Factory System
          </p>
          <h1 className="text-heading text-ink mt-1">运营指挥台</h1>
        </div>

        <Card>
          <p className="text-caption text-ink-muted text-center">请输入后台账号密码</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1">
              <label htmlFor="login-username" className={FIELD_LABEL_CLS}>
                用户名
              </label>
              <input
                id="login-username"
                className={INPUT_CLS}
                value={username}
                onChange={(evt) => setUsername(evt.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="login-password" className={FIELD_LABEL_CLS}>
                密码
              </label>
              <input
                id="login-password"
                className={INPUT_CLS}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(evt) => setPassword(evt.target.value)}
                required
              />
            </div>

            {errorText && (
              <Card tone="danger" padding="tight" flat>
                <p className="text-caption text-danger-ink">⚠ {errorText}</p>
              </Card>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-pill bg-primary text-on-primary py-2 text-caption font-bold
                         hover:bg-primary-hover active:scale-95 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? '登录中…' : '登录'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
