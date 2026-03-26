// ============ V4.6 批注管理器 - 独立模块 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { presetAnnotations } from '../data/mock.data.js';
import { canvasState, updateCanvasState } from '../core/engine.2d.js';

// 批注数据存储
let annotations = [...presetAnnotations];

// DOM 引用（延迟初始化）
let canvasWrapper = null;
let canvasTransform = null;
let annotationBubble = null;

// 绘图状态
let isDrawing = false;
let currentAnnotationBox = null;
let drawStartX, drawStartY;
let currentDrawingType = 'schematic';

/**
 * 初始化批注管理器
 */
export function initAnnotationManager() {
    // 延迟获取 DOM 元素
    canvasWrapper = document.getElementById('canvas-wrapper');
    canvasTransform = document.getElementById('canvas-transform');
    annotationBubble = document.getElementById('annotation-bubble');

    // 监听版本切换，自动显隐对应版本的批注框
    bus.on('VERSION_CHANGED', (newVersion) => {
        refreshAnnotationVisibility(newVersion);
    });

    // 监听定位请求
    bus.on('LOCATE_ANNOTATION', ({ id, version }) => {
        executeLocate(id, version);
    });

    // 监听视图切换
    bus.on('VIEW_CHANGED', (viewType) => {
        currentDrawingType = viewType;
    });
    
    // 监听工具模式变化
    bus.on('TOOL_MODE_CHANGED', (mode) => {
        // 如果不是批注模式，取消正在进行的绘制
        if (mode !== 'ANNOTATE' && isDrawing && currentAnnotationBox) {
            currentAnnotationBox.remove();
            currentAnnotationBox = null;
            isDrawing = false;
        }
    });

    // 绑定绘图事件
    bindDrawingEvents();

    // 渲染预置批注
    renderPresetAnnotations();

    console.log('批注管理器：初始化完成，已加载预置数据。');
}

/**
 * 获取批注容器
 */
function getAnnotationContainer(viewType) {
    const canvasId = viewType === 'schematic' ? 'canvas-schematic' : 'canvas-pcb';
    const canvas = document.getElementById(canvasId);
    return canvas?.querySelector('.annotations-container');
}

/**
 * 获取鼠标相对于当前画布的局部坐标
 */
function getCanvasLocalCoordinates(clientX, clientY) {
    const activeCanvas = document.getElementById(currentDrawingType === 'schematic' ? 'canvas-schematic' : 'canvas-pcb');
    if (!activeCanvas) return { x: 0, y: 0 };
    const rect = activeCanvas.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

/**
 * 绑定绘图事件
 */
function bindDrawingEvents() {
    if (!canvasWrapper) return;

    canvasWrapper.addEventListener('mousedown', (e) => {
        // 检查是否处于批注模式（通过 data 属性或全局状态）
        if (canvasWrapper.dataset.toolMode !== 'ANNOTATE') return;
        if (e.target.closest('.annotation-box') || e.target.closest('.annotation-input-panel')) return;

        isDrawing = true;

        const coords = getCanvasLocalCoordinates(e.clientX, e.clientY);
        drawStartX = coords.x;
        drawStartY = coords.y;

        currentAnnotationBox = document.createElement('div');
        currentAnnotationBox.className = 'annotation-box';
        currentAnnotationBox.style.left = drawStartX + 'px';
        currentAnnotationBox.style.top = drawStartY + 'px';
        currentAnnotationBox.style.width = '0px';
        currentAnnotationBox.style.height = '0px';

        const container = getAnnotationContainer(currentDrawingType);
        if (container) {
            container.appendChild(currentAnnotationBox);
        }
    });

    canvasWrapper.addEventListener('mousemove', (e) => {
        if (!isDrawing || !currentAnnotationBox) return;

        const coords = getCanvasLocalCoordinates(e.clientX, e.clientY);
        const currentX = coords.x;
        const currentY = coords.y;

        const width = Math.abs(currentX - drawStartX);
        const height = Math.abs(currentY - drawStartY);
        const left = Math.min(currentX, drawStartX);
        const top = Math.min(currentY, drawStartY);

        currentAnnotationBox.style.left = left + 'px';
        currentAnnotationBox.style.top = top + 'px';
        currentAnnotationBox.style.width = width + 'px';
        currentAnnotationBox.style.height = height + 'px';
    });

    canvasWrapper.addEventListener('mouseup', (e) => {
        if (!isDrawing || !currentAnnotationBox) return;
        
        isDrawing = false;
        const boxWidth = parseInt(currentAnnotationBox.style.width);
        const boxHeight = parseInt(currentAnnotationBox.style.height);

        if (boxWidth < 20 || boxHeight < 20) {
            currentAnnotationBox.remove();
            currentAnnotationBox = null;
            return;
        }

        showAnnotationInputPanel(currentAnnotationBox);
        
        // 发送事件通知控制器退出批注模式
        bus.emit('ANNOTATION_DRAWN');
    });
}

/**
 * 显示批注输入面板
 */
function showAnnotationInputPanel(annotationBox) {
    const boxLeft = parseInt(annotationBox.style.left);
    const boxTop = parseInt(annotationBox.style.top);
    const boxWidth = parseInt(annotationBox.style.width);
    const boxHeight = parseInt(annotationBox.style.height);

    const panel = document.createElement('div');
    panel.className = 'annotation-input-panel';
    
    const panelLeft = (boxLeft + boxWidth + 10) * canvasState.scale + canvasState.translateX;
    const panelTop = boxTop * canvasState.scale + canvasState.translateY;
    
    panel.style.left = panelLeft + 'px';
    panel.style.top = panelTop + 'px';
    panel.innerHTML = `
        <div class="text-xs font-bold text-gray-700 mb-2">添加评审意见</div>
        <textarea id="annotation-text" class="w-full h-20 px-2 py-1.5 border border-gray-200 rounded text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="请输入评审意见..."></textarea>
        <div class="flex justify-end space-x-2 mt-2">
            <button id="annotation-cancel" class="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors">取消</button>
            <button id="annotation-save" class="px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors">保存</button>
        </div>
    `;

    canvasWrapper.appendChild(panel);

    setTimeout(() => panel.querySelector('#annotation-text').focus(), 10);

    panel.querySelector('#annotation-cancel').addEventListener('click', () => {
        annotationBox.remove();
        panel.remove();
    });

    panel.querySelector('#annotation-save').addEventListener('click', () => {
        const text = panel.querySelector('#annotation-text').value.trim();
        if (text) {
            saveAnnotation(annotationBox, text);
        }
        panel.remove();
    });
}

/**
 * 获取下一个批注 ID
 */
function getNextAnnotationId(version) {
    const versionAnnotations = annotations.filter(a => a.version === version);
    if (versionAnnotations.length === 0) return 1;
    return Math.max(...versionAnnotations.map(a => a.id)) + 1;
}

/**
 * 保存批注
 */
function saveAnnotation(annotationBox, text) {
    const annotationId = getNextAnnotationId(AppState.currentVersion);

    const badge = document.createElement('div');
    badge.className = 'annotation-badge';
    badge.textContent = annotationId;
    annotationBox.appendChild(badge);

    const boxLeft = parseInt(annotationBox.style.left);
    const boxTop = parseInt(annotationBox.style.top);
    const boxWidth = parseInt(annotationBox.style.width);
    const boxHeight = parseInt(annotationBox.style.height);

    const annotationData = {
        id: annotationId,
        text: text,
        time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }),
        author: '张三',
        element: annotationBox,
        viewType: currentDrawingType,
        centerX: boxLeft + boxWidth / 2,
        centerY: boxTop + boxHeight / 2,
        status: 'open',
        version: AppState.currentVersion
    };
    annotations.push(annotationData);

    annotationBox.addEventListener('click', (e) => {
        e.stopPropagation();
        highlightAnnotation(annotationId);
    });

    // 通知控制器更新批注列表
    bus.emit('ANNOTATION_SAVED', annotationData);
    
    // 触发反应式更新
    bus.emit('ANNOTATIONS_UPDATED', annotations);
}

/**
 * 高亮批注
 */
function highlightAnnotation(annotationId, version, breathing = false) {
    document.querySelectorAll('.annotation-box').forEach(box => {
        box.classList.remove('selected', 'breathing');
    });
    document.querySelectorAll('.note-item').forEach(item => {
        item.classList.remove('active');
    });

    const targetVersion = version || AppState.currentVersion;
    const annotation = annotations.find(a => a.id === annotationId && a.version === targetVersion);
    
    if (annotation && annotation.element) {
        annotation.element.classList.add('selected');
        if (breathing) {
            annotation.element.classList.add('breathing');
            setTimeout(() => {
                annotation.element.classList.remove('breathing');
            }, 3000);
        }
        
        const noteItem = document.querySelector(`[data-note-id="${annotationId}"][data-note-version="${targetVersion}"]`);
        if (noteItem) {
            noteItem.classList.add('active');
            noteItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        showAnnotationBubble(annotationId, targetVersion);
    }
}

/**
 * 显示批注气泡
 */
function showAnnotationBubble(annotationId, version) {
    const targetVersion = version || AppState.currentVersion;
    const annotation = annotations.find(a => a.id === annotationId && a.version === targetVersion);
    if (!annotation || !annotation.element || !annotationBubble) return;

    const rect = annotation.element.getBoundingClientRect();
    const bubbleX = rect.right + 10;
    const bubbleY = rect.top;

    annotationBubble.style.left = bubbleX + 'px';
    annotationBubble.style.top = bubbleY + 'px';

    const authorName = annotation.author || '系统预置';
    const authorInitial = authorName.charAt(0);
    const noteTime = annotation.time || '';

    annotationBubble.innerHTML = `
        <div class="flex items-start justify-between mb-2">
            <div class="flex items-center">
                <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold mr-2">${authorInitial}</div>
                <div>
                    <div class="text-xs font-medium text-gray-900">${authorName}</div>
                    <div class="text-[10px] text-gray-500">${noteTime}</div>
                </div>
            </div>
            <button id="close-bubble" class="text-gray-400 hover:text-gray-600 transition-colors ml-2">
                <i class="fas fa-times text-xs"></i>
            </button>
        </div>
        <div class="text-sm text-gray-700 leading-relaxed">${annotation.text}</div>
    `;

    const closeBtn = annotationBubble.querySelector('#close-bubble');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideAnnotationBubble);
    }

    annotationBubble.classList.remove('hidden');
}

/**
 * 隐藏批注气泡
 */
function hideAnnotationBubble() {
    if (annotationBubble) {
        annotationBubble.classList.add('hidden');
    }
}

/**
 * 刷新批注可见性
 */
function refreshAnnotationVisibility(version) {
    annotations.forEach(a => {
        if (a.element) {
            a.element.style.display = (a.version === version) ? '' : 'none';
        }
    });
}

/**
 * 渲染预置批注
 */
function renderPresetAnnotations() {
    annotations.forEach(annotation => {
        const container = getAnnotationContainer(annotation.viewType);
        if (!container) return;

        const annotationBox = document.createElement('div');
        annotationBox.className = 'annotation-box';
        if (annotation.status === 'resolved') {
            annotationBox.classList.add('annotation-resolved');
        }
        annotationBox.style.left = (annotation.centerX - 40) + 'px';
        annotationBox.style.top = (annotation.centerY - 30) + 'px';
        annotationBox.style.width = '80px';
        annotationBox.style.height = '60px';

        if (annotation.version !== AppState.currentVersion) {
            annotationBox.style.display = 'none';
        }

        const badge = document.createElement('div');
        badge.className = 'annotation-badge';
        badge.textContent = annotation.id;
        annotationBox.appendChild(badge);

        annotationBox.addEventListener('click', (e) => {
            e.stopPropagation();
            highlightAnnotation(annotation.id, annotation.version);
        });

        container.appendChild(annotationBox);
        annotation.element = annotationBox;
    });
}

/**
 * 执行批注定位
 */
function executeLocate(annotationId, version) {
    const targetVersion = version || AppState.currentVersion;
    const annotation = annotations.find(a => a.id === annotationId && a.version === targetVersion);
    if (!annotation) return;

    // 发送视图切换请求
    if (annotation.viewType !== currentDrawingType) {
        bus.emit('REQUEST_VIEW_CHANGE', annotation.viewType);
    }

    // 计算变换参数
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const wrapperCenterX = wrapperRect.width / 2;
    const wrapperCenterY = wrapperRect.height / 2;
    const targetScale = 1.5;
    
    const targetTranslateX = wrapperCenterX - annotation.centerX * targetScale;
    const targetTranslateY = wrapperCenterY - annotation.centerY * targetScale;

    // 应用动画
    canvasTransform.style.transition = 'transform 0.5s ease-out';
    updateCanvasState({
        scale: targetScale,
        translateX: targetTranslateX,
        translateY: targetTranslateY
    });
    
    // 触发画布更新
    bus.emit('CANVAS_STATE_CHANGED');

    setTimeout(() => {
        canvasTransform.style.transition = 'transform 0.1s ease-out';
    }, 500);

    setTimeout(() => {
        highlightAnnotation(annotationId, targetVersion, true);
    }, 550);
}

// ============ 全局 API 挂载 ============

/**
 * 切换批注状态
 */
window.toggleAnnotationStatus = function(id, version) {
    const targetVersion = version || AppState.currentVersion;
    const annotation = annotations.find(a => a.id === id && a.version === targetVersion);
    if (!annotation) return;
    
    annotation.status = annotation.status === 'open' ? 'resolved' : 'open';
    
    if (annotation.element) {
        if (annotation.status === 'resolved') {
            annotation.element.classList.add('annotation-resolved');
        } else {
            annotation.element.classList.remove('annotation-resolved');
        }
    }
    
    bus.emit('ANNOTATION_STATUS_CHANGED', annotation);
};

/**
 * 删除批注
 */
window.deleteAnnotation = function(id, version) {
    const targetVersion = version || AppState.currentVersion;
    const index = annotations.findIndex(a => a.id === id && a.version === targetVersion);
    if (index === -1) return;
    
    const annotation = annotations[index];
    
    if (annotation.element && annotation.element.parentNode) {
        annotation.element.parentNode.removeChild(annotation.element);
    }
    
    annotations.splice(index, 1);
    
    let newId = 1;
    annotations.forEach(a => {
        if (a.version === targetVersion) {
            a.id = newId++;
            if (a.element) {
                const badge = a.element.querySelector('.annotation-badge');
                if (badge) {
                    badge.textContent = a.id;
                }
            }
        }
    });
    
    bus.emit('ANNOTATION_DELETED', { id, version: targetVersion });
    
    // 触发反应式更新
    bus.emit('ANNOTATIONS_UPDATED', annotations);
};

/**
 * 定位批注（供外部调用）
 */
window.locateAnnotation = function(annotationId, version) {
    bus.emit('LOCATE_ANNOTATION', { id: annotationId, version });
};

/**
 * 获取当前版本的所有批注（供控制器渲染列表）
 */
export function getAnnotations(version) {
    return annotations.filter(a => a.version === (version || AppState.currentVersion));
}

/**
 * 隐藏气泡（供外部调用）
 */
window.hideAnnotationBubble = hideAnnotationBubble;
