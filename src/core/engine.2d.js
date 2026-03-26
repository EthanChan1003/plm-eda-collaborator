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
