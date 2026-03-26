import { bus } from './core/event.bus.js';
import { AppState } from './core/state.js';
import { initAnnotationManager } from './features/annotation.manager.js';
import { initSidebar } from './ui/sidebar.js';

// 临时挂载到 window 保证旧代码兼容性，重构完成后将移除
window.bus = bus;
window.AppState = AppState;

console.log('EDA 可视化协同 V4.0 模块化引擎启动成功！');

// 在 DOMContentLoaded 后启动各模块
document.addEventListener('DOMContentLoaded', () => {
    initAnnotationManager();
    initSidebar();
    console.log('批注管理器与 Sidebar 初始化完成！');
});

// 引入 UI 控制器（ES6 模块桥接）
import './app.controller.js';
console.log('UI 控制器加载完毕，神经桥接成功！');
