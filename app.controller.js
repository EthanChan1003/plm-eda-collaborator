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

    // 获取批注容器（在各自画布内部）
    function getAnnotationContainer(viewType) {
        const canvas = viewType === 'schematic' ? canvasSchematic : canvasPcb;
        return canvas?.querySelector('.annotations-container');
    }

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

    // 全局版本选择器
    const globalVersionSelect = document.getElementById('global-version-select');
    const versionCompareSelect = document.getElementById('version-compare');

    // 气泡元素
    const annotationBubble = document.getElementById('annotation-bubble');
    const bubbleContent = document.getElementById('bubble-content');
    const closeBubbleBtn = document.getElementById('close-bubble');

    // 初始化核心引擎（传递 DOM 依赖）
    if (canvasWrapper && canvasTransform) {
        initEngine(canvasWrapper, canvasTransform);
    } else {
        console.error('Canvas elements not found, engine initialization failed');
    }

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

        // 2. 切换批注显示/隐藏（根据版本和视图类型过滤，不重新创建）- 只操作画布DOM，不触碰左侧面板
        annotations.forEach(annotation => {
            if (annotation.element) {
                const shouldShow = annotation.version === AppState.currentVersion &&
                                   annotation.viewType === currentDrawingType;
                annotation.element.style.display = shouldShow ? '' : 'none';
            }
        });

        // 3. 根据当前激活的页签，仅刷新对应内容
        switch (currentTab) {
            case 'tree':
                renderTreeContent();
                break;
            case 'diff':
                if (versionCompareSelect) {
                    const compareVersion = versionCompareSelect.value;
                    calculateVersionDiff(AppState.currentVersion, compareVersion);
                }
                renderDiffContent();
                applyDiffHighlight();
                break;
            case 'notes':
                renderNotesContent();
                break;
            default:
                // 其他页签不做处理
                break;
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
                const label = isLatest ? `${v} (最新)` : v;
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
        }
    }

    // 全局版本选择器事件
    if (globalVersionSelect) {
        globalVersionSelect.addEventListener('change', (e) => {
            switchGlobalVersion(e.target.value);
        });
    }

    // 对比版本选择器事件
    if (versionCompareSelect) {
        versionCompareSelect.addEventListener('change', () => {
            const compareVersion = versionCompareSelect.value;
            calculateVersionDiff(AppState.currentVersion, compareVersion);
            renderDiffContent();
            applyDiffHighlight();
        });
    }

    // ============ 批注气泡系统 ============
    function showAnnotationBubble(annotationId) {
        const annotation = annotations.find(a => a.id === annotationId);
        if (!annotation || !annotation.element) return;

        // 定位气泡
        const rect = annotation.element.getBoundingClientRect();
        const bubbleX = rect.right + 10;
        const bubbleY = rect.top;

        annotationBubble.style.left = bubbleX + 'px';
        annotationBubble.style.top = bubbleY + 'px';

        // 填充内容
        bubbleContent.textContent = annotation.text;

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
        currentToolMode = mode;
        
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
    if (toolSelect) toolSelect.addEventListener('click', () => setToolMode(ToolMode.SELECT));
    if (toolPan) toolPan.addEventListener('click', () => setToolMode(ToolMode.PAN));
    if (toolRect) {
        toolRect.addEventListener('click', () => {
            setToolMode(ToolMode.ANNOTATE);
            // 点击具体工具后关闭下拉菜单
            if (annotationSubMenu) {
                annotationSubMenu.classList.add('hidden');
            }
        });
    }

    // ============ 画布缩放功能 ============
    // 滚轮缩放
    canvasWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        zoom(factor, e.clientX, e.clientY);
    }, { passive: false });

    // 缩放按钮
    if (toolZoomIn) toolZoomIn.addEventListener('click', () => zoom(1.2));
    if (toolZoomOut) toolZoomOut.addEventListener('click', () => zoom(0.8));

    // 复位按钮
    if (toolReset) toolReset.addEventListener('click', () => {
        canvasState.scale = 1;
        canvasState.translateX = 0;
        canvasState.translateY = 0;
        updateCanvasTransform();
    });

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
        
        canvasState.translateX = e.clientX - panStartX;
        canvasState.translateY = e.clientY - panStartY;
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

    // ============ 批注画框功能 ============
    let isDrawing = false;
    let currentAnnotationBox = null;
    let drawStartX, drawStartY;

    // 获取鼠标相对于当前画布的局部坐标（画布局部坐标，随变换缩放）
    function getCanvasLocalCoordinates(clientX, clientY) {
        const activeCanvas = currentDrawingType === 'schematic' ? canvasSchematic : canvasPcb;
        if (!activeCanvas) return { x: 0, y: 0 };
        const rect = activeCanvas.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    canvasWrapper.addEventListener('mousedown', (e) => {
        if (currentToolMode !== ToolMode.ANNOTATE) return;
        if (e.target.closest('.annotation-box') || e.target.closest('.annotation-input-panel')) return;

        isDrawing = true;

        // 使用画布局部坐标（随画布变换）
        const coords = getCanvasLocalCoordinates(e.clientX, e.clientY);
        drawStartX = coords.x;
        drawStartY = coords.y;

        // 创建批注框
        currentAnnotationBox = document.createElement('div');
        currentAnnotationBox.className = 'annotation-box';
        currentAnnotationBox.style.left = drawStartX + 'px';
        currentAnnotationBox.style.top = drawStartY + 'px';
        currentAnnotationBox.style.width = '0px';
        currentAnnotationBox.style.height = '0px';

        // 将批注框添加到当前画布的批注容器内（随画布变换）
        const container = getAnnotationContainer(currentDrawingType);
        if (container) {
            container.appendChild(currentAnnotationBox);
        }
    });

    canvasWrapper.addEventListener('mousemove', (e) => {
        if (!isDrawing || !currentAnnotationBox) return;

        // 使用画布局部坐标（随画布变换）
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

        // 如果框太小，直接删除
        if (boxWidth < 20 || boxHeight < 20) {
            currentAnnotationBox.remove();
            currentAnnotationBox = null;
            return;
        }

        // 显示输入面板
        showAnnotationInputPanel(currentAnnotationBox);

        // 退出批注模式，回到选择模式
        setToolMode(ToolMode.SELECT);
    });

    // 显示批注输入面板
    function showAnnotationInputPanel(annotationBox) {
        const boxLeft = parseInt(annotationBox.style.left);
        const boxTop = parseInt(annotationBox.style.top);
        const boxWidth = parseInt(annotationBox.style.width);
        const boxHeight = parseInt(annotationBox.style.height);

        const panel = document.createElement('div');
        panel.className = 'annotation-input-panel';
        
        // 考虑缩放计算面板位置
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

        // 聚焦输入框
        setTimeout(() => panel.querySelector('#annotation-text').focus(), 10);

        // 取消按钮
        panel.querySelector('#annotation-cancel').addEventListener('click', () => {
            annotationBox.remove();
            panel.remove();
        });

        // 保存按钮
        panel.querySelector('#annotation-save').addEventListener('click', () => {
            const text = panel.querySelector('#annotation-text').value.trim();
            if (text) {
                saveAnnotation(annotationBox, text);
            }
            panel.remove();
        });
    }

    // 保存批注
    function saveAnnotation(annotationBox, text) {
        // 使用版本级 ID 生成器获取新 ID
        const annotationId = getNextAnnotationId(AppState.currentVersion);

        // 添加角标
        const badge = document.createElement('div');
        badge.className = 'annotation-badge';
        badge.textContent = annotationId;
        annotationBox.appendChild(badge);

        // 计算中心点坐标
        const boxLeft = parseInt(annotationBox.style.left);
        const boxTop = parseInt(annotationBox.style.top);
        const boxWidth = parseInt(annotationBox.style.width);
        const boxHeight = parseInt(annotationBox.style.height);

        // 存储批注数据（包含视图类型、中心坐标、状态和版本）
        const annotationData = {
            id: annotationId,
            text: text,
            time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }),
            author: '张三',
            element: annotationBox,
            viewType: currentDrawingType,  // 记录当前视图类型
            centerX: boxLeft + boxWidth / 2,
            centerY: boxTop + boxHeight / 2,
            status: 'open',  // 初始状态为待处理
            version: AppState.currentVersion  // 记录当前版本
        };
        annotations.push(annotationData);

        // 点击批注框高亮
        annotationBox.addEventListener('click', (e) => {
            e.stopPropagation();
            highlightAnnotation(annotationId);
        });

        // 更新批注列表
        if (currentTab === 'notes') {
            renderNotesContent();
        }
    }

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
            showAnnotationBubble(annotationId);
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
        
        // 重新渲染批注列表
        renderNotesContent();
    };

    // ============ 批注删除功能 ============
    window.deleteAnnotation = function(id, version) {
        // 优先使用传入的版本，否则使用当前版本
        const targetVersion = version || AppState.currentVersion;
        const index = annotations.findIndex(a => a.id === id && a.version === targetVersion);
        if (index === -1) return;
        
        const annotation = annotations[index];
        
        // 从 DOM 中移除对应的批注框
        if (annotation.element && annotation.element.parentNode) {
            annotation.element.parentNode.removeChild(annotation.element);
        }
        
        // 从全局数组中移除
        annotations.splice(index, 1);
        
        // 重新渲染批注列表
        renderNotesContent();
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
        canvasState.scale = targetScale;
        canvasState.translateX = targetTranslateX;
        canvasState.translateY = targetTranslateY;
        updateCanvasTransform();

        // 恢复快速响应
        setTimeout(() => {
            canvasTransform.style.transition = 'transform 0.1s ease-out';
        }, 500);

        // 步骤4：触发呼吸闪烁动画
        setTimeout(() => {
            highlightAnnotation(annotationId, true);
        }, 550);
    };

    // 切换到原理图视图
    function switchToSchematic() {
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
        if (currentTab === 'tree') {
            renderTreeContent();
        }
    }

    // 切换到PCB视图
    function switchToPcb() {
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
        if (currentTab === 'tree') {
            renderTreeContent();
        }
    }

    // ============ 渲染版本差异列表 ============
    function renderDiffContent() {
        const typeLabels = {
            'added': { text: '新增', color: 'bg-green-500', textColor: 'text-green-700' },
            'modified': { text: '修改', color: 'bg-yellow-500', textColor: 'text-yellow-700' },
            'deleted': { text: '删除', color: 'bg-red-500', textColor: 'text-red-700' },
            'moved': { text: '位移', color: 'bg-yellow-500', textColor: 'text-yellow-700' }
        };

        let diffHTML = '<div class="space-y-2 p-2">';
        
        Object.keys(mockDiffData).forEach(ref => {
            const diff = mockDiffData[ref];
            const label = typeLabels[diff.type];
            
            diffHTML += `
                <div class="diff-item flex items-start p-3 rounded-lg cursor-pointer border border-gray-100" 
                     onclick="selectComponent('${ref}')">
                    <div class="flex-shrink-0 mt-0.5">
                        <div class="w-3 h-3 rounded-full ${label.color}"></div>
                    </div>
                    <div class="ml-3 flex-1">
                        <div class="flex items-center space-x-2">
                            <span class="font-bold text-gray-800 text-sm">${ref}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded ${label.textColor} bg-opacity-10 ${label.color.replace('bg-', 'bg-')}/10 font-medium">
                                ${label.text}
                            </span>
                        </div>
                        <div class="text-xs text-gray-500 mt-1">${diff.desc}</div>
                        ${(diff.type === 'modified' || diff.type === 'moved') ? `
                            <div class="mt-2 text-xs flex items-center space-x-2">
                                <span class="text-gray-400 line-through">${diff.oldVal}</span>
                                <i class="fas fa-arrow-right text-gray-300 text-[10px]"></i>
                                <span class="text-yellow-600 font-bold">${diff.newVal}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        diffHTML += '</div>';
        tabContent.innerHTML = diffHTML;
    }

    // ============ 渲染批注列表 ============
    function renderNotesContent() {
        // 保护：仅在批注页签下执行渲染，防止意外清空其他页签内容
        if (currentTab !== 'notes') return;

        // 权限控制：非最新版本隐藏删除按钮
        const isLatest = AppState.currentVersion === AppState.latestVersion;

        // 同步更新画布上所有批注框的样式类
        annotations.forEach(annotation => {
            if (annotation.element) {
                if (annotation.status === 'resolved') {
                    annotation.element.classList.add('annotation-resolved');
                } else {
                    annotation.element.classList.remove('annotation-resolved');
                }
            }
        });

        // 过滤当前版本的批注
        const versionAnnotations = annotations.filter(a => a.version === AppState.currentVersion);

        if (versionAnnotations.length === 0) {
            tabContent.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-400">
                    <i class="fas fa-comment-slash text-3xl mb-2"></i>
                    <span class="text-xs">暂无批注</span>
                    ${isLatest ? '<span class="text-[10px] mt-1">点击工具栏矩形框按钮添加批注</span>' : '<span class="text-[10px] mt-1">历史版本不可新增批注</span>'}
                </div>
            `;
            return;
        }

        let notesHTML = '<div class="space-y-2 p-2">';

        versionAnnotations.slice().reverse().forEach(note => {
            const viewLabel = note.viewType === 'schematic' ? '原理图' : 'PCB';
            const isResolved = note.status === 'resolved';
            const statusIcon = isResolved ? 'fa-check-circle text-green-500' : 'fa-circle text-blue-500';
            const cardBgClass = isResolved ? 'bg-gray-50' : 'bg-white';
            const textClass = isResolved ? 'line-through text-gray-400' : 'text-gray-600';

            // 删除按钮：仅最新版本显示（传入版本信息确保准确定位）
            const deleteBtn = isLatest ?
                `<i class="fas fa-trash text-xs cursor-pointer text-gray-400 hover:text-red-500 delete-btn" onclick="event.stopPropagation(); deleteAnnotation(${note.id}, '${note.version}')" title="删除批注"></i>` : '';

            notesHTML += `
                <div class="note-item p-3 rounded-lg cursor-pointer border border-gray-100 ${cardBgClass}" data-note-id="${note.id}" data-note-version="${note.version}">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center space-x-2">
                            <span class="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">${note.id}</span>
                            <span class="font-bold text-gray-800 text-xs">${note.author}</span>
                            <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">${viewLabel}</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="text-[10px] text-gray-400">${note.time}</span>
                            <i class="fas ${statusIcon} text-xs cursor-pointer hover:opacity-70" onclick="event.stopPropagation(); toggleAnnotationStatus(${note.id}, '${note.version}')" title="${isResolved ? '已解决，点击标记为待处理' : '待处理，点击标记为已解决'}"></i>
                            ${deleteBtn}
                        </div>
                    </div>
                    <div class="text-xs ${textClass} mt-1 line-clamp-2">${note.text}</div>
                </div>
            `;
        });

        notesHTML += '</div>';
        tabContent.innerHTML = notesHTML;

        // 绑定点击事件 - 使用跨视图定位（传入版本信息确保准确定位）
        document.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const noteId = parseInt(item.getAttribute('data-note-id'));
                const noteVersion = item.getAttribute('data-note-version');
                locateAnnotation(noteId, noteVersion);
            });
        });
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

    // ============ 渲染树内容 ============
    function renderTreeContent() {
        if (currentDrawingType === 'schematic') {
            canvasSchematic.classList.remove('hidden');
            canvasPcb.classList.add('hidden');
            
            let treeHTML = '<div class="space-y-3">';
            
            treeHTML += `
                <div>
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-bolt mr-2 text-yellow-500"></i>电源管理
                    </div>
                    <div class="ml-4 space-y-1 mt-1">
                        ${generateTreeItem('U2', 'AMS1117-3.3', 'microchip')}
                        ${generateTreeItem('C1', '100nF 去耦', 'bolt')}
                        ${generateTreeItem('C2', '10uF 滤波', 'bolt')}
                    </div>
                </div>
            `;
            
            treeHTML += `
                <div>
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-microchip mr-2 text-blue-500"></i>核心 MCU
                    </div>
                    <div class="ml-4 space-y-1 mt-1">
                        ${generateTreeItem('U1', 'STM32F103', 'microchip', true)}
                    </div>
                </div>
            `;
            
            treeHTML += `
                <div>
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-clock mr-2 text-purple-500"></i>时钟系统
                    </div>
                    <div class="ml-4 space-y-1 mt-1">
                        ${generateTreeItem('Y1', '8MHz 晶振', 'wave-square')}
                        ${generateTreeItem('C3', '22pF 负载', 'bolt')}
                    </div>
                </div>
            `;
            
            treeHTML += `
                <div>
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-circle-notch mr-2 text-green-500"></i>外围电路
                    </div>
                    <div class="ml-4 space-y-1 mt-1">
                        ${generateTreeItem('R1', '10K 上拉', 'minus')}
                        ${generateTreeItem('R2', '4.7K 限流', 'minus')}
                        ${generateTreeItem('R3', '330R LED限流', 'minus')}
                        ${generateTreeItem('D1', 'LED 指示灯', 'lightbulb')}
                    </div>
                </div>
            `;
            
            treeHTML += `
                <div>
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-plug mr-2 text-orange-500"></i>接口
                    </div>
                    <div class="ml-4 space-y-1 mt-1">
                        ${generateTreeItem('J1', 'SWD 4P 调试', 'plug')}
                    </div>
                </div>
            `;
            
            treeHTML += '</div>';
            tabContent.innerHTML = treeHTML;
            
        } else {
            canvasSchematic.classList.add('hidden');
            canvasPcb.classList.remove('hidden');
            tabContent.innerHTML = `
                <div class="space-y-3">
                    <div>
                        <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                            <i class="fas fa-layer-group mr-2 text-gray-400"></i>图层管理
                        </div>
                        <div class="ml-4 space-y-1 mt-1">
                            <div class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked class="mr-3 w-3 h-3 accent-blue-600">
                                <span class="text-gray-600">Top Layer (顶层信号)</span>
                            </div>
                            <div class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked class="mr-3 w-3 h-3 accent-blue-600">
                                <span class="text-gray-600">Bottom Layer (底层信号)</span>
                            </div>
                            <div class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked class="mr-3 w-3 h-3 accent-blue-600">
                                <span class="text-gray-600">Top Silkscreen (丝印)</span>
                            </div>
                        </div>
                    </div>
                    <div class="mt-4">
                        <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                            <i class="fas fa-ruler-combined mr-2 text-gray-400"></i>板框信息
                        </div>
                        <div class="ml-4 mt-2 text-xs text-gray-500">
                            <div>尺寸: 90mm x 70mm</div>
                            <div>层数: 2-Layer</div>
                            <div>板厚: 1.6mm</div>
                        </div>
                    </div>
                </div>
            `;
        }
        bindSvgEvents();
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
            
            if (tabKey === 'tree') {
                renderTreeContent();
                clearDiffHighlight();
            } else if (tabKey === 'diff') {
                renderDiffContent();
                applyDiffHighlight();
            } else if (tabKey === 'notes') {
                renderNotesContent();
                clearDiffHighlight();
            } else {
                tabContent.innerHTML = '<div class="p-4 text-gray-400 italic text-center text-xs">占位内容...</div>';
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
            renderDiffContent();
            applyDiffHighlight();
        });
    }

    // ============ 初始化预置批注 ============
    function renderPresetAnnotations() {
        // 初始化预置批注数据（只在应用启动时执行一次）
        initPresetAnnotations();

        // 为每个预置批注创建 DOM 元素
        annotations.forEach(annotation => {
            // 获取对应视图的批注容器
            const container = getAnnotationContainer(annotation.viewType);
            if (!container) return;

            // 创建批注框
            const annotationBox = document.createElement('div');
            annotationBox.className = 'annotation-box';
            if (annotation.status === 'resolved') {
                annotationBox.classList.add('annotation-resolved');
            }
            // 使用局部坐标（相对于画布）
            annotationBox.style.left = (annotation.centerX - 40) + 'px';
            annotationBox.style.top = (annotation.centerY - 30) + 'px';
            annotationBox.style.width = '80px';
            annotationBox.style.height = '60px';

            // 根据版本决定是否显示（通过样式控制）
            if (annotation.version !== AppState.currentVersion) {
                annotationBox.style.display = 'none';
            }

            // 添加角标
            const badge = document.createElement('div');
            badge.className = 'annotation-badge';
            badge.textContent = annotation.id;
            annotationBox.appendChild(badge);

            // 点击事件
            annotationBox.addEventListener('click', (e) => {
                e.stopPropagation();
                highlightAnnotation(annotation.id, annotation.version);
            });

            // 将批注框添加到对应画布的批注容器
            container.appendChild(annotationBox);

            // 更新批注数据中的 element 引用
            annotation.element = annotationBox;
        });

        // 如果当前在批注列表页签，刷新列表
        if (currentTab === 'notes') {
            renderNotesContent();
        }
    }

    // 执行预置批注渲染（只在 DOMContentLoaded 时执行一次）
    renderPresetAnnotations();

    // 保底渲染：确保初始结构树被渲染
    renderTreeContent();

    // 初始化版本选择器
    initGlobalVersionSelect();
    updateCompareVersionOptions();
});
