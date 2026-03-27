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

    // ============ 批注功能已迁移至 src/features/annotation.manager.js ============

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

    // ============ 选择器与属性卡片功能已迁移至 src/features/selection.manager.js ============

    // ============ 搜索功能已迁移至 src/features/search.manager.js ============
    // ============ 画布交互已迁移至 src/features/selection.manager.js ============

    // generateTreeItem 已迁移至 src/ui/sidebar.js
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

    // 全局 Hover 联动函数已迁移至 src/features/selection.manager.js
});
