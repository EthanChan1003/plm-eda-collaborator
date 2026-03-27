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
    // DOM 元素 - 仅保留版本选择器相关
    const globalVersionSelect = document.getElementById('global-version-select');
    const versionCompareSelect = document.getElementById('version-compare');

    // 布局管理功能已迁移至 src/ui/layout.manager.js

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

        // 4. 更新对比版本下拉框选项（排除当前版本）
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

    // ============ 选择器与属性卡片功能已迁移至 src/features/selection.manager.js ============

    // ============ 搜索功能已迁移至 src/features/search.manager.js ============

    // ============ 布局管理功能已迁移至 src/ui/layout.manager.js ============

    // 初始事件触发
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
