// ============ V4.0 ES6 模块引入与状态桥接 ============
import { AppState } from './core/state.js';
import { bus } from './core/event.bus.js';
import { versionedComponentData, versionDiffLibrary, presetAnnotations } from './data/mock.data.js';
import { canvasState, updateCanvasState } from './core/engine.2d.js';

// 兜底引入拆分出去的功能，防止旧代码报错
import * as Mcad3D from './features/mcad.3d.js';
import * as ExportPdf from './features/export.pdf.js';
import { getAnnotations } from './features/annotation.manager.js';

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

    // 2D/3D 分屏容器 (供视图切换使用)
    const view2dContainer = document.getElementById('view-2d-container');
    const view3dContainer = document.getElementById('view-3d-container');

    // 工具栏按钮已迁移至 src/ui/toolbar.js

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

        // 2. 通知批注管理器切换版本
        bus.emit('VERSION_CHANGED', AppState.currentVersion);

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

    // ============ 工具栏功能已迁移至 src/ui/toolbar.js ============
    // 画布缩放功能通过 EventBus 在 engine.2d.js 中处理

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
        const annotation = getAnnotations().find(a => a.id === annotationId && a.version === targetVersion);
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
        }
    }

    // ============ 批注状态切换功能 ============
    window.toggleAnnotationStatus = function(id, version) {
        // 优先使用传入的版本，否则使用当前版本
        const targetVersion = version || AppState.currentVersion;
        const annotation = getAnnotations().find(a => a.id === id && a.version === targetVersion);
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
    };

    // ============ 批注删除功能 ============
    window.deleteAnnotation = function(id, version) {
        // 优先使用传入的版本，否则使用当前版本
        const targetVersion = version || AppState.currentVersion;
        const annotation = getAnnotations().find(a => a.id === id && a.version === targetVersion);
        if (!annotation) return;
        
        // 1. 从 DOM 中移除对应的批注框
        if (annotation.element && annotation.element.parentNode) {
            annotation.element.parentNode.removeChild(annotation.element);
        }
        
        // 2. 通过事件总线通知批注管理器删除
        bus.emit('ANNOTATION_DELETE', { id, version: targetVersion });
    };

    // ============ 跨视图定位功能 ============
    window.locateAnnotation = function(annotationId, version) {
        // 优先使用传入的版本，否则使用当前版本进行双重校验
        const targetVersion = version || AppState.currentVersion;
        const annotation = getAnnotations().find(a => a.id === annotationId && a.version === targetVersion);
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
        bus.emit('CANVAS_STATE_CHANGED');

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

        // 隐藏分屏按钮，原理图不支持 3D 视图
        if (toolSplitView) toolSplitView.classList.add('hidden');
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
        // 通知 Sidebar 刷新
        bus.emit('VIEW_CHANGED', 'pcb');
        bus.emit('TAB_CHANGED', currentTab);

        // 显示分屏按钮，PCB 视图支持 3D 协同
        if (toolSplitView) toolSplitView.classList.remove('hidden');
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
            matches = getAnnotations().filter(note =>
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
                    const match = getAnnotations().find(note =>
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

    // 初始渲染由 Sidebar 通过事件监听处理
    bus.emit('VIEW_CHANGED', currentDrawingType);
    bus.emit('TAB_CHANGED', currentTab);

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
