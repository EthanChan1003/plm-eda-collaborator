// ============ V4.0 2D 引擎核心 - 画布状态管理 ============
import { bus } from './event.bus.js';

// 画布变换状态
export let canvasState = {
    scale: 1,
    translateX: 0,
    translateY: 0
};

// 工具模式枚举
export const ToolMode = {
    SELECT: 'SELECT',
    PAN: 'PAN',
    ANNOTATE: 'ANNOTATE'
};

// 当前工具模式
export let currentToolMode = ToolMode.SELECT;

// 更新画布状态（用于外部同步）
export function updateCanvasState(newState) {
    canvasState = { ...canvasState, ...newState };
}

// 设置工具模式
export function setToolMode(mode) {
    currentToolMode = mode;
}

// ============ 2D 渲染引擎 ============

// 画布变换应用
export function updateCanvasTransform(canvasTransform, canvasState) {
    if (!canvasTransform) return;
    canvasTransform.style.transform = `translate(${canvasState.translateX}px, ${canvasState.translateY}px) scale(${canvasState.scale})`;
}

// 缩放数学计算
export function zoom(factor, centerX, centerY, canvasWrapper, canvasState, updateStateCallback) {
    if (!canvasWrapper) return;
    const newScale = Math.max(0.2, Math.min(5, canvasState.scale * factor));

    let newTranslateX = canvasState.translateX;
    let newTranslateY = canvasState.translateY;

    if (centerX !== undefined && centerY !== undefined) {
        const rect = canvasWrapper.getBoundingClientRect();
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;

        newTranslateX = mouseX - (mouseX - canvasState.translateX) * (newScale / canvasState.scale);
        newTranslateY = mouseY - (mouseY - canvasState.translateY) * (newScale / canvasState.scale);
    }

    if (updateStateCallback) {
        updateStateCallback({
            scale: newScale,
            translateX: newTranslateX,
            translateY: newTranslateY
        });
    }

    return { scale: newScale, translateX: newTranslateX, translateY: newTranslateY };
}

// ============ EventBus 事件监听 ============

bus.on('ZOOM_IN', () => {
    const transformEl = document.getElementById('canvas-transform');
    const wrapperEl = document.getElementById('canvas-wrapper');
    if (!transformEl || !wrapperEl) return;

    zoom(1.2, undefined, undefined, wrapperEl, canvasState, (newState) => {
        updateCanvasState(newState);
        updateCanvasTransform(transformEl, canvasState);
        bus.emit('CANVAS_STATE_CHANGED', canvasState);
    });
});

bus.on('ZOOM_OUT', () => {
    const transformEl = document.getElementById('canvas-transform');
    const wrapperEl = document.getElementById('canvas-wrapper');
    if (!transformEl || !wrapperEl) return;

    zoom(0.8, undefined, undefined, wrapperEl, canvasState, (newState) => {
        updateCanvasState(newState);
        updateCanvasTransform(transformEl, canvasState);
        bus.emit('CANVAS_STATE_CHANGED', canvasState);
    });
});

bus.on('ZOOM_RESET', () => {
    const transformEl = document.getElementById('canvas-transform');
    if (!transformEl) return;

    updateCanvasState({ scale: 1, translateX: 0, translateY: 0 });
    updateCanvasTransform(transformEl, canvasState);
    bus.emit('CANVAS_STATE_CHANGED', canvasState);
});

// 监听：精确设定缩放比例
bus.on('SET_ZOOM_SCALE', (targetScale) => {
    const transformEl = document.getElementById('canvas-transform');
    const wrapperEl = document.getElementById('canvas-wrapper');
    if (!transformEl || !wrapperEl) return;

    // 以画布中心为基准进行平滑过渡
    const rect = wrapperEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const factor = targetScale / canvasState.scale;

    // 复用引擎自带的 zoom 计算公式
    zoom(factor, centerX, centerY, wrapperEl, canvasState, (newState) => {
        updateCanvasState(newState);
        updateCanvasTransform(transformEl, canvasState);
        bus.emit('CANVAS_STATE_CHANGED', canvasState);
    });
});

// 监听画布状态变化（平移后更新）
bus.on('CANVAS_STATE_CHANGED', () => {
    const transformEl = document.getElementById('canvas-transform');
    if (!transformEl) return;
    updateCanvasTransform(transformEl, canvasState);
});

// 监听工具模式变化，同步本地状态
bus.on('TOOL_MODE_CHANGED', (mode) => {
    currentToolMode = mode;
});

// ============ 初始化函数 ============
export function init2DEngine() {
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const transformEl = document.getElementById('canvas-transform');
    if (!canvasWrapper || !transformEl) {
        console.warn('2D 引擎：找不到画布元素，初始化失败');
        return;
    }

    let isPanning = false;
    let panStartX, panStartY;

    // 滚轮缩放
    canvasWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;

        zoom(factor, e.clientX, e.clientY, canvasWrapper, canvasState, (newState) => {
            updateCanvasState(newState);
            updateCanvasTransform(transformEl, canvasState);
            bus.emit('CANVAS_STATE_CHANGED', canvasState);
        });
    }, { passive: false });

    // 平移 - mousedown
    canvasWrapper.addEventListener('mousedown', (e) => {
        if (currentToolMode !== ToolMode.PAN) return;
        if (e.target.closest('.annotation-box') || e.target.closest('.annotation-input-panel')) return;

        isPanning = true;
        panStartX = e.clientX - canvasState.translateX;
        panStartY = e.clientY - canvasState.translateY;
        canvasWrapper.classList.remove('cursor-grab');
        canvasWrapper.classList.add('cursor-grabbing');
    });

    // 平移 - mousemove
    canvasWrapper.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        updateCanvasState({
            translateX: e.clientX - panStartX,
            translateY: e.clientY - panStartY
        });
        updateCanvasTransform(transformEl, canvasState);
    });

    // 平移 - 停止
    const stopPan = () => {
        if (isPanning) {
            isPanning = false;
            canvasWrapper.classList.remove('cursor-grabbing');
            canvasWrapper.classList.add('cursor-grab');
            bus.emit('CANVAS_STATE_CHANGED');
        }
    };
    canvasWrapper.addEventListener('mouseup', stopPan);
    canvasWrapper.addEventListener('mouseleave', stopPan);

    console.log('2D 引擎：渲染与交互总线初始化完成');
}
