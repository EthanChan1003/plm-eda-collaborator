// ============ V4.0 工具栏模块 - 顶部工具按钮管理 ============
import { bus } from '../core/event.bus.js';
import * as Mcad3D from '../features/mcad.3d.js';

const ToolMode = {
    SELECT: 'SELECT',
    PAN: 'PAN',
    ANNOTATE: 'ANNOTATE'
};

let currentToolMode = ToolMode.SELECT;

export function initToolbar() {
    // DOM 获取
    const toolSelect = document.getElementById('tool-select');
    const toolPan = document.getElementById('tool-pan');
    const toolRect = document.getElementById('tool-rect');
    const toolZoomIn = document.getElementById('tool-zoom-in');
    const toolZoomOut = document.getElementById('tool-zoom-out');
    const toolReset = document.getElementById('tool-reset');
    const toolSplitView = document.getElementById('tool-split-view');
    const canvasWrapper = document.getElementById('canvas-wrapper');

    const annotationMainBtn = document.getElementById('annotation-main-btn');
    const annotationSubMenu = document.getElementById('annotation-sub-menu');

    // ============ 工具模式切换 ============
    function setToolModeUI(mode) {
        currentToolMode = mode;

        // 同步到 canvasWrapper dataset 供批注管理器读取
        if (canvasWrapper) {
            canvasWrapper.dataset.toolMode = mode;
        }

        // 重置所有工具按钮状态
        if (toolSelect) toolSelect.classList.remove('tool-active');
        if (toolPan) toolPan.classList.remove('tool-active');
        if (toolRect) toolRect.classList.remove('tool-active');

        // 重置光标
        if (canvasWrapper) {
            canvasWrapper.classList.remove('cursor-default', 'cursor-grab', 'cursor-crosshair');
        }

        switch(mode) {
            case ToolMode.SELECT:
                if (toolSelect) toolSelect.classList.add('tool-active');
                if (canvasWrapper) canvasWrapper.classList.add('cursor-default');
                break;
            case ToolMode.PAN:
                if (toolPan) toolPan.classList.add('tool-active');
                if (canvasWrapper) canvasWrapper.classList.add('cursor-grab');
                break;
            case ToolMode.ANNOTATE:
                if (toolRect) toolRect.classList.add('tool-active');
                if (canvasWrapper) canvasWrapper.classList.add('cursor-crosshair');
                break;
        }
    }

    // 监听工具模式变化事件
    bus.on('TOOL_MODE_CHANGED', (mode) => {
        setToolModeUI(mode);
    });

    // 监听视图切换，同步工具栏 UI（控制 3D 分屏按钮显隐）
    bus.on('VIEW_CHANGED', (viewType) => {
        if (toolSplitView) {
            // 仅在 PCB 模式下显示 3D 分屏按钮
            if (viewType === 'pcb') {
                toolSplitView.classList.remove('hidden');
            } else {
                toolSplitView.classList.add('hidden');
            }
        }
    });

    // ============ 批注工具下拉菜单交互 ============
    // 切换下拉菜单显示/隐藏
    if (annotationMainBtn && annotationSubMenu) {
        annotationMainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            annotationSubMenu.classList.toggle('hidden');
        });

        // 点击下拉菜单内部不关闭
        annotationSubMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // 全局点击监听：点击外部区域关闭下拉菜单
    document.addEventListener('click', () => {
        if (annotationSubMenu && !annotationSubMenu.classList.contains('hidden')) {
            annotationSubMenu.classList.add('hidden');
        }
    });

    // ============ 工具按钮事件绑定 ============
    // 工具模式切换 - 通过 EventBus 解耦
    if (toolSelect) {
        toolSelect.addEventListener('click', () => bus.emit('TOOL_MODE_CHANGED', ToolMode.SELECT));
    }
    if (toolPan) {
        toolPan.addEventListener('click', () => bus.emit('TOOL_MODE_CHANGED', ToolMode.PAN));
    }
    if (toolRect) {
        toolRect.addEventListener('click', () => {
            bus.emit('TOOL_MODE_CHANGED', ToolMode.ANNOTATE);
            // 点击具体工具后关闭下拉菜单
            if (annotationSubMenu) {
                annotationSubMenu.classList.add('hidden');
            }
        });
    }

    // 缩放按钮
    if (toolZoomIn) toolZoomIn.addEventListener('click', () => bus.emit('ZOOM_IN'));
    if (toolZoomOut) toolZoomOut.addEventListener('click', () => bus.emit('ZOOM_OUT'));
    if (toolReset) toolReset.addEventListener('click', () => bus.emit('ZOOM_RESET'));

    // 3D 分屏按钮 - 跨模块调用
    if (toolSplitView) {
        toolSplitView.addEventListener('click', () => {
            const view2dContainer = document.getElementById('view-2d-container');
            const view3dContainer = document.getElementById('view-3d-container');

            if (typeof Mcad3D !== 'undefined' && typeof Mcad3D.toggleThreeSplitView === 'function') {
                Mcad3D.toggleThreeSplitView(toolSplitView, view2dContainer, view3dContainer);
            } else {
                console.warn('3D 模块未正确加载');
            }
        });
    }

    // 初始化默认工具模式 UI
    setToolModeUI(ToolMode.SELECT);

    console.log('工具栏模块初始化完成');
}
