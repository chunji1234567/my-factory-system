import { ReactNode, useEffect } from 'react';

interface ModalProps {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode; // 新增：统一底部按钮区域
  maxWidth?: string;  // 新增：允许控制宽度（比如订单页需要更大）
}

export default function Modal({ 
  title, 
  open, 
  onClose, 
  children, 
  footer,
  maxWidth = "max-w-lg" 
}: ModalProps) {
  
  // 逻辑：打开时锁定背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4 transition-all">
      {/* 点击背景关闭（可选，看你习惯） */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className={`
        relative w-full ${maxWidth} bg-white shadow-2xl 
        rounded-t-3xl sm:rounded-2xl 
        flex flex-col max-h-[95vh] sm:max-h-[90vh]
        animate-in slide-in-from-bottom sm:zoom-in-95 duration-300
      `}>
        {/* Header - 样式微调，对齐图 2 的高质感 */}
        <header className="flex items-center justify-between border-b border-slate-50 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </header>

        {/* Body - 增加滚动条支持 */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {children}
        </div>

        {/* Footer - 统一的底部操作区 */}
        {footer && (
          <footer className="border-t border-slate-50 bg-slate-50/50 p-4 flex justify-end gap-3 rounded-b-2xl">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}