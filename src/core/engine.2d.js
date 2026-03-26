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
