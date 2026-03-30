// ============ V4.0 工具栏模块 - 顶部工具按钮管理 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
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
    const toolCircle = document.querySelector('#annotation-sub-menu button[title="圆形框"]');
    const toolPin = document.querySelector('#annotation-sub-menu button[title="标记点/箭头"]');
    const toolZoomIn = document.getElementById('tool-zoom-in');
    const toolZoomOut = document.getElementById('tool-zoom-out');
    const toolReset = document.getElementById('tool-reset');
    const toolSplitView = document.getElementById('tool-split-view');
    const toolToggleAnnotations = document.getElementById('tool-toggle-annotations');
    const canvasWrapper = document.getElementById('canvas-wrapper');

    let isAnnotationsVisible = true; // 默认可见

    // === 新增：全局批注显隐开关逻辑 ===
    if (toolToggleAnnotations) {
        toolToggleAnnotations.addEventListener('click', () => {
            isAnnotationsVisible = !isAnnotationsVisible;
            const icon = toolToggleAnnotations.querySelector('i');
            
            if (isAnnotationsVisible) {
                icon.className = 'fas fa-eye text-sm';
                toolToggleAnnotations.classList.add('text-blue-600', 'bg-blue-50');
                toolToggleAnnotations.classList.remove('text-gray-500', 'hover:bg-gray-50');
            } else {
                icon.className = 'fas fa-eye-slash text-sm';
                toolToggleAnnotations.classList.remove('text-blue-600', 'bg-blue-50');
                toolToggleAnnotations.classList.add('text-gray-500', 'hover:bg-gray-50');
            }
            // 向全局广播显隐状态
            bus.emit('TOGGLE_ANNOTATIONS_VISIBILITY', isAnnotationsVisible);
        });
    }

    // 监听外部强制打开请求（用于防呆设计）
    bus.on('FORCE_ANNOTATIONS_VISIBLE', () => {
        console.log('[DEBUG] FORCE_ANNOTATIONS_VISIBLE triggered, isAnnotationsVisible:', isAnnotationsVisible);
        if (!isAnnotationsVisible && toolToggleAnnotations) {
            console.log('[DEBUG] Clicking toolToggleAnnotations to enable annotations');
            toolToggleAnnotations.click(); // 模拟点击恢复开启
        }
    });

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
        // === 新增：重置批注主按钮的高亮 ===
        if (annotationMainBtn) annotationMainBtn.classList.remove('tool-active', 'bg-blue-50', 'text-blue-600');

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
                // === 新增：让工具栏的主钢笔图标也亮起，增强反馈 ===
                if (annotationMainBtn) annotationMainBtn.classList.add('tool-active', 'bg-blue-50', 'text-blue-600');
                if (canvasWrapper) canvasWrapper.classList.add('cursor-crosshair');
                break;
        }
    }

    // 监听工具模式变化事件
    bus.on('TOOL_MODE_CHANGED', (mode) => {
        setToolModeUI(mode);
        // === 核心防呆：一旦用户选择要开始画批注，强制打开批注显示 ===
        if (mode === ToolMode.ANNOTATE) {
            bus.emit('FORCE_ANNOTATIONS_VISIBLE');
        }
    });

    // 监听视图切换，同步工具栏 UI（控制 3D 分屏按钮显隐）
    bus.on('VIEW_CHANGED', (viewType) => {
        const toolSplitView = document.getElementById('tool-split-view');
        if (toolSplitView) {
            toolSplitView.classList.toggle('hidden', viewType !== 'pcb');
        }
        // 新增：如果切回原理图且当前 3D 处于开启状态，则强制关闭
        if (viewType === 'schematic' && AppState.isSplitViewActive) {
            import('../features/mcad.3d.js').then(Mcad3D => {
                const view2d = document.getElementById('view-2d-container');
                const view3d = document.getElementById('view-3d-container');
                if (Mcad3D && typeof Mcad3D.toggleThreeSplitView === 'function') {
                    Mcad3D.toggleThreeSplitView(toolSplitView, view2d, view3d);
                }
            });
        }
    });

    // 监听版本切换：控制批注按钮的禁用状态（修复 updateAnnotationPermissions 报错）
    bus.on('VERSION_CHANGED', (version) => {
        const toolRect = document.getElementById('tool-rect');
        if (toolRect) {
            toolRect.disabled = version !== AppState.latestVersion;
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

    // === 核心替换：支持图钉/形状广播 ===
    if (toolRect) {
        toolRect.addEventListener('click', () => {
            bus.emit('ANNOTATION_SHAPE_CHANGED', 'rect'); // 广播形状：矩形
            bus.emit('TOOL_MODE_CHANGED', ToolMode.ANNOTATE);
            if (annotationSubMenu) annotationSubMenu.classList.add('hidden');
        });
    }

    if (toolCircle) {
        toolCircle.addEventListener('click', () => {
            bus.emit('ANNOTATION_SHAPE_CHANGED', 'circle'); // 广播形状：圆形
            bus.emit('TOOL_MODE_CHANGED', ToolMode.ANNOTATE);
            if (annotationSubMenu) annotationSubMenu.classList.add('hidden');
        });
    }

    if (toolPin) {
        toolPin.addEventListener('click', () => {
            // 广播新形状：图钉 (Pin)
            bus.emit('ANNOTATION_SHAPE_CHANGED', 'pin');
            // 切换到批注模式（激活 cursor-crosshair）
            bus.emit('TOOL_MODE_CHANGED', ToolMode.ANNOTATE);
            if (annotationSubMenu) annotationSubMenu.classList.add('hidden');
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

    // ============ 缩放比例输入框控制 ============
    const zoomInput = document.getElementById('zoom-input');

    if (zoomInput) {
        // 1. 被动更新：监听引擎发出的状态改变，实时更新输入框的数字
        bus.on('CANVAS_STATE_CHANGED', (state) => {
            if (state && typeof state.scale === 'number') {
                const percentage = Math.round(state.scale * 100);
                zoomInput.value = `${percentage}%`;
            }
        });

        // 2. 主动控制：监听用户回车输入，下发精确缩放指令
        zoomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                let val = zoomInput.value.replace('%', '').trim();
                let targetPercentage = parseFloat(val);

                if (!isNaN(targetPercentage) && targetPercentage > 0) {
                    // 限制缩放区间：10% 到 2000%
                    targetPercentage = Math.max(10, Math.min(2000, targetPercentage));
                    const targetScale = targetPercentage / 100;
                    bus.emit('SET_ZOOM_SCALE', targetScale);

                    // 补齐 UI 显示并取消光标聚焦
                    zoomInput.value = `${targetPercentage}%`;
                    zoomInput.blur();
                } else {
                    bus.emit('SHOW_TOAST', { message: '请输入有效的缩放比例', type: 'warning' });
                }
            }
        });

        // 3. 体验优化：失去焦点时自动补全百分号
        zoomInput.addEventListener('blur', () => {
            if (!zoomInput.value.endsWith('%')) {
                zoomInput.value += '%';
            }
        });

        // 4. 体验优化：点击输入框时自动全选文本，方便修改
        zoomInput.addEventListener('click', () => {
            zoomInput.select();
        });
    }

    console.log('工具栏模块初始化完成');
}
