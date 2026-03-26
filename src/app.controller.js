// ============ V4.0 ES6 模块引入与状态桥接 ============
import { AppState } from './core/state.js';
import { bus } from './core/event.bus.js';
import { versionedComponentData, versionDiffLibrary, presetAnnotations } from './data/mock.data.js';
import { canvasState, updateCanvasState } from './core/engine.2d.js';

// 兜底引入拆分出去的功能，防止旧代码报错
import * as Mcad3D from './features/mcad.3d.js';
import * as ExportPdf from './features/export.pdf.js';

// 建立局部变量映射，修复重构导致的上下文变量丢失
let currentDrawingType = AppState.currentDrawingType;
let currentTab = AppState.currentTab;
const ToolMode = { SELECT: 'SELECT', PAN: 'PAN', ANNOTATE: 'ANNOTATE' };
let currentToolMode = ToolMode.SELECT;

// 1. 恢复之前 config.data.js 中被删掉的动态数据变量
let mockComponentData = { ...versionedComponentData[AppState.currentVersion] };
let mockDiffData = {};

// 挂载到 window 供其他模块访问
window.mockDiffData = mockDiffData;

// 2. 恢复之前 config.data.js 中被删掉的辅助函数
function getCurrentComponentData() {
    return versionedComponentData[AppState.currentVersion] || versionedComponentData['V2.1'];
}
function calculateVersionDiff(currentVersion, compareVersion) {
    const key = `${currentVersion}-vs-${compareVersion}`;
    if (versionDiffLibrary[key]) {
        mockDiffData = { ...versionDiffLibrary[key] };
        window.mockDiffData = mockDiffData; // 同步到 window
        return true;
    }
    mockDiffData = {};
    window.mockDiffData = mockDiffData; // 同步到 window
    return false;
}

// ============ 原有业务逻辑向下顺延 ============
// 业务逻辑控制器
// 依赖：config.data.js 和 core.engine.js

document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabTitle = document.getElementById('tab-title');
    const tabContent = document.getElementById('tab-content');
    
    const panelTopSearch = document.getElementById('panel-top-search');
    const panelTopDiff = document.getElementById('panel-top-diff');
    const panelBottomNotes = document.getElementById('panel-bottom-notes');

    const canvasContainer = document.getElementById('canvas-container');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const canvasTransform = document.getElementById('canvas-transform');
    const canvasSchematic = document.getElementById('canvas-schematic');
    const canvasPcb = document.getElementById('canvas-pcb');

    const btnSchematic = document.getElementById('btn-schematic');
    const btnPcb = document.getElementById('btn-pcb');

    const popover = document.getElementById('comp-property-popover');
    const popoverClose = document.getElementById('popover-close');

    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-dropdown');

    // 工具栏按钮
    const toolSelect = document.getElementById('tool-select');
    const toolPan = document.getElementById('tool-pan');
    const toolRect = document.getElementById('tool-rect');
    const toolZoomIn = document.getElementById('tool-zoom-in');
    const toolZoomOut = document.getElementById('tool-zoom-out');
    const toolReset = document.getElementById('tool-reset');
    const toolSplitView = document.getElementById('tool-split-view');

    // 2D/3D 分屏容器
    const view2dContainer = document.getElementById('view-2d-container');
    const view3dContainer = document.getElementById('view-3d-container');
    let isSplitViewActive = false;

    // Three.js 引擎变量
    let scene, camera, renderer, controls;
    let isThreeInitialized = false;

    // 全局版本选择器
    const globalVersionSelect = document.getElementById('global-version-select');
    const versionCompareSelect = document.getElementById('version-compare');

    // 气泡元素
    const annotationBubble = document.getElementById('annotation-bubble');
    const bubbleContent = document.getElementById('bubble-content');
    const closeBubbleBtn = document.getElementById('close-bubble');

    // ============ 新增：PCB 图层状态机 ============
    let pcbLayerState = {
        top: true,
        bottom: true,
        silkscreen: true
    };

    // 暴露到全局，以便重新渲染 UI 时调用
    window.togglePcbLayer = function(layerName, isVisible) {
        pcbLayerState[layerName] = isVisible;
        const group = document.getElementById(`pcb-layer-${layerName}`);
        if (group) {
            // 使用 opacity 保证过渡平滑，pointerEvents 防止隐藏层遮挡点击
            group.style.opacity = isVisible ? '1' : '0';
            group.style.pointerEvents = isVisible ? 'auto' : 'none';
        }
    };

    // ============ 批注权限控制 ============
    function updateAnnotationPermissions() {
        const isLatest = AppState.currentVersion === AppState.latestVersion;
        // 禁用/启用批注按钮
        if (toolRect) {
            toolRect.disabled = !isLatest;
        }
    }

    // ============ 全局版本切换 ============
    function switchGlobalVersion(newVersion) {
        AppState.currentVersion = newVersion;
        // 强制更新全局的器件数据池
        mockComponentData = { ...versionedComponentData[AppState.currentVersion] };

        // 1. 同步画布图元显示/隐藏
        syncCanvasComponents();

        // 2. 切换批注显示/隐藏（只根据版本过滤）- 只操作画布DOM，不触碰左侧面板
        annotations.forEach(annotation => {
            if (annotation.element) {
                // 【修复】移除 annotation.viewType === currentDrawingType 的判断
                // 因为画布自身的隐藏/显示会自然控制其内部批注的可见性
                const shouldShow = annotation.version === AppState.currentVersion;
                annotation.element.style.display = shouldShow ? '' : 'none';
            }
        });

        // 3. 根据当前激活的页签，通知 Sidebar 刷新对应内容
        bus.emit('TAB_CHANGED', currentTab);
        
        // Diff 页签需要额外处理高亮
        if (currentTab === 'diff') {
            applyDiffHighlight();
        }

        // 4. 更新权限
        updateAnnotationPermissions();

        // 5. 更新对比版本下拉框选项（排除当前版本）
        updateCompareVersionOptions();
    }

    // 同步画布图元显示状态
    function syncCanvasComponents() {
        const currentData = getCurrentComponentData();
        const allRefs = ['U1', 'U2', 'R1', 'R2', 'R3', 'C1', 'C2', 'C3', 'C4', 'Y1', 'D1', 'J1'];

        allRefs.forEach(ref => {
            const components = document.querySelectorAll(`.eda-component[data-ref="${ref}"]`);
            const existsInVersion = ref in currentData;

            components.forEach(comp => {
                if (existsInVersion) {
                    comp.style.display = '';
                    // V2.1 中 Y1 位置移动
                    if (ref === 'Y1' && AppState.currentVersion === 'V2.1') {
                        // 移动后的坐标
                        if (comp.closest('#canvas-schematic')) {
                            comp.setAttribute('transform', 'translate(-20, 0)');
                        } else if (comp.closest('#canvas-pcb')) {
                            comp.setAttribute('transform', 'translate(-20, 0)');
                        }
                    } else if (ref === 'Y1') {
                        comp.setAttribute('transform', '');
                    }
                } else {
                    comp.style.display = 'none';
                }
            });
        });
    }

    // 版本比较辅助函数：将 'V2.1' 转换为数值 2.1
    function parseVersion(v) {
        return parseFloat(v.replace('V', ''));
    }

    // 初始化全局版本下拉框（降序排列 + 最新标记）
    function initGlobalVersionSelect() {
        if (!globalVersionSelect) return;
        const allVersions = ['V1.0', 'V2.0', 'V2.1'];
        const currentVal = globalVersionSelect.value || AppState.currentVersion;

        globalVersionSelect.innerHTML = allVersions
            .sort((a, b) => parseVersion(b) - parseVersion(a)) // 降序排列
            .map(v => {
                const isLatest = v === AppState.latestVersion;
                const label = isLatest ? `${v} 最新` : v;
                return `<option value="${v}" ${v === currentVal ? 'selected' : ''}>${label}</option>`;
            })
            .join('');
    }

    // 更新对比版本下拉框选项（只显示比当前版本更低的历史版本，降序排列）
    function updateCompareVersionOptions() {
        if (!versionCompareSelect) return;
        const currentVersionNum = parseVersion(AppState.currentVersion);
        const allVersions = ['V1.0', 'V2.0', 'V2.1'];

        // 过滤：只保留比当前版本更低的版本
        const lowerVersions = allVersions.filter(v => parseVersion(v) < currentVersionNum);

        if (lowerVersions.length === 0) {
            // 当前已是最低版本，显示空状态
            versionCompareSelect.innerHTML = '<option value="" disabled selected>无历史版本</option>';
            versionCompareSelect.disabled = true;
        } else {
            const currentVal = versionCompareSelect.value;
            versionCompareSelect.disabled = false;
            versionCompareSelect.innerHTML = lowerVersions
                .sort((a, b) => parseVersion(b) - parseVersion(a)) // 降序排列
                .map(v => `<option value="${v}" ${v === currentVal ? 'selected' : ''}>${v}</option>`)
                .join('');
            
            // 【关键修复】如果当前没有选中的对比版本，默认选第一个（最新的历史版本）
            if (!versionCompareSelect.value) {
                versionCompareSelect.value = lowerVersions[0];
            }
            // 【关键修复】更新下拉框后，立即计算一次差异
            calculateVersionDiff(AppState.currentVersion, versionCompareSelect.value);
        }
    }

    // 全局版本选择器事件
    if (globalVersionSelect) {
        globalVersionSelect.addEventListener('change', (e) => {
            // 清理动作：隐藏气泡
            hideAnnotationBubble();
            switchGlobalVersion(e.target.value);
        });
    }

    // 对比版本选择器事件
    if (versionCompareSelect) {
        versionCompareSelect.addEventListener('change', () => {
            const compareVersion = versionCompareSelect.value;
            calculateVersionDiff(AppState.currentVersion, compareVersion);
            bus.emit('TAB_CHANGED', 'diff');
            applyDiffHighlight();
        });
    }

    // ============ 批注气泡系统 ============
    function showAnnotationBubble(annotationId, version) {
        const targetVersion = version || AppState.currentVersion;
        const annotation = annotations.find(a => a.id === annotationId && a.version === targetVersion);
        if (!annotation || !annotation.element) return;

        // 定位气泡
        const rect = annotation.element.getBoundingClientRect();
        const bubbleX = rect.right + 10;
        const bubbleY = rect.top;

        annotationBubble.style.left = bubbleX + 'px';
        annotationBubble.style.top = bubbleY + 'px';

        // 数据防御性降级：提供默认值防止渲染崩溃
        const authorName = annotation.author || '系统预置';
        const authorInitial = authorName.charAt(0);
        const noteTime = annotation.time || '';

        // 填充内容（包含作者信息）
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

        // 重新绑定关闭按钮事件
        const closeBtn = annotationBubble.querySelector('#close-bubble');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideAnnotationBubble);
        }

        // 显示气泡
        annotationBubble.classList.remove('hidden');
    }

    function hideAnnotationBubble() {
        annotationBubble.classList.add('hidden');
    }

    // 关闭气泡按钮
    if (closeBubbleBtn) {
        closeBubbleBtn.addEventListener('click', hideAnnotationBubble);
    }

    // 确保气泡元素存在
    if (!annotationBubble || !bubbleContent) {
        console.warn('Annotation bubble elements not found');
    }

    // 点击画布其他区域隐藏气泡
    if (canvasWrapper) {
        canvasWrapper.addEventListener('click', (e) => {
            if (!e.target.closest('.annotation-box') && !e.target.closest('#annotation-bubble')) {
                hideAnnotationBubble();
            }
        });
    }

    // ============ 工具模式切换 ============
    function setToolMode(mode) {
        // 同步到局部变量和全局状态
        currentToolMode = mode;
        AppState.currentToolMode = mode;
        
        // 同步到 canvasWrapper dataset 供批注管理器读取
        if (canvasWrapper) {
            canvasWrapper.dataset.toolMode = mode;
        }
        
        // 重置所有工具按钮状态
        toolSelect.classList.remove('tool-active');
        toolPan.classList.remove('tool-active');
        toolRect.classList.remove('tool-active');
        
        // 重置光标
        canvasWrapper.classList.remove('cursor-default', 'cursor-grab', 'cursor-crosshair');
        
        switch(mode) {
            case ToolMode.SELECT:
                toolSelect.classList.add('tool-active');
                canvasWrapper.classList.add('cursor-default');
                break;
            case ToolMode.PAN:
                toolPan.classList.add('tool-active');
                canvasWrapper.classList.add('cursor-grab');
                break;
            case ToolMode.ANNOTATE:
                toolRect.classList.add('tool-active');
                canvasWrapper.classList.add('cursor-crosshair');
                break;
        }
    }
    
    // 监听工具模式变化事件
    bus.on('TOOL_MODE_CHANGED', (mode) => {
        setToolMode(mode);
    });

    // 监听视图切换，同步工具栏 UI（修复 3D 按钮消失问题）
    bus.on('VIEW_CHANGED', (viewType) => {
        currentDrawingType = viewType;
        if (toolSplitView) {
            // 仅在 PCB 模式下显示 3D 分屏按钮
            if (viewType === 'pcb') {
                toolSplitView.classList.remove('hidden');
            } else {
                toolSplitView.classList.add('hidden');
                // 如果当前正在分屏模式切换回原理图，需强制关闭分屏
                if (AppState.isSplitViewActive && typeof toggleSplitView === 'function') {
                    toggleSplitView();
                }
            }
        }
    });

    // ============ 批注工具下拉菜单交互 ============
    const annotationMainBtn = document.getElementById('annotation-main-btn');
    const annotationSubMenu = document.getElementById('annotation-sub-menu');

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

    // 工具按钮事件绑定
    // 工具模式切换 - 通过 EventBus 解耦
    if (toolSelect) toolSelect.addEventListener('click', () => bus.emit('TOOL_MODE_CHANGED', ToolMode.SELECT));
    if (toolPan) toolPan.addEventListener('click', () => bus.emit('TOOL_MODE_CHANGED', ToolMode.PAN));
    if (toolRect) {
        toolRect.addEventListener('click', () => {
            bus.emit('TOOL_MODE_CHANGED', ToolMode.ANNOTATE);
            // 点击具体工具后关闭下拉菜单
            if (annotationSubMenu) {
                annotationSubMenu.classList.add('hidden');
            }
        });
    }

    // ============ 画布缩放功能 (V4.0 事件总线驱动) ============
    // 滚轮逻辑已在 engine.2d.js 内部接管，此处只需绑定顶部工具栏按钮
    if (toolZoomIn) toolZoomIn.addEventListener('click', () => bus.emit('ZOOM_IN'));
    if (toolZoomOut) toolZoomOut.addEventListener('click', () => bus.emit('ZOOM_OUT'));
    if (toolReset) toolReset.addEventListener('click', () => bus.emit('ZOOM_RESET'));

    // ============ 画布平移功能 ============
    let isPanning = false;
    let panStartX, panStartY;

    canvasWrapper.addEventListener('mousedown', (e) => {
        if (currentToolMode !== ToolMode.PAN) return;
        if (e.target.closest('.annotation-box') || e.target.closest('.annotation-input-panel')) return;

        isPanning = true;
        panStartX = e.clientX - canvasState.translateX;
        panStartY = e.clientY - canvasState.translateY;
        canvasWrapper.classList.remove('cursor-grab');
        canvasWrapper.classList.add('cursor-grabbing');
    });

    canvasWrapper.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        
        updateCanvasState({
            translateX: e.clientX - panStartX,
            translateY: e.clientY - panStartY
        });
        updateCanvasTransform();
    });

    canvasWrapper.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            canvasWrapper.classList.remove('cursor-grabbing');
            canvasWrapper.classList.add('cursor-grab');
        }
    });

    canvasWrapper.addEventListener('mouseleave', () => {
        if (isPanning) {
            isPanning = false;
            canvasWrapper.classList.remove('cursor-grabbing');
            canvasWrapper.classList.add('cursor-grab');
        }
    });

    // 高亮批注（带气泡联动）
    function highlightAnnotation(annotationId, version, breathing = false) {
        // 清除所有高亮
        document.querySelectorAll('.annotation-box').forEach(box => {
            box.classList.remove('selected', 'breathing');
        });
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.remove('active');
        });

        // 高亮对应批注（使用ID+版本双重校验）
        const targetVersion = version || AppState.currentVersion;
        const annotation = annotations.find(a => a.id === annotationId && a.version === targetVersion);
        if (annotation && annotation.element) {
            annotation.element.classList.add('selected');
            if (breathing) {
                annotation.element.classList.add('breathing');
                // 3秒后移除呼吸动画
                setTimeout(() => {
                    annotation.element.classList.remove('breathing');
                }, 3000);
            }
            const noteItem = document.querySelector(`[data-note-id="${annotationId}"][data-note-version="${targetVersion}"]`);
            if (noteItem) {
                noteItem.classList.add('active');
                noteItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // 显示气泡
            // 【修复】将当前的 targetVersion 传给气泡生成函数
            showAnnotationBubble(annotationId, targetVersion);
        }
    }

    // ============ 批注状态切换功能 ============
    window.toggleAnnotationStatus = function(id, version) {
        // 优先使用传入的版本，否则使用当前版本
        const targetVersion = version || AppState.currentVersion;
        const annotation = annotations.find(a => a.id === id && a.version === targetVersion);
        if (!annotation) return;
        
        // 在 'open' 和 'resolved' 之间切换
        annotation.status = annotation.status === 'open' ? 'resolved' : 'open';
        
        // 更新画布上对应批注框的样式
        if (annotation.element) {
            if (annotation.status === 'resolved') {
                annotation.element.classList.add('annotation-resolved');
            } else {
                annotation.element.classList.remove('annotation-resolved');
            }
        }
        
        // 通知批注列表更新
        bus.emit('ANNOTATIONS_UPDATED');

        // 更新跨视图预警（解决问题后红灯应熄灭）
        updateCrossViewWarnings();
    };

    // ============ 批注删除功能 ============
    window.deleteAnnotation = function(id, version) {
        // 优先使用传入的版本，否则使用当前版本
        const targetVersion = version || AppState.currentVersion;
        const index = annotations.findIndex(a => a.id === id && a.version === targetVersion);
        if (index === -1) return;
        
        const annotation = annotations[index];
        
        // 1. 从 DOM 中移除对应的批注框
        if (annotation.element && annotation.element.parentNode) {
            annotation.element.parentNode.removeChild(annotation.element);
        }
        
        // 2. 从全局数组中移除
        annotations.splice(index, 1);
        
        // 3. 【修复核心】重排同版本下剩余批注的 ID
        let newId = 1;
        annotations.forEach(a => {
            if (a.version === targetVersion) {
                a.id = newId++; // 重新赋予连续的序号
                
                // 同步更新画布上批注框的角标数字
                if (a.element) {
                    const badge = a.element.querySelector('.annotation-badge');
                    if (badge) {
                        badge.textContent = a.id;
                    }
                }
            }
        });
        
        // 4. 通知批注列表更新（列表会读取新的 ID）
        bus.emit('ANNOTATIONS_UPDATED');
    };

    // ============ 跨视图定位功能 ============
    window.locateAnnotation = function(annotationId, version) {
        // 优先使用传入的版本，否则使用当前版本进行双重校验
        const targetVersion = version || AppState.currentVersion;
        const annotation = annotations.find(a => a.id === annotationId && a.version === targetVersion);
        if (!annotation) return;

        // 步骤1：检查视图类型，如果不匹配则切换
        if (annotation.viewType !== currentDrawingType) {
            if (annotation.viewType === 'schematic') {
                switchToSchematic();
            } else {
                switchToPcb();
            }
        }

        // 步骤2：计算变换参数以居中显示批注
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        const wrapperCenterX = wrapperRect.width / 2;
        const wrapperCenterY = wrapperRect.height / 2;

        // 目标缩放比例（可以调整，这里使用1.5倍以便清晰查看）
        const targetScale = 1.5;
        
        // 计算需要的平移量：使批注中心位于画布中心
        const targetTranslateX = wrapperCenterX - annotation.centerX * targetScale;
        const targetTranslateY = wrapperCenterY - annotation.centerY * targetScale;

        // 步骤3：应用平滑过渡动画
        canvasTransform.style.transition = 'transform 0.5s ease-out';
        updateCanvasState({
            scale: targetScale,
            translateX: targetTranslateX,
            translateY: targetTranslateY
        });
        updateCanvasTransform();

        // 恢复快速响应
        setTimeout(() => {
            canvasTransform.style.transition = 'transform 0.1s ease-out';
        }, 500);

        // 步骤4：触发呼吸闪烁动画
        setTimeout(() => {
            // 【修复】正确传递版本号和呼吸灯标记
            highlightAnnotation(annotationId, targetVersion, true);
        }, 550);
    };

    // 切换到原理图视图
    function switchToSchematic() {
        // 清理动作：隐藏气泡
        hideAnnotationBubble();

        currentDrawingType = 'schematic';
        if (btnSchematic) {
            btnSchematic.classList.add('bg-white', 'shadow-sm', 'text-blue-600', 'font-medium');
            btnSchematic.classList.remove('text-gray-500');
        }
        if (btnPcb) {
            btnPcb.classList.remove('bg-white', 'shadow-sm', 'text-blue-600', 'font-medium');
            btnPcb.classList.add('text-gray-500');
        }
        if (canvasSchematic) canvasSchematic.classList.remove('hidden');
        if (canvasPcb) canvasPcb.classList.add('hidden');
        // 通知 Sidebar 刷新
        bus.emit('VIEW_CHANGED', 'schematic');
        bus.emit('TAB_CHANGED', currentTab);
        // 更新跨视图预警
        updateCrossViewWarnings();

        // 隐藏分屏按钮，原理图不支持 3D 视图
        if (toolSplitView) toolSplitView.classList.add('hidden');
        if (isSplitViewActive) toggleSplitView();
    }

    // 切换到PCB视图
    function switchToPcb() {
        // 清理动作：隐藏气泡
        hideAnnotationBubble();

        currentDrawingType = 'pcb';
        if (btnPcb) {
            btnPcb.classList.add('bg-white', 'shadow-sm', 'text-blue-600', 'font-medium');
            btnPcb.classList.remove('text-gray-500');
        }
        if (btnSchematic) {
            btnSchematic.classList.remove('bg-white', 'shadow-sm', 'text-blue-600', 'font-medium');
            btnSchematic.classList.add('text-gray-500');
        }
        if (canvasSchematic) canvasSchematic.classList.add('hidden');
        if (canvasPcb) canvasPcb.classList.remove('hidden');
        // 通知 Sidebar 刷新
        bus.emit('VIEW_CHANGED', 'pcb');
        bus.emit('TAB_CHANGED', currentTab);
        // 更新跨视图预警
        updateCrossViewWarnings();

        // 显示分屏按钮，PCB 视图支持 3D 协同
        if (toolSplitView) toolSplitView.classList.remove('hidden');
    }

    // ============ 真正的 3D 引擎 (Three.js) ============
    function initThreeEngine() {
        if (isThreeInitialized) return;
        
        // 1. 初始化场景
        scene = new THREE.Scene();
        scene.background = new THREE.Color('#1e293b');

        // 2. 初始化相机 (【修复】拉远相机距离，使其与 2D 视角的初始大小完美匹配)
        const width = view3dContainer.clientWidth || 500;
        const height = view3dContainer.clientHeight || 800;
        camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
        camera.position.set(0, -900, 1100); // 调整 Z 轴和 Y 轴，让 900x700 的板子完全居中且大小合适

        // 3. 初始化渲染器
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        // 优化阴影质量
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        view3dContainer.appendChild(renderer.domElement);

        // 4. 添加灯光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); 
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6); 
        dirLight.position.set(200, -200, 600);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // 5. 轨道控制器
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.target.set(0, 0, 0); // 确保镜头始终对准板子中心

        // 6. 绘制 PCB 物理基板
        createPcbBoard();
        
        // 【新增】7. 绘制具有物理高度的 3D 元器件
        createComponents();
        
        // 【新增】8. 动态解析并生成 3D 走线网络
        createTraces();

        // 9. 渲染循环
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // 8. 【修复核心】使用 ResizeObserver 实时监听容器变化，彻底告别拉伸变形
        const resizeObserver = new ResizeObserver(entries => {
            if (!isSplitViewActive || !camera || !renderer) return;
            for (let entry of entries) {
                const w = entry.contentRect.width;
                const h = entry.contentRect.height;
                // 只有当容器真正有尺寸时才更新画布
                if (w > 0 && h > 0) {
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h);
                }
            }
        });
        // 绑定观察者到 3D 容器
        resizeObserver.observe(view3dContainer);

        // ============ 8. 3D 交互引擎 (Raycaster) ============
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        renderer.domElement.addEventListener('click', (event) => {
            if (!isSplitViewActive) return;

            // 【关键修复】阻止事件冒泡！
            // 防止点击事件向上传递，触发 DOM 顶层的"清空所有选中状态"逻辑
            event.stopPropagation();

            // 获取 3D 画布在屏幕上的绝对包围盒
            const rect = renderer.domElement.getBoundingClientRect();
            
            // 将鼠标屏幕坐标转换为 Three.js 的归一化设备坐标 (NDC: -1 到 +1)
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // 从摄像机位置穿过鼠标点击位置发射射线
            raycaster.setFromCamera(mouse, camera);

            // 计算射线与场景中所有物体的交点
            const intersects = raycaster.intersectObjects(scene.children, true);

            if (intersects.length > 0) {
                // 筛选出被击中的、并且我们在 createComponents 中埋入了 ref 数据的器件实体
                const target = intersects.find(intersect => intersect.object.userData && intersect.object.userData.ref);
                
                if (target) {
                    const ref = target.object.userData.ref;
                    
                    // 【核心联动】调用我们在 2D 环境下早已写好的全局器件选中函数！
                    // 这将自动触发：2D 图纸高亮 + 居中 + 右下角属性面板弹出
                    if (typeof selectComponent === 'function') {
                        selectComponent(ref);
                    }
                }
            }
        });

        isThreeInitialized = true;
    }

    function createPcbBoard() {
        const boardWidth = 900;
        const boardHeight = 700;
        const boardThickness = 16; 
        const cornerRadius = 20; // 严格映射 2D 的倒角半径

        const shape = new THREE.Shape();

        // 1. 绘制带有倒角的外框轮廓 (以坐标系中心进行绝对对称映射)
        const x = -boardWidth / 2;
        const y = -boardHeight / 2;
        shape.moveTo(x + cornerRadius, y);
        shape.lineTo(x + boardWidth - cornerRadius, y);
        shape.quadraticCurveTo(x + boardWidth, y, x + boardWidth, y + cornerRadius);
        shape.lineTo(x + boardWidth, y + boardHeight - cornerRadius);
        shape.quadraticCurveTo(x + boardWidth, y + boardHeight, x + boardWidth - cornerRadius, y + boardHeight);
        shape.lineTo(x + cornerRadius, y + boardHeight);
        shape.quadraticCurveTo(x, y + boardHeight, x, y + boardHeight - cornerRadius);
        shape.lineTo(x, y + cornerRadius);
        shape.quadraticCurveTo(x, y, x + cornerRadius, y);

        // 2. 挖掘 4 个物理通孔 (严格映射 2D 坐标)
        const holeCoords = [
            { x: -400, y: 300 },  // 左上 (对应 2D 的 cx=100, cy=100)
            { x: 400, y: 300 },   // 右上
            { x: -400, y: -300 }, // 左下
            { x: 400, y: -300 }   // 右下
        ];

        holeCoords.forEach(coord => {
            const hole = new THREE.Path();
            hole.absarc(coord.x, coord.y, 16, 0, Math.PI * 2, false); // 半径与 2D 一致
            shape.holes.push(hole); // 在 Shape 中打孔
        });

        // 3. 沿 Z 轴挤压成 3D 实体
        const extrudeSettings = {
            depth: boardThickness,
            bevelEnabled: false // 关闭额外倒角，以保证板面 Z=8 坐标的绝对精确
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // 【关键】Extrude 默认从 Z=0 往正方向挤压 16。我们将其后移一半，
        // 让板子完美跨越 Z(-8) 到 Z(8)，完美承接后续元器件和走线的贴片高度！
        geometry.translate(0, 0, -boardThickness / 2);

        // 4. 赋予经典工业绿油材质
        const material = new THREE.MeshPhongMaterial({ 
            color: '#166534', 
            shininess: 40
        });
        
        const board = new THREE.Mesh(geometry, material);
        board.receiveShadow = true;
        board.castShadow = true;
        scene.add(board);
    }

    // ============ 3D 元器件生成引擎 ============
    function createComponents() {
        // 2D 坐标映射到 3D 空间的辅助函数
        function svgTo3D(x, y, w, h, zThickness) {
            return {
                x: (x + w / 2) - 500,        // X轴偏移量 (原点在500)
                y: 400 - (y + h / 2),        // Y轴反转并计算偏移 (原点在400)
                z: 8 + (zThickness / 2)      // 板厚(16)的一半 + 器件高度的一半
            };
        }

        // 器件物理尺寸字典 (映射自 2D 图纸与真实物理高度)
        const componentsData = [
            { ref: 'U1', x: 350, y: 280, w: 160, h: 160, z: 12, color: '#1f2937' }, // 主控 MCU
            { ref: 'U2', x: 100, y: 140, w: 50,  h: 40,  z: 15, color: '#1f2937' }, // LDO
            { ref: 'J1', x: 100, y: 600, w: 50,  h: 80,  z: 85, color: '#f8fafc' }, // 高耸的排针 (干涉主角)
            { ref: 'Y1', x: 620, y: 290, w: 60,  h: 25,  z: 30, color: '#94a3b8' }, // 晶振 (金属色)
            { ref: 'C1', x: 260, y: 300, w: 25,  h: 12,  z: 8,  color: '#b45309' }, // 贴片电容
            { ref: 'C2', x: 260, y: 380, w: 30,  h: 14,  z: 10, color: '#b45309' },
            { ref: 'C3', x: 720, y: 290, w: 18,  h: 8,   z: 6,  color: '#b45309' },
            { ref: 'C4', x: 170, y: 600, w: 25,  h: 12,  z: 8,  color: '#b45309' },
            { ref: 'R1', x: 620, y: 410, w: 30,  h: 12,  z: 6,  color: '#020617' }, // 贴片电阻
            { ref: 'R2', x: 620, y: 470, w: 30,  h: 12,  z: 6,  color: '#020617' },
            { ref: 'R3', x: 760, y: 310, w: 30,  h: 12,  z: 6,  color: '#020617' },
            { ref: 'D1', x: 860, y: 310, w: 30,  h: 14,  z: 12, color: '#ef4444' }  // LED 指示灯
        ];

        componentsData.forEach(comp => {
            const pos = svgTo3D(comp.x, comp.y, comp.w, comp.h, comp.z);
            const geometry = new THREE.BoxGeometry(comp.w, comp.h, comp.z);
            
            // LED 特殊自发光材质处理
            const materialParams = { color: comp.color, shininess: 50 };
            if (comp.ref === 'D1') materialParams.emissive = new THREE.Color('#991b1b');
            
            const material = new THREE.MeshPhongMaterial(materialParams);
            const mesh = new THREE.Mesh(geometry, material);
            
            mesh.position.set(pos.x, pos.y, pos.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = { ref: comp.ref }; // 埋入位号数据，用于后续互动联动
            
            scene.add(mesh);
        });
    }

    // ============ 3D 数字主线：动态解析走线网络 ============
    function createTraces() {
        // SVG Path 转 3D 线段解析器
        function parsePathToLine(dStr, zPos, colorHex) {
            const points = [];
            // 按 M (Move) 或 L (Line) 切割指令
            const commands = dStr.split(/(?=[ML])/); 
            commands.forEach(cmd => {
                const parts = cmd.trim().split(' ');
                if (parts.length >= 3) {
                    const x = parseFloat(parts[1]) - 500;
                    const y = 400 - parseFloat(parts[2]);
                    points.push(new THREE.Vector3(x, y, zPos));
                }
            });
            
            if (points.length > 1) {
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ color: colorHex });
                const line = new THREE.Line(geometry, material);
                scene.add(line);
            }
        }

        // 提取顶层走线 (红色，贴于板上)
        const topPaths = document.querySelectorAll('#pcb-layer-top path');
        topPaths.forEach(p => {
            const d = p.getAttribute('d');
            if(d) parsePathToLine(d, 8.1, 0xef4444); // 位于 Z = 8.1
        });

        // 提取底层走线 (蓝色，贴于板底)
        const bottomPaths = document.querySelectorAll('#pcb-layer-bottom path');
        bottomPaths.forEach(p => {
            const d = p.getAttribute('d');
            if(d) parsePathToLine(d, -8.1, 0x3b82f6); // 位于 Z = -8.1
        });
    }

    // 切换 2D/3D 分屏
    function toggleSplitView() {
        isSplitViewActive = !isSplitViewActive;
        
        if (isSplitViewActive) {
            toolSplitView.classList.add('bg-blue-50', 'text-blue-600');
            view2dContainer.style.flex = '0 0 50%';
            view3dContainer.style.width = '50%';
            
            // 首次展开时初始化引擎
            if (!isThreeInitialized) {
                initThreeEngine();
            }
            // 尺寸的自适应将由 ResizeObserver 自动接管
        } else {
            toolSplitView.classList.remove('bg-blue-50', 'text-blue-600');
            view2dContainer.style.flex = '1';
            view3dContainer.style.width = '0';
        }
    }
    
    if (toolSplitView) {
        toolSplitView.addEventListener('click', toggleSplitView);
    }

    // ============ 核心公共函数：选中器件 ============
    window.selectComponent = function(refDes) {
        document.querySelectorAll('.eda-component').forEach(el => {
            el.classList.remove('selected-component');
        });

        const targetComponents = document.querySelectorAll(`.eda-component[data-ref="${refDes}"]`);
        targetComponents.forEach(el => {
            el.classList.add('selected-component');
        });

        updatePropertyCard(refDes);
    };

    function updatePropertyCard(refDes) {
        const data = mockComponentData[refDes];
        if (!data) return;

        document.getElementById('prop-refdes').innerText = data.RefDes;
        document.getElementById('prop-itemnum').innerText = data.ItemNumber;
        
        const diff = mockDiffData[refDes];
        const partNumEl = document.getElementById('prop-partnum');
        
        let partNumberHtml = `<span class="text-gray-900">${data.PartNumber}</span>`;
        let locationHtml = '';

        if (currentTab === 'diff' && diff) {
            if (diff.type === 'modified' && (diff.attr === 'PartNumber' || diff.attr === '阻值')) {
                partNumberHtml = `<del class="text-gray-400">${diff.oldVal}</del> <span class="text-yellow-600 font-bold ml-1">${diff.newVal}</span>`;
            } else if (diff.type === 'moved') {
                locationHtml = `
                    <div class="col-span-2 mt-2 pt-2 border-t border-gray-100">
                        <div class="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">坐标变更</div>
                        <div class="text-sm mt-1">
                            <del class="text-gray-400">${diff.oldVal}</del> 
                            <span class="text-yellow-600 font-bold ml-1">${diff.newVal}</span>
                        </div>
                    </div>
                `;
            }
        }

        partNumEl.innerHTML = partNumberHtml;
        
        document.getElementById('prop-footprint').innerText = data.Footprint;
        document.getElementById('prop-desc').innerText = data.Description;

        const statusEl = document.getElementById('prop-status');
        statusEl.innerText = data.Status;
        statusEl.className = "px-2 py-0.5 rounded text-[11px] font-bold";
        
        if (data.Status === '归档') {
            statusEl.classList.add('bg-green-100', 'text-green-700');
        } else if (data.Status === '提交') {
            statusEl.classList.add('bg-orange-100', 'text-orange-700');
        } else {
            statusEl.classList.add('bg-gray-100', 'text-gray-600');
        }

        const gridContainer = document.querySelector('#comp-property-popover .grid');
        const oldLocationRow = gridContainer.querySelector('.location-diff-row');
        if (oldLocationRow) {
            oldLocationRow.remove();
        }
        if (locationHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = locationHtml;
            const newRow = tempDiv.firstElementChild;
            newRow.classList.add('location-diff-row');
            gridContainer.appendChild(newRow);
        }

        popover.classList.remove('hidden');
        setTimeout(() => {
            popover.classList.add('popover-active');
        }, 10);
    }

    function hidePropertyCard() {
        popover.classList.remove('popover-active');
        setTimeout(() => {
            popover.classList.add('hidden');
        }, 300);
    }

    function clearAllSelection() {
        document.querySelectorAll('.eda-component').forEach(el => {
            el.classList.remove('selected-component');
        });
        document.querySelectorAll('.annotation-box').forEach(box => {
            box.classList.remove('selected');
        });
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.remove('active');
        });
    }

    // ============ 场景化搜索联想功能 ============
    function renderSearchDropdown(query) {
        const upperQuery = query.toUpperCase();
        let matches = [];
        let html = '';

        if (currentTab === 'tree') {
            // 结构树模式：搜索位号
            matches = Object.keys(mockComponentData).filter(key => 
                key.toUpperCase().includes(upperQuery)
            );
            if (matches.length === 0 || query === '') {
                searchDropdown.classList.add('hidden');
                return;
            }
            html = matches.map(ref => {
                const data = mockComponentData[ref];
                return `
                    <li class="search-item px-3 py-2 text-sm text-gray-700 cursor-pointer flex items-center justify-between" data-type="component" data-ref="${ref}">
                        <span class="font-medium">${ref}</span>
                        <span class="text-xs text-gray-400">${data.PartNumber}</span>
                    </li>
                `;
            }).join('');
        } else if (currentTab === 'diff') {
            // 版本差异模式：搜索位号或差异描述
            matches = Object.keys(mockDiffData).filter(key => {
                const diff = mockDiffData[key];
                return key.toUpperCase().includes(upperQuery) || 
                       diff.desc.toUpperCase().includes(upperQuery);
            });
            if (matches.length === 0 || query === '') {
                searchDropdown.classList.add('hidden');
                return;
            }
            html = matches.map(ref => {
                const diff = mockDiffData[ref];
                const typeLabels = {
                    'added': '新增',
                    'modified': '修改',
                    'deleted': '删除',
                    'moved': '位移'
                };
                return `
                    <li class="search-item px-3 py-2 text-sm text-gray-700 cursor-pointer flex items-center justify-between" data-type="diff" data-ref="${ref}">
                        <div class="flex items-center space-x-2">
                            <span class="font-medium">${ref}</span>
                            <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">${typeLabels[diff.type]}</span>
                        </div>
                        <span class="text-xs text-gray-400 truncate max-w-[120px]">${diff.desc}</span>
                    </li>
                `;
            }).join('');
        } else if (currentTab === 'notes') {
            // 批注列表模式：搜索批注内容
            matches = annotations.filter(note => 
                note.text.toUpperCase().includes(upperQuery)
            );
            if (matches.length === 0 || query === '') {
                searchDropdown.classList.add('hidden');
                return;
            }
            html = matches.map(note => {
                const viewLabel = note.viewType === 'schematic' ? '原理图' : 'PCB';
                return `
                    <li class="search-item px-3 py-2 text-sm text-gray-700 cursor-pointer flex items-center justify-between" data-type="annotation" data-id="${note.id}">
                        <div class="flex items-center space-x-2">
                            <span class="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold">${note.id}</span>
                            <span class="text-xs text-gray-500">${viewLabel}</span>
                        </div>
                        <span class="text-xs text-gray-600 truncate max-w-[150px]">${note.text}</span>
                    </li>
                `;
            }).join('');
        } else {
            searchDropdown.classList.add('hidden');
            return;
        }

        searchDropdown.innerHTML = html;

        searchDropdown.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = li.getAttribute('data-type');
                if (type === 'component') {
                    const ref = li.getAttribute('data-ref');
                    searchInput.value = ref;
                    searchDropdown.classList.add('hidden');
                    selectComponent(ref);
                } else if (type === 'diff') {
                    const ref = li.getAttribute('data-ref');
                    searchInput.value = ref;
                    searchDropdown.classList.add('hidden');
                    selectComponent(ref);
                } else if (type === 'annotation') {
                    const id = parseInt(li.getAttribute('data-id'));
                    searchInput.value = '';
                    searchDropdown.classList.add('hidden');
                    locateAnnotation(id);
                }
            });
        });

        searchDropdown.classList.remove('hidden');
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (value === '') {
                searchDropdown.classList.add('hidden');
            } else {
                renderSearchDropdown(value);
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const value = e.target.value.trim();
                if (currentTab === 'tree' || currentTab === 'diff') {
                    const upperValue = value.toUpperCase();
                    if (mockComponentData[upperValue]) {
                        selectComponent(upperValue);
                        searchDropdown.classList.add('hidden');
                        searchInput.blur();
                    }
                } else if (currentTab === 'notes') {
                    const match = annotations.find(note =>
                        note.text.toUpperCase().includes(value.toUpperCase())
                    );
                    if (match) {
                        locateAnnotation(match.id);
                        searchDropdown.classList.add('hidden');
                        searchInput.blur();
                    }
                }
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (searchInput && searchDropdown &&
            !searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.classList.add('hidden');
        }
    });

    // ============ 画布交互 ============
    function bindSvgEvents() {
        const components = document.querySelectorAll('.eda-component');
        components.forEach(comp => {
            comp.addEventListener('click', (e) => {
                e.stopPropagation();
                const ref = comp.getAttribute('data-ref');
                selectComponent(ref);
            });
        });
    }

    if (canvasContainer) {
        canvasContainer.addEventListener('click', () => {
            hidePropertyCard();
            clearAllSelection();
        });
    }

    if (popover) {
        popover.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (popoverClose) {
        popoverClose.addEventListener('click', () => {
            hidePropertyCard();
            clearAllSelection();
        });
    }

    function generateTreeItem(ref, label, icon, isPrimary = false) {
        const data = mockComponentData[ref];
        // 如果当前版本不存在该器件，返回空字符串（不渲染）
        if (!data) return '';
        const primaryClass = isPrimary ? 'text-blue-600 bg-blue-50/30' : 'text-gray-600';
        const iconClass = isPrimary ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500';
        const partNumber = data.PartNumber?.split('-')[0] || 'N/A';
        return `
            <div class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer ${primaryClass} group"
                 onmouseover="highlightComponent('${ref}')"
                 onmouseout="clearHighlight()"
                 onclick="selectComponent('${ref}')">
                <i class="fas fa-${icon} w-5 ${iconClass}"></i>
                <span>${ref} (${partNumber})</span>
            </div>
        `;
    }

    renderTreeContent();

    // ============ Tab 切换逻辑 ============
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabKey = btn.getAttribute('data-tab');
            AppState.currentTab = tabKey;
            currentTab = tabKey;
            
            const config = {
                'tree': { title: '结构树', showSearch: true, showDiff: false, showBottom: false },
                'diff': { title: '版本差异', showSearch: true, showDiff: true, showBottom: false },
                'collab': { title: '协同记录', showSearch: false, showDiff: false, showBottom: false },
                'notes': { title: '批注列表', showSearch: true, showDiff: false, showBottom: true }
            }[tabKey];

            // 更新搜索框占位符
            const searchInput = document.getElementById('search-input');
            if (tabKey === 'tree') {
                searchInput.placeholder = '搜索位号 / 网络名...';
            } else if (tabKey === 'diff') {
                searchInput.placeholder = '搜索位号 / 差异描述...';
            } else if (tabKey === 'notes') {
                searchInput.placeholder = '搜索批注内容...';
            }

            tabButtons.forEach(b => {
                b.classList.remove('text-blue-600', 'bg-blue-50');
                b.classList.add('text-gray-400');
            });
            btn.classList.add('text-blue-600', 'bg-blue-50');
            btn.classList.remove('text-gray-400');

            tabTitle.innerText = config.title;
            
            // 【核心修复】只发事件，不干活，让 sidebar 去渲染
            bus.emit('TAB_CHANGED', tabKey);
            
            // 同步 Diff 高亮状态
            if (tabKey === 'diff') {
                applyDiffHighlight();
            } else {
                clearDiffHighlight();
            }

            panelTopSearch.classList.toggle('hidden', !config.showSearch);
            panelTopDiff.classList.toggle('hidden', !config.showDiff);
            panelBottomNotes.classList.toggle('hidden', !config.showBottom);
        });
    });

    if (btnSchematic) btnSchematic.addEventListener('click', switchToSchematic);
    if (btnPcb) btnPcb.addEventListener('click', switchToPcb);

    // ============ 版本选择框联动 ============
    // 仅依赖 versionCompareSelect，与当前全局版本对比
    if (versionCompareSelect) {
        versionCompareSelect.addEventListener('change', () => {
            const compareVersion = versionCompareSelect.value;
            calculateVersionDiff(AppState.currentVersion, compareVersion);
            bus.emit('TAB_CHANGED', 'diff');
            applyDiffHighlight();
        });
    }

    // 预置批注已由 annotation.manager.js 初始化
    // 初始渲染由 Sidebar 模块通过事件监听处理
    bus.emit('VIEW_CHANGED', currentDrawingType);
    bus.emit('TAB_CHANGED', currentTab);

    // 初始化版本选择器
    initGlobalVersionSelect();
    updateCompareVersionOptions();

    // ============ PDF 评审报告导出功能 ============
    const btnExportPdf = document.getElementById('btn-export-pdf');
    if (btnExportPdf) {
        btnExportPdf.addEventListener('click', generatePDFReport);
    }

    async function generatePDFReport() {
        // 显示 Loading 状态
        const btnExportPdf = document.getElementById('btn-export-pdf');
        const originalBtnText = btnExportPdf.innerHTML;
        btnExportPdf.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>正在生成...';
        btnExportPdf.disabled = true;

        try {
            // 步骤 A：捕获画布快照
            const canvasWrapper = document.getElementById('canvas-wrapper');
            const snapshotImg = document.getElementById('report-snapshot-img');
            const viewTypeSpan = document.getElementById('report-view-type');

            // 更新视图类型文字
            viewTypeSpan.textContent = currentDrawingType === 'schematic' ? '原理图' : 'PCB';

            // 使用 html2canvas 捕获画布
            const canvas = await html2canvas(canvasWrapper, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#f8f9fa'
            });

            // 转为 Base64 图片数据
            const imageData = canvas.toDataURL('image/jpeg', 0.95);
            snapshotImg.src = imageData;

            // 步骤 1：数据计算 - 过滤当前版本的批注
            const versionAnnotations = annotations.filter(a => a.version === AppState.currentVersion);
            const totalCount = versionAnnotations.length;
            const openCount = versionAnnotations.filter(a => a.status === 'open').length;
            const resolvedCount = versionAnnotations.filter(a => a.status === 'resolved').length;

            // 步骤 2：数据注入
            document.getElementById('report-version').textContent = AppState.currentVersion;
            document.getElementById('report-date').textContent = new Date().toLocaleDateString('zh-CN');
            document.getElementById('report-total').textContent = totalCount;
            document.getElementById('report-open').textContent = openCount;
            document.getElementById('report-resolved').textContent = resolvedCount;

            // 步骤 3：表格生成
            const tableBody = document.getElementById('report-table-body');
            tableBody.innerHTML = '';

            if (versionAnnotations.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="p-4 text-center text-gray-500">当前版本暂无批注</td>
                    </tr>
                `;
            } else {
                versionAnnotations.forEach(note => {
                    const viewLabel = note.viewType === 'schematic' ? '原理图' : 'PCB';
                    const statusClass = note.status === 'open' ? 'text-red-600' : 'text-green-600';
                    const statusText = note.status === 'open' ? '待解决' : '已解决';

                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-200 hover:bg-gray-50';
                    row.innerHTML = `
                        <td class="p-2 font-medium">#${note.id}</td>
                        <td class="p-2">${viewLabel}</td>
                        <td class="p-2 font-mono text-xs">${note.targetRef || '-'}</td>
                        <td class="p-2">${note.text}</td>
                        <td class="p-2 ${statusClass} font-medium">${statusText}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }

            // 步骤 C：离屏克隆与导出（延迟确保图片加载）
            setTimeout(() => {
                const originalElement = document.getElementById('pdf-report-template');

                // 深拷贝模板
                const clonedElement = originalElement.cloneNode(true);
                clonedElement.id = 'pdf-report-clone'; // 避免 ID 冲突
                clonedElement.classList.remove('hidden', 'absolute', 'z-[-10]', 'top-0', 'left-0');

                // 创建离屏容器
                const offScreenContainer = document.createElement('div');
                offScreenContainer.style.position = 'absolute';
                offScreenContainer.style.left = '-9999px';
                offScreenContainer.style.top = '0';
                offScreenContainer.appendChild(clonedElement);
                document.body.appendChild(offScreenContainer);

                const opt = {
                    margin: 0,
                    filename: `硬件评审报告_${AppState.currentVersion}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        // 使用全局 html2canvas 实例
                        html2canvas: window.html2canvas
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                // 针对克隆节点生成 PDF
                html2pdf().set(opt).from(clonedElement).save().then(() => {
                    // 生成完毕后销毁离屏容器
                    document.body.removeChild(offScreenContainer);
                    // 恢复按钮状态
                    btnExportPdf.innerHTML = originalBtnText;
                    btnExportPdf.disabled = false;
                }).catch(err => {
                    console.error('PDF 导出失败:', err);
                    if (document.body.contains(offScreenContainer)) {
                        document.body.removeChild(offScreenContainer);
                    }
                    // 恢复按钮状态
                    btnExportPdf.innerHTML = originalBtnText;
                    btnExportPdf.disabled = false;
                    alert('PDF 导出失败，请重试');
                });
            }, 100); // 100ms 延迟确保图片渲染

        } catch (err) {
            console.error('PDF 生成失败:', err);
            btnExportPdf.innerHTML = originalBtnText;
            btnExportPdf.disabled = false;
            alert('PDF 生成失败，请重试');
        }
    }

    // ============ 全局交互熔断 ============
    // 当用户在画布区域点击（准备拖拽）或滚动滚轮（准备缩放）时，立即隐藏气泡
    if (canvasWrapper) {
        canvasWrapper.addEventListener('mousedown', hideAnnotationBubble);
        canvasWrapper.addEventListener('wheel', hideAnnotationBubble);
    }

    // 5. 恢复版本差异的高亮渲染逻辑
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
        document.querySelectorAll('.diff-position-indicator').forEach(el => el.classList.remove('hidden'));
    }

    function clearDiffHighlight() {
        document.querySelectorAll('.eda-component').forEach(el => {
            el.classList.remove('diff-added', 'diff-modified', 'diff-deleted', 'diff-moved');
        });
        document.querySelectorAll('.diff-position-indicator').forEach(el => el.classList.add('hidden'));
    }

    // 6. 恢复全局 Hover 联动函数（挂载到 window 供 HTML 内联调用）
    window.highlightComponent = function(ref) {
        const comps = document.querySelectorAll(`.eda-component[data-ref="${ref}"]`);
        comps.forEach(c => {
            c.style.filter = "drop-shadow(0 0 4px rgba(37, 99, 235, 0.6))";
        });
    };

    window.clearHighlight = function() {
        const comps = document.querySelectorAll('.eda-component');
        comps.forEach(c => {
            if (!c.classList.contains('selected-component')) {
                c.style.filter = "";
            }
        });
    };
});
