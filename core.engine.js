// 核心引擎：图形与数学引擎
// 依赖：config.data.js 中定义的全局变量

// DOM 元素引用（由 app.controller.js 初始化时设置）
let canvasWrapper = null;
let canvasTransform = null;

// 初始化引擎（由 app.controller.js 调用）
function initEngine(wrapper, transform) {
    canvasWrapper = wrapper;
    canvasTransform = transform;
}

// ============ 精准坐标映射函数 ============
function getCanvasCoordinates(clientX, clientY) {
    const rect = canvasWrapper.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    
    // 图纸空间坐标 = (屏幕坐标 - 平移偏移) / 缩放比例
    const canvasX = (mouseX - canvasState.translateX) / canvasState.scale;
    const canvasY = (mouseY - canvasState.translateY) / canvasState.scale;
    
    return { x: canvasX, y: canvasY };
}

// ============ 画布变换功能 ============
function updateCanvasTransform() {
    canvasTransform.style.transform = `translate(${canvasState.translateX}px, ${canvasState.translateY}px) scale(${canvasState.scale})`;
    const zoomLevel = document.getElementById('zoom-level');
    if (zoomLevel) {
        zoomLevel.textContent = Math.round(canvasState.scale * 100) + '%';
    }
}

function zoom(factor, centerX, centerY) {
    const newScale = Math.max(0.2, Math.min(5, canvasState.scale * factor));
    
    if (centerX !== undefined && centerY !== undefined) {
        // 以鼠标位置为中心缩放
        const rect = canvasWrapper.getBoundingClientRect();
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;
        
        canvasState.translateX = mouseX - (mouseX - canvasState.translateX) * (newScale / canvasState.scale);
        canvasState.translateY = mouseY - (mouseY - canvasState.translateY) * (newScale / canvasState.scale);
    }
    
    canvasState.scale = newScale;
    updateCanvasTransform();
}

// ============ 差异高亮控制 ============
function applyDiffHighlight() {
    document.querySelectorAll('.eda-component').forEach(el => {
        el.classList.remove('diff-added', 'diff-modified', 'diff-deleted', 'diff-moved');
    });
    
    Object.keys(mockDiffData).forEach(ref => {
        const diff = mockDiffData[ref];
        const components = document.querySelectorAll(`.eda-component[data-ref="${ref}"]`);
        components.forEach(comp => {
            if (diff.type === 'moved') {
                comp.classList.add('diff-moved');
            } else {
                comp.classList.add(`diff-${diff.type}`);
            }
        });
    });
    
    showPositionIndicators();
}

function clearDiffHighlight() {
    document.querySelectorAll('.eda-component').forEach(el => {
        el.classList.remove('diff-added', 'diff-modified', 'diff-deleted', 'diff-moved');
    });
    hidePositionIndicators();
}

function showPositionIndicators() {
    document.querySelectorAll('.diff-position-indicator').forEach(el => {
        el.classList.remove('hidden');
    });
}

function hidePositionIndicators() {
    document.querySelectorAll('.diff-position-indicator').forEach(el => {
        el.classList.add('hidden');
    });
}

// ============ 辅助高亮函数 ============
function highlightComponent(ref) {
    const comps = document.querySelectorAll(`.eda-component[data-ref="${ref}"]`);
    comps.forEach(c => {
        c.style.filter = "drop-shadow(0 0 4px rgba(37, 99, 235, 0.6))";
    });
}

function clearHighlight() {
    const comps = document.querySelectorAll('.eda-component');
    comps.forEach(c => {
        if (!c.classList.contains('selected-component')) {
            c.style.filter = "";
        }
    });
}

// 暴露到全局
window.getCanvasCoordinates = getCanvasCoordinates;
window.updateCanvasTransform = updateCanvasTransform;
window.zoom = zoom;
window.applyDiffHighlight = applyDiffHighlight;
window.clearDiffHighlight = clearDiffHighlight;
window.showPositionIndicators = showPositionIndicators;
window.hidePositionIndicators = hidePositionIndicators;
window.highlightComponent = highlightComponent;
window.clearHighlight = clearHighlight;
window.initEngine = initEngine;
