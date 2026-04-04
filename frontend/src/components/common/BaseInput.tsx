import React from 'react';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
}

export const BaseInput = ({ label, error, className = "", ...props }: Props) => (
  <div className="w-full space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700 ml-1">{label}</label>}
    <input
      className={`w-full rounded-full border border-slate-200 px-4 py-2 text-sm 
      focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all 
      disabled:bg-slate-50 disabled:text-slate-400 ${className} ${error ? 'border-rose-300' : ''}`}
      {...props}
    />
    {error && <p className="text-xs text-rose-500 ml-1">{error}</p>}
  </div>
);