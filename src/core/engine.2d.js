// ============ V4.0 2D 引擎核心 - 画布状态管理 ============

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
import { bus } from './event.bus.js';

bus.on('ZOOM_IN', () => {
    const transformEl = document.getElementById('canvas-transform');
    const wrapperEl = document.getElementById('canvas-wrapper');
    if (!transformEl || !wrapperEl) return;
    
    zoom(1.2, undefined, undefined, wrapperEl, canvasState, (newState) => {
        updateCanvasState(newState);
        updateCanvasTransform(transformEl, canvasState);
    });
});

bus.on('ZOOM_OUT', () => {
    const transformEl = document.getElementById('canvas-transform');
    const wrapperEl = document.getElementById('canvas-wrapper');
    if (!transformEl || !wrapperEl) return;
    
    zoom(0.8, undefined, undefined, wrapperEl, canvasState, (newState) => {
        updateCanvasState(newState);
        updateCanvasTransform(transformEl, canvasState);
    });
});

bus.on('ZOOM_RESET', () => {
    const transformEl = document.getElementById('canvas-transform');
    if (!transformEl) return;
    
    updateCanvasState({ scale: 1, translateX: 0, translateY: 0 });
    updateCanvasTransform(transformEl, canvasState);
});

// 监听画布状态变化（平移后更新）
bus.on('CANVAS_STATE_CHANGED', () => {
    const transformEl = document.getElementById('canvas-transform');
    if (!transformEl) return;
    updateCanvasTransform(transformEl, canvasState);
});

// 初始化滚轮缩放
document.addEventListener('DOMContentLoaded', () => {
    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (canvasWrapper) {
        canvasWrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const transformEl = document.getElementById('canvas-transform');
            if (!transformEl) return;
            
            zoom(factor, e.clientX, e.clientY, canvasWrapper, canvasState, (newState) => {
                updateCanvasState(newState);
                updateCanvasTransform(transformEl, canvasState);
            });
        }, { passive: false });
    }
});
