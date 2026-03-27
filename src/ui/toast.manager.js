// ============ V5.1 Toast 管理器 - 全局轻提示系统 ============
import { bus } from '../core/event.bus.js';

export function initToastManager() {
    // 动态创建并挂载 Toast 容器
    const container = document.createElement('div');
    container.id = 'toast-container';
    // Tailwind 定位：固定在顶部居中，层级最高，不阻挡鼠标点击
    container.className = 'fixed top-6 left-1/2 transform -translate-x-1/2 z-[9999] flex flex-col items-center pointer-events-none space-y-3';
    document.body.appendChild(container);

    // 核心渲染函数
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');

        // 样式配置映射
        const styleMap = {
            'success': {
                bg: 'bg-white text-gray-800 border border-gray-100 shadow-xl',
                icon: '<i class="fas fa-check-circle text-green-500 mr-2 text-lg"></i>'
            },
            'error': {
                bg: 'bg-red-50 text-red-600 border border-red-100 shadow-lg',
                icon: '<i class="fas fa-exclamation-circle text-red-500 mr-2 text-lg"></i>'
            },
            'warning': {
                bg: 'bg-yellow-50 text-yellow-700 border border-yellow-100 shadow-lg',
                icon: '<i class="fas fa-exclamation-triangle text-yellow-500 mr-2 text-lg"></i>'
            },
            'info': {
                bg: 'bg-white text-gray-800 border border-gray-100 shadow-xl',
                icon: '<i class="fas fa-info-circle text-blue-500 mr-2 text-lg"></i>'
            }
        };

        const config = styleMap[type] || styleMap['info'];

        // 基础样式与动画初始状态（透明、上移）
        toast.className = `flex items-center px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 opacity-0 translate-y-[-20px] ${config.bg}`;
        toast.innerHTML = `${config.icon}<span>${message}</span>`;

        container.appendChild(toast);

        // 触发进场动画 (下一帧执行)
        requestAnimationFrame(() => {
            toast.classList.remove('opacity-0', 'translate-y-[-20px]');
            toast.classList.add('opacity-100', 'translate-y-0');
        });

        // 3秒后触发退场动画并销毁 DOM
        setTimeout(() => {
            toast.classList.remove('opacity-100', 'translate-y-0');
            toast.classList.add('opacity-0', 'translate-y-[-20px]');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // 1. 监听显式的 Toast 触发事件
    bus.on('SHOW_TOAST', ({ message, type }) => showToast(message, type));

    // 2. 监听业务领域事件，实现无侵入式的自动提示！
    bus.on('VERSION_CHANGED', (version) => showToast(`已切换至版本 ${version}`, 'info'));
    bus.on('ANNOTATION_SAVED', () => showToast('评审意见已保存', 'success'));
    bus.on('ANNOTATION_DELETED', () => showToast('评审意见已删除', 'info'));
    bus.on('CLEAR_SELECTION', () => { /* 暂时静默，不需要提示 */ });

    // 挂载到全局，方便非模块化或内联代码紧急调用
    window.showToast = showToast;

    console.log('全局 Toast 提示系统初始化完成');
}
