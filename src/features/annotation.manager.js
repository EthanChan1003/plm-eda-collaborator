// ============ V4.6 批注管理器 - 独立模块 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { presetAnnotations } from '../data/mock.data.js';
import { canvasState, updateCanvasState } from '../core/engine.2d.js';

// === 新增：当前登录用户模拟 ===
const CURRENT_USER = '张三';

// 批注数据存储
let annotations = [...presetAnnotations];
window.currentAnnotations = annotations; // === 新增：暴露实时批注数据池 ===

// DOM 引用（延迟初始化）
let canvasWrapper = null;
let canvasTransform = null;
let annotationBubble = null;

// 绘图状态
let isDrawing = false;
let currentAnnotationBox = null;
let drawStartX, drawStartY;
let currentDrawingType = AppState.currentDrawingType || 'schematic';
// === 新增：当前正在绘制的批注形状 ===
let currentAnnotationShape = 'rect';
// === 新增：标志位，防止 IDX 触发的批注与手动绘制冲突 ===
let isIdxTriggeredAnnotation = false;

// === 修改：图钉批注的物理定义 (已整体缩小) ===
const PIN_W = 16; // 图钉 DOM 容器宽度 (从 24 缩小至 16)
const PIN_H = 24; // 图钉 DOM 容器高度 (从 32 缩小至 24)
// 图钉尖端（Tip）相对于 DOM 容器中心点的相对坐标，用于精确定位针尖指向点击处
const PIN_TIP_X_OFFSET = 0;   // 中心对齐 (保持不变)
const PIN_TIP_Y_OFFSET = 12;  // 针尖在 DOM 容器下方 12 单位处 (从 16 相应调整至 12，实现物理对齐)

// 定义图钉的 Ghost 材质 (保持不变)
const MAT_GHOST_PIN = new THREE.MeshPhongMaterial({ color: '#f59e0b', transparent: true, opacity: 0.5 });

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
        // 更新跨视图预警
        updateCrossViewWarnings();
    });

    // 监听定位请求
    bus.on('LOCATE_ANNOTATION', ({ id, version }) => {
        executeLocate(id, version);
    });

    // === 新增：监听全局批注显隐信号 ===
    bus.on('TOGGLE_ANNOTATIONS_VISIBILITY', (isVisible) => {
        console.log('[DEBUG] TOGGLE_ANNOTATIONS_VISIBILITY:', isVisible);
        document.querySelectorAll('.annotations-container').forEach(container => {
            container.style.display = isVisible ? '' : 'none';
            console.log('[DEBUG] Container display set to:', isVisible ? 'visible' : 'none');
        });
        
        // 如果隐藏了批注，同时隐藏正在展示的弹窗气泡
        if (!isVisible) {
            hideAnnotationBubble();
        }
    });

    // 监听视图切换
    bus.on('VIEW_CHANGED', (viewType) => {
        currentDrawingType = viewType;
        // 延迟更新跨视图预警，确保 DOM 已更新
        setTimeout(() => {
            updateCrossViewWarnings();
        }, 100);
    });
    
    // === 新增：监听形状切换 ===
    bus.on('ANNOTATION_SHAPE_CHANGED', (shape) => {
        currentAnnotationShape = shape;
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

    // === 核心联动：监听 IDX 固化信号，级联关闭关联的批注 ===
    bus.on('CASCADE_RESOLVE_ANNOTATIONS', (linkedTxId) => {
        let resolvedCount = 0;
        
        // 遍历所有数据，将挂载在该 IDX 提议下的 Open 批注全部设为 Resolved
        annotations.forEach(annotation => {
            if (annotation.linkedIdxId === linkedTxId && annotation.status === 'open') {
                annotation.status = 'resolved';
                resolvedCount++;
                
                // === 核心修复 4：直接操作图钉 DOM，瞬间变灰 ===
                if (annotation.element) {
                    annotation.element.classList.add('annotation-resolved');
                    // 如果是图钉，把里面的红色 SVG 改成灰色
                    if (annotation.shape === 'pin') {
                        const svgElement = annotation.element.querySelector('svg');
                        if (svgElement) {
                            svgElement.classList.remove('text-red-600');
                            svgElement.classList.add('text-gray-400');
                        }
                    }
                }
                
                // 可选：在批注历史中追加一条系统日志
                if (!annotation.replies) annotation.replies = [];
                annotation.replies.push({
                    author: '系统 (System)',
                    text: '关联的 IDX 提议已被本地 ECAD 同步固化，此讨论自动关闭。',
                    time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                });
            }
        });

        if (resolvedCount > 0) {
            console.log(`[联动触发] 已自动关闭 ${resolvedCount} 条关联批注`);
            // 1. 重新渲染画布上的批注图标（红色图钉会变成灰色圆角状态）
            renderPresetAnnotations();
            // 2. 如果批注侧边栏处于打开状态，广播信号让其刷新列表
            bus.emit('ANNOTATIONS_UPDATED');
        }
    });

    // === 新增联动：基于 targetRef 级联关闭关联批注（接受提议专用） ===
    bus.on('CASCADE_RESOLVE_ANNOTATIONS_BY_REF', (targetRef) => {
        console.log(`[批注管理器] 收到基于 targetRef 的级联闭环事件: ${targetRef}`);
        let resolvedCount = 0;
        
        // 遍历所有数据，找到绑定在该 targetRef 下且状态为 open 的批注
        annotations.forEach(annotation => {
            if (annotation.targetRef === targetRef && annotation.status === 'open') {
                annotation.status = 'resolved';
                resolvedCount++;
                
                // 直接操作图钉 DOM，瞬间变灰
                if (annotation.element) {
                    annotation.element.classList.add('annotation-resolved');
                    // 如果是图钉，把里面的红色 SVG 改成灰色
                    if (annotation.shape === 'pin') {
                        const svgElement = annotation.element.querySelector('svg');
                        if (svgElement) {
                            svgElement.classList.remove('text-red-600');
                            svgElement.classList.add('text-gray-400');
                        }
                    }
                }
                
                // 在批注历史中追加一条系统日志
                if (!annotation.replies) annotation.replies = [];
                annotation.replies.push({
                    author: '系统 (System)',
                    text: '关联的 IDX 提议已被本地 ECAD 同步固化，此讨论自动关闭。',
                    time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                });
            }
        });

        if (resolvedCount > 0) {
            console.log(`[联动触发] 已基于 targetRef=${targetRef} 自动关闭 ${resolvedCount} 条批注`);
            // 刷新视图
            bus.emit('ANNOTATIONS_UPDATED');
        }
    });

    // === 核心修复 2：接收 IDX 的指令，自动在目标位置生成图钉并弹出输入框 ===
    bus.on('AUTO_ADD_IDX_ANNOTATION', ({ targetRef, txId, detailId, x, y }) => {
        console.log('[DEBUG] AUTO_ADD_IDX_ANNOTATION received:', { targetRef, txId, detailId, x, y });
        bus.emit('FORCE_ANNOTATIONS_VISIBLE');
        
        // 暂存外键，供用户点击"保存"时读取
        // === Bug 修复：使用 detailId 作为关联键，而不是 txId ===
        // detailId 是每条建议的唯一标识符，这样可以精确匹配到特定的那条建议
        AppState.pendingLinkedIdxId = detailId;
        currentAnnotationShape = 'pin';
        // === 核心修复：设置标志位，防止 mouseup 处理器重复创建批注 ===
        isIdxTriggeredAnnotation = true;
        
        console.log('[DEBUG] Current state before creating pin:', {
            currentDrawingType,
            currentAnnotationShape,
            AppState_pendingLinkedIdxId: AppState.pendingLinkedIdxId
        });
        
        // 1. 自动生成图钉 DOM
        const pin = document.createElement('div');
        pin.className = 'annotation-box annotation-pin';
        const finalW = PIN_W; const finalH = PIN_H;
        pin.style.width = finalW + 'px';
        pin.style.height = finalH + 'px';
        pin.style.left = (x - finalW/2) + 'px';
        pin.style.top = (y - (finalH/2 + PIN_TIP_Y_OFFSET)) + 'px';
        pin.style.border = 'none';
        pin.style.background = 'none';
        pin.innerHTML = `<svg viewBox="0 0 24 32" class="w-full h-full text-red-600 transition-transform"><path d="M12 0C5.37 0 0 5.37 0 12c0 8.84 10.4 19.17 11.13 19.89.47.47 1.25.47 1.73 0C13.6 31.17 24 20.84 24 12c0-6.63-5.37-12-12-12zm0 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" fill="currentColor"/></svg>`;
        
        // === 核心修复：添加到正确的 annotations-container 容器中 ===
        console.log('[DEBUG] Current drawing type:', currentDrawingType);
        const container = getAnnotationContainer(currentDrawingType);
        console.log('[DEBUG] Container lookup:', { currentDrawingType, container: !!container });
        
        // 调试：检查所有可用的容器
        const schematicContainer = document.querySelector('#canvas-schematic .annotations-container');
        const pcbContainer = document.querySelector('#canvas-pcb .annotations-container');
        console.log('[DEBUG] Available containers:', { 
            schematic: !!schematicContainer, 
            pcb: !!pcbContainer,
            currentType: currentDrawingType
        });
        
        if (container) {
            container.appendChild(pin);
            console.log('[DEBUG] Pin appended to container');
        } else {
            // fallback: 如果找不到容器，仍然添加到 canvas-transform
            const canvasTransform = document.getElementById('canvas-transform');
            console.log('[DEBUG] Fallback to canvas-transform:', !!canvasTransform);
            if (canvasTransform) canvasTransform.appendChild(pin);
        }
        
        // 2. 自动定位镜头到该器件
        const targetScale = 1.8;
        updateCanvasState({ scale: targetScale, translateX: (500 - x) * targetScale, translateY: (400 - y) * targetScale });
        bus.emit('CANVAS_STATE_CHANGED');

        // 3. 弹出输入面板并预填文案
        currentAnnotationBox = pin;
        console.log('[DEBUG] Calling showAnnotationInputPanel');
        showAnnotationInputPanel(pin, targetRef);
        setTimeout(() => {
            const textInput = document.getElementById('annotation-text');
            console.log('[DEBUG] Text input element:', !!textInput);
            if (textInput) {
                textInput.value = `针对 ${targetRef} 的评审意见：`;
                textInput.focus();
            }
        }, 100);
    });

    // === 沙箱控制台事件监听：全局数据重置 ===
    bus.on('GLOBAL_DATA_RESET', () => {
        console.log('[批注管理器] 收到全局数据重置事件');
        
        // 1. 清理画布上所有现有批注DOM
        document.querySelectorAll('.annotations-container').forEach(container => {
            container.innerHTML = '';
        });
        
        // 2. 重新加载原始批注数据
        annotations = [...presetAnnotations];
        window.currentAnnotations = annotations;
        
        // 3. 重新渲染批注
        renderPresetAnnotations();
        
        // 4. 更新跨视图预警
        updateCrossViewWarnings();
        
        console.log('[批注管理器] 批注数据已重置');
    });

    // 绑定绘图事件
    bindDrawingEvents();

    // 渲染预置批注
    renderPresetAnnotations();
    window.currentAnnotations = annotations; // === 新增同步 ===
    
    // 初始更新跨视图预警
    updateCrossViewWarnings();

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
        // === 核心修复 2：真实坐标必须除以当前的缩放倍数 ===
        x: (clientX - rect.left) / canvasState.scale,
        y: (clientY - rect.top) / canvasState.scale
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

        // === 核心修复：阻止浏览器默认行为，彻底根除"禁止拖拽符号"和 mouseup 丢失问题 ===
        e.preventDefault();

        isDrawing = true;

        const coords = getCanvasLocalCoordinates(e.clientX, e.clientY);
        drawStartX = coords.x;
        drawStartY = coords.y;

        currentAnnotationBox = document.createElement('div');
        currentAnnotationBox.className = 'annotation-box';

        // === 核心新增：如果是圆形模式，添加完全圆角的 CSS 类 ===
        if (currentAnnotationShape === 'circle') {
            currentAnnotationBox.classList.add('rounded-full');
        }

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
        
        // === 核心修复：如果是 IDX 触发的批注，跳过 mouseup 处理，避免重复创建 ===
        if (isIdxTriggeredAnnotation) {
            console.log('[DEBUG] Skipping mouseup handler for IDX-triggered annotation');
            isIdxTriggeredAnnotation = false; // 重置标志
            return;
        }

        // === 核心修复 1：直接从 DOM 读取最终绘制的宽高，防止计算报错中断流程 ===
        const boxWidth = parseInt(currentAnnotationBox.style.width) || 0;
        const boxHeight = parseInt(currentAnnotationBox.style.height) || 0;
        
        let isValid = false;
        
        if (currentAnnotationShape === 'pin') {
            // == 场景 A: 图钉模式 ==
            isValid = true; // 图钉模式无需拖拽，跳过 20px 的尺寸校验
            
            const finalW = PIN_W;
            const finalH = PIN_H;
            currentAnnotationBox.style.width = finalW + 'px';
            currentAnnotationBox.style.height = finalH + 'px';
            
            // 调整定位：让图钉的"针尖"对齐到鼠标按下的起始点
            currentAnnotationBox.style.left = (drawStartX - finalW/2) + 'px';
            currentAnnotationBox.style.top = (drawStartY - (finalH/2 + PIN_TIP_Y_OFFSET)) + 'px';
            
            currentAnnotationBox.classList.add('annotation-pin');
            currentAnnotationBox.style.border = 'none';
            currentAnnotationBox.style.background = 'none';
            currentAnnotationBox.innerHTML = `
                <svg viewBox="0 0 24 32" class="w-full h-full text-red-600 transition-transform duration-150 hover:scale-110">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 8.84 10.4 19.17 11.13 19.89.47.47 1.25.47 1.73 0C13.6 31.17 24 20.84 24 12c0-6.63-5.37-12-12-12zm0 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" fill="currentColor"/>
                </svg>
            `;
        } else {
            // == 场景 B: 框选模式 (矩形/圆形) ==
            // === 核心修复 2：严格校验，长和宽都必须大于 20px 才能生成框 ===
            if (boxWidth >= 20 && boxHeight >= 20) {
                isValid = true;
            }
        }
        
        // === 统一的生命周期处理，保证 DOM 不残留 ===
        if (isValid) {
            isDrawing = false;
            
            // === 核心修复 2：DOM 穿透防遮挡 (修复框选坐标偏移 Bug) ===
            // 区分不同工具的取点策略：
            // 1. 若为图钉，直接使用点击坐标
            // 2. 若为框选，必须计算DOM框的屏幕几何中心，因为鼠标抬起点通常在器件外部的空白处
            let targetX = e.clientX;
            let targetY = e.clientY;
            
            if (currentAnnotationShape !== 'pin') {
                const boxRect = currentAnnotationBox.getBoundingClientRect();
                targetX = boxRect.left + boxRect.width / 2;
                targetY = boxRect.top + boxRect.height / 2;
            }
            
            // 1. 瞬间隐藏刚画好的批注框，防止它遮挡射线
            if (currentAnnotationBox) {
                currentAnnotationBox.style.display = 'none';
            }
            
            // 2. 用修正后的目标中心点穿透获取元素
            const elementsUnderTarget = document.elementsFromPoint(targetX, targetY);
            
            // 3. 恢复批注框显示
            if (currentAnnotationBox) {
                currentAnnotationBox.style.display = '';
            }

            // 4. 向上遍历寻找具有 data-ref 的 SVG 元器件节点
            let targetRef = null;
            for (const el of elementsUnderTarget) {
                const comp = el.closest ? el.closest('[data-ref]') : null;
                if (comp) {
                    targetRef = comp.getAttribute('data-ref');
                    break; // 找到了就立刻跳出
                }
            }
            
            console.log('[DEBUG] 穿透中心点(', targetX, ',', targetY, ') 捕获到的底层器件:', targetRef);

            // 弹出输入面板，并将 targetRef 传递过去
            showAnnotationInputPanel(currentAnnotationBox, targetRef);
            // 发送事件通知控制器
            bus.emit('ANNOTATION_DRAWN');
        } else {
            // 校验失败（比如用户在框选模式下只是单纯点了一下没拖拽），彻底清理临时框
            currentAnnotationBox.remove();
            currentAnnotationBox = null;
            isDrawing = false;
        }
    });
}

/**
 * 显示批注输入面板
 */
function showAnnotationInputPanel(annotationBox, targetRef = null) {
    console.log('[DEBUG] showAnnotationInputPanel called with: ', { 
        annotationBox: !!annotationBox,
        canvasWrapper: !!canvasWrapper
    });
    
    // === 核心修复：防止重复创建输入面板 ===
    const existingPanel = canvasWrapper?.querySelector('.annotation-input-panel');
    if (existingPanel) {
        console.log('[DEBUG] Removing existing input panel before creating new one');
        existingPanel.remove();
    }
    
    if (!annotationBox || !canvasWrapper) {
        console.error('[ERROR] Missing required elements for showAnnotationInputPanel');
        return;
    }
    
    const rect = annotationBox.getBoundingClientRect();
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    
    console.log('[DEBUG] Element positions:', { 
        annotationBox_rect: rect,
        canvasWrapper_rect: wrapperRect
    });

    const panel = document.createElement('div');
    // 增加 z-50 确保面板在最上层
    panel.className = 'annotation-input-panel absolute z-50';

    // === 核心修复 3：基于浏览器视口精确计算弹出面板位置 ===
    const panelLeft = rect.right + 10 - wrapperRect.left;
    const panelTop = rect.top - wrapperRect.top;

    panel.style.left = panelLeft + 'px';
    panel.style.top = panelTop + 'px';
    // =================================================
    panel.innerHTML = `
        <div class="text-xs font-bold text-gray-700 mb-2">添加评审意见</div>
        <textarea id="annotation-text" class="w-full h-20 px-2 py-1.5 border border-gray-200 rounded text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="请输入评审意见..."></textarea>
        <div class="flex justify-end space-x-2 mt-2">
            <button id="annotation-cancel" class="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors">取消</button>
            <button id="annotation-save" class="px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors">保存</button>
        </div>
    `;

    canvasWrapper.appendChild(panel);
    console.log('[DEBUG] Input panel appended to canvasWrapper');

    setTimeout(() => {
        const textInput = panel.querySelector('#annotation-text');
        console.log('[DEBUG] Text input in panel:', !!textInput);
        if (textInput) textInput.focus();
    }, 10);

    panel.querySelector('#annotation-cancel').addEventListener('click', () => {
        annotationBox.remove();
        panel.remove();
    });

    // === 核心修复：引入带视觉反馈的必填性校验 ===
    const textInput = panel.querySelector('#annotation-text');

    panel.querySelector('#annotation-save').addEventListener('click', () => {
        const text = textInput.value.trim();

        if (text) {
            // 校验通过：传入 targetRef
            saveAnnotation(annotationBox, text, targetRef);
            panel.remove();
        } else {
            // 校验失败：拦截保存，输入框标红并聚焦
            textInput.classList.remove('border-gray-200');
            textInput.classList.add('border-red-500', 'ring-red-500');
            textInput.placeholder = '评审意见不能为空！';
            textInput.focus();

            // 如果全局 Toast 存在，也可以在此处调用抛出提示 (可选)
            if (window.showToast) {
                window.showToast('请输入评审意见后再保存', 'warning');
            }
        }
    });

    // 体验优化：当用户重新开始输入时，自动清除红色警告样式
    textInput.addEventListener('input', () => {
        textInput.classList.remove('border-red-500', 'ring-red-500');
        textInput.classList.add('border-gray-200');
        textInput.placeholder = '请输入评审意见...';
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
function saveAnnotation(annotationBox, text, targetRef = null) {
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
        time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        author: CURRENT_USER, // 替换原来的硬编码
        element: annotationBox,
        viewType: currentDrawingType,
        centerX: boxLeft + boxWidth / 2,
        centerY: boxTop + boxHeight / 2,
        status: 'open',
        version: AppState.currentVersion,
        // === 新增：记录当前批注的形状 ===
        shape: currentAnnotationShape,
        // === 核心修复 4：将暂存的外键死死绑定到这条数据上 ===
        linkedIdxId: AppState.pendingLinkedIdxId || null,
        // 【核心新增】：数据层关联到元器件与多轮对话支持
        targetRef: targetRef || (AppState.pendingLinkedIdxId ? '联动器件' : null), 
        // === 核心修复 3：初始化为空数组，防止后续 push 报错 ===
        replies: [] 
    };
    
    // 用完即清理暂存状态
    AppState.pendingLinkedIdxId = null;
    annotations.push(annotationData);

    annotationBox.addEventListener('click', (e) => {
        e.stopPropagation();
        highlightAnnotation(annotationId);
    });

    // 通知控制器更新批注列表
    bus.emit('ANNOTATION_SAVED', annotationData);
    
    // === 核心修复 3：通知 IDX 面板，有新批注加入了，请刷新探讨数量！ ===
    bus.emit('ANNOTATIONS_UPDATED');
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
 * 显示批注气泡（支持多轮对话）
 */
function showAnnotationBubble(annotationId, version) {
    const targetVersion = version || AppState.currentVersion;
    const annotation = annotations.find(a => a.id === annotationId && a.version === targetVersion);
    if (!annotation || !annotation.element || !annotationBubble) return;

    const rect = annotation.element.getBoundingClientRect();
    annotationBubble.style.left = (rect.right + 10) + 'px';
    annotationBubble.style.top = rect.top + 'px';

    const authorInitial = (annotation.author || '系').charAt(0);
    const targetBadge = annotation.targetRef ? `<span class="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] rounded font-mono border border-blue-200"><i class="fas fa-link mr-1"></i>${annotation.targetRef}</span>` : '';

    // 构建历史回复列表 HTML (支持嵌套树形渲染)
    let repliesHtml = '';
    if (annotation.replies && annotation.replies.length > 0) {
        repliesHtml = '<div class="mt-3 space-y-1.5 border-t border-gray-100 pt-2 max-h-48 overflow-y-auto custom-scrollbar">';
        
        // 递归渲染函数
        const renderReplyTree = (parentId, depth = 0) => {
            const children = annotation.replies.filter(r => (r.parentId || null) === parentId);
            children.forEach(reply => {
                // 为了兼容老数据，如果没有 replyId 则动态生成一个临时 ID
                if (!reply.replyId) reply.replyId = generateReplyId();
                
                // 限制最大缩进层级为 3，防止 UI 溢出
                const indentClass = depth > 0 ? `ml-${Math.min(depth * 4, 12)} border-l-2 border-gray-200 pl-2` : 'bg-gray-50 p-2 rounded';
                const deleteBtnHtml = reply.author === CURRENT_USER 
                    ? `<button class="text-gray-400 hover:text-red-500 transition-colors delete-reply-btn" data-reply-id="${reply.replyId}" title="删除此回复及跟帖"><i class="fas fa-trash"></i></button>` 
                    : '';

                repliesHtml += `
                    <div class="text-xs ${indentClass} group relative">
                        <div class="flex justify-between items-center text-[10px] text-gray-500 mb-1">
                            <span class="font-bold text-gray-700">${reply.author}</span>
                            <div class="flex items-center space-x-2">
                                <span>${reply.time}</span>
                                <button class="text-gray-400 hover:text-blue-500 transition-colors reply-to-btn" data-reply-id="${reply.replyId}" data-author="${reply.author}" title="回复 Ta"><i class="fas fa-reply"></i></button>
                                ${deleteBtnHtml}
                            </div>
                        </div>
                        <div class="text-gray-700 break-words leading-relaxed">${reply.text}</div>
                    </div>
                `;
                // 递归渲染子节点
                renderReplyTree(reply.replyId, depth + 1);
            });
        };
        
        // 从根节点(parentId = null)开始渲染
        renderReplyTree(null, 0);
        repliesHtml += '</div>';
    }

    // 组装整体气泡
    annotationBubble.innerHTML = `
        <div class="w-64">
            <div class="flex items-start justify-between mb-2">
                <div class="flex items-center">
                    <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold mr-2">${authorInitial}</div>
                    <div>
                        <div class="flex items-center text-xs font-medium text-gray-900">
                            ${annotation.author || '系统'} ${targetBadge}
                        </div>
                        <div class="text-[10px] text-gray-500">${annotation.time}</div>
                    </div>
                </div>
                <button id="close-bubble" class="text-gray-400 hover:text-gray-600 transition-colors ml-2">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
            
            <div class="text-sm text-gray-700 leading-relaxed font-medium">${annotation.text}</div>
            
            ${repliesHtml}
            
            <div class="mt-3 flex gap-2">
                <input type="text" id="reply-input-${annotation.id}" class="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500" placeholder="回复此批注...">
                <button id="reply-btn-${annotation.id}" class="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 transition">发送</button>
            </div>
        </div>
    `;

    // 绑定关闭事件
    annotationBubble.querySelector('#close-bubble').addEventListener('click', hideAnnotationBubble);

    // 绑定回复发送事件
    const replyInput = annotationBubble.querySelector(`#reply-input-${annotation.id}`);
    const replyBtn = annotationBubble.querySelector(`#reply-btn-${annotation.id}`);
    
    // 局部状态：当前正在回复的目标 ID，如果为 null 则是回复主批注
    let activeParentId = null; 

    // 绑定：点击特定回复的“回复”按钮
    annotationBubble.querySelectorAll('.reply-to-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            activeParentId = e.currentTarget.getAttribute('data-reply-id');
            const author = e.currentTarget.getAttribute('data-author');
            replyInput.placeholder = `回复 @${author}：`;
            replyInput.focus();
        });
    });

    // 绑定：点击删除按钮 (级联删除)
    annotationBubble.querySelectorAll('.delete-reply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetReplyId = e.currentTarget.getAttribute('data-reply-id');
            if(confirm('确定要删除这条回复及其下的所有回复吗？')) {
                deleteReplyAndChildren(annotation, targetReplyId);
                showAnnotationBubble(annotationId, version); // 重新渲染气泡
                bus.emit('ANNOTATIONS_UPDATED'); // 通知侧边栏更新统计
            }
        });
    });

    const submitReply = () => {
        const text = replyInput.value.trim();
        if (text) {
            if (!annotation.replies) annotation.replies = [];
            
            annotation.replies.push({
                replyId: generateReplyId(),
                parentId: activeParentId, // 绑定父节点
                author: CURRENT_USER,
                text: text,
                time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            });
            
            showAnnotationBubble(annotationId, version);
            bus.emit('ANNOTATIONS_UPDATED');
        }
    };

    replyBtn.addEventListener('click', submitReply);
    replyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitReply();
    });
    // 支持按 Esc 取消特定回复状态
    replyInput.addEventListener('keyup', (e) => {
        if (e.key === 'Escape') {
            activeParentId = null;
            replyInput.placeholder = '回复此批注...';
        }
    });

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
 * 生成唯一的回复 ID
 */
function generateReplyId() {
    return 'reply_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

/**
 * 递归删除回复及其所有子回复
 */
function deleteReplyAndChildren(annotation, replyId) {
    if (!annotation.replies) return;
    // 找到所有以该 replyId 为父节点的子回复，递归删除
    const children = annotation.replies.filter(r => r.parentId === replyId);
    children.forEach(child => {
        deleteReplyAndChildren(annotation, child.replyId);
    });
    // 删除自身
    annotation.replies = annotation.replies.filter(r => r.replyId !== replyId);
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

        // === 新增：如果是圆形历史数据，恢复其圆角外观 ===
        if (annotation.shape === 'circle') {
            annotationBox.classList.add('rounded-full');
        }

        // === 核心修复：如果是图钉数据，恢复其特殊外观，不要使用边框拉伸框样式 ===
        if (annotation.shape === 'pin') {
            annotationBox.classList.add('annotation-pin');
            // 移除默认的边框和背景色
            annotationBox.style.border = 'none';
            annotationBox.style.background = 'none';
            // 注入图钉图标 (这里使用 SVG 以获得更精准的定位和更好的视觉效果)
            annotationBox.innerHTML = `
                <svg viewBox="0 0 24 32" class="w-full h-full text-red-600">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 8.84 10.4 19.17 11.13 19.89.47.47 1.25.47 1.73 0C13.6 31.17 24 20.84 24 12c0-6.63-5.37-12-12-12zm0 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" fill="currentColor"/>
                </svg>
            `;
            
            // === 关键修复：使用正确的图钉尺寸 ===
            annotationBox.style.width = PIN_W + 'px';
            annotationBox.style.height = PIN_H + 'px';
            // 正确的定位：让图钉针尖对齐到指定的中心点
            annotationBox.style.left = (annotation.centerX - PIN_W/2) + 'px';
            annotationBox.style.top = (annotation.centerY - PIN_H/2 - PIN_TIP_Y_OFFSET) + 'px';
        } else {
            // 非图钉形状使用原来的尺寸
            annotationBox.style.left = (annotation.centerX - 40) + 'px';
            annotationBox.style.top = (annotation.centerY - 30) + 'px';
            annotationBox.style.width = '80px';
            annotationBox.style.height = '60px';
        }

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

    // === 核心防呆：如果是从侧边栏等外部发起的定位，必须强制开启批注显示 ===
    bus.emit('FORCE_ANNOTATIONS_VISIBLE');

    // 发送视图切换请求
    if (annotation.viewType !== currentDrawingType) {
        bus.emit('REQUEST_VIEW_CHANGE', annotation.viewType);
    }

    // 计算变换参数
    const targetScale = 1.5;

    // === 核心修复 4：修复定位算法，基准是画布正中心 (500, 400) ===
    const targetTranslateX = (500 - annotation.centerX) * targetScale;
    const targetTranslateY = (400 - annotation.centerY) * targetScale;

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
            // 如果是图钉，把里面的红色 SVG 改成灰色
            if (annotation.shape === 'pin') {
                const svgElement = annotation.element.querySelector('svg');
                if (svgElement) {
                    svgElement.classList.remove('text-red-600');
                    svgElement.classList.add('text-gray-400');
                }
            }
        } else {
            annotation.element.classList.remove('annotation-resolved');
            // 如果是图钉，把里面的灰色 SVG 改回红色
            if (annotation.shape === 'pin') {
                const svgElement = annotation.element.querySelector('svg');
                if (svgElement) {
                    svgElement.classList.remove('text-gray-400');
                    svgElement.classList.add('text-red-600');
                }
            }
        }
    }
    
    bus.emit('ANNOTATION_STATUS_CHANGED', annotation);
    
    // 更新跨视图预警（解决问题后红灯应熄灭/开启）
    updateCrossViewWarnings();
    
    // 触发反应式更新
    bus.emit('ANNOTATIONS_UPDATED', annotations);
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
 * 更新跨视图预警系统
 * 为在当前视图中、但批注创建于另一个视图的器件添加警告样式
 */
function updateCrossViewWarnings() {
    // 1. 清除当前画布中所有预警状态
    document.querySelectorAll('.cross-view-warning').forEach(el => {
        el.classList.remove('cross-view-warning');
    });

    // 2. 筛选跨视图的未解决批注
    // 条件：当前版本 + 未解决状态 + 在另一个视图中创建
    const crossViewAnnotations = annotations.filter(a =>
        a.version === AppState.currentVersion &&
        a.status === 'open' &&
        a.viewType !== currentDrawingType
    );

    // 3. 为对应器件添加预警样式
    crossViewAnnotations.forEach(annotation => {
        const targetRef = annotation.targetRef;
        if (!targetRef) return;

        // 在当前激活的画布中查找对应器件
        const components = document.querySelectorAll(`#canvas-${currentDrawingType} .eda-component[data-ref="${targetRef}"]`);
        components.forEach(comp => {
            comp.classList.add('cross-view-warning');
        });
    });
}

/**
 * 隐藏气泡（供外部调用）
 */
window.hideAnnotationBubble = hideAnnotationBubble;
