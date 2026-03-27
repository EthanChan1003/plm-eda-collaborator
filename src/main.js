import { bus } from './core/event.bus.js';
import { AppState } from './core/state.js';
import { initAnnotationManager } from './features/annotation.manager.js';
import { initSidebar } from './ui/sidebar.js';
import { initPdfExporter } from './features/export.pdf.js';
import { getAnnotations } from './features/annotation.manager.js';
import { init2DEngine } from './core/engine.2d.js';
import { initToolbar } from './ui/toolbar.js';
import { initSelectionManager } from './features/selection.manager.js';
import { initSearchManager } from './features/search.manager.js';
import { initLayoutManager } from './ui/layout.manager.js';

// 临时挂载到 window 保证旧代码兼容性，重构完成后将移除
window.bus = bus;
window.AppState = AppState;

console.log('EDA 可视化协同 V4.0 模块化引擎启动成功！');

// 在 DOMContentLoaded 后启动各模块
document.addEventListener('DOMContentLoaded', () => {
    init2DEngine();
    initToolbar();
    initLayoutManager();
    initSelectionManager();
    initAnnotationManager();
    initSidebar();
    initSearchManager();

    // 激活 PDF 导出模块
    initPdfExporter(getAnnotations);

    console.log('2D 引擎、工具栏、布局管理器、选择管理器、批注管理器、Sidebar、搜索管理器与 PDF 导出引擎初始化完成！');
});

// 引入 UI 控制器（ES6 模块桥接）
import './app.controller.js';
console.log('UI 控制器加载完毕，神经桥接成功！');
