// ============ V5.0 版本管理器 - 全局版本控制与差异对比 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { versionedComponentData, versionDiffLibrary } from '../data/mock.data.js';

// 局部状态
let mockComponentData = { ...versionedComponentData[AppState.currentVersion] };
let mockDiffData = {};
let currentTab = AppState.currentTab || 'tree';

// 挂载到 window 供其他模块访问
window.mockDiffData = mockDiffData;
window.mockComponentData = mockComponentData;

// 版本比较辅助函数：将 'V2.1' 转换为数值 2.1
function parseVersion(v) {
    return parseFloat(v.replace('V', ''));
}

// 获取当前版本的组件数据
function getCurrentComponentData() {
    return versionedComponentData[AppState.currentVersion] || versionedComponentData['V2.1'];
}

// 计算版本差异
function calculateVersionDiff(currentVersion, compareVersion) {
    const key = `${currentVersion}-vs-${compareVersion}`;
    if (versionDiffLibrary[key]) {
        mockDiffData = { ...versionDiffLibrary[key] };
        window.mockDiffData = mockDiffData;
        return true;
    }
    mockDiffData = {};
    window.mockDiffData = mockDiffData;
    return false;
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
                    if (comp.closest('#canvas-schematic') || comp.closest('#canvas-pcb')) {
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

// 应用差异高亮
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

export function initVersionManager() {
    const globalVersionSelect = document.getElementById('global-version-select');
    const versionCompareSelect = document.getElementById('version-compare');

    // 初始化全局版本下拉框（降序排列 + 最新标记）
    function initGlobalVersionSelect() {
        if (!globalVersionSelect) return;
        const allVersions = ['V1.0', 'V2.0', 'V2.1'];
        const currentVal = globalVersionSelect.value || AppState.currentVersion;

        globalVersionSelect.innerHTML = allVersions
            .sort((a, b) => parseVersion(b) - parseVersion(a))
            .map(v => {
                const isLatest = v === AppState.latestVersion;
                const label = isLatest ? `${v} 最新` : v;
                return `<option value="${v}" ${v === currentVal ? 'selected' : ''}>${label}</option>`;
            })
            .join('');
    }

    // 更新对比版本下拉框选项
    function updateCompareVersionOptions() {
        if (!versionCompareSelect) return;
        const currentVersionNum = parseVersion(AppState.currentVersion);
        const allVersions = ['V1.0', 'V2.0', 'V2.1'];

        const lowerVersions = allVersions.filter(v => parseVersion(v) < currentVersionNum);

        if (lowerVersions.length === 0) {
            versionCompareSelect.innerHTML = '<option value="" disabled selected>无历史版本</option>';
            versionCompareSelect.disabled = true;
        } else {
            const currentVal = versionCompareSelect.value;
            versionCompareSelect.disabled = false;
            versionCompareSelect.innerHTML = lowerVersions
                .sort((a, b) => parseVersion(b) - parseVersion(a))
                .map(v => `<option value="${v}" ${v === currentVal ? 'selected' : ''}>${v}</option>`)
                .join('');

            if (!versionCompareSelect.value) {
                versionCompareSelect.value = lowerVersions[0];
            }
            calculateVersionDiff(AppState.currentVersion, versionCompareSelect.value);
        }
    }

    // 全局版本切换
    function switchGlobalVersion(newVersion) {
        AppState.currentVersion = newVersion;
        mockComponentData = { ...versionedComponentData[AppState.currentVersion] };
        window.mockComponentData = mockComponentData;

        // 同步画布图元显示/隐藏
        syncCanvasComponents();

        // 通知其他模块
        bus.emit('VERSION_CHANGED', AppState.currentVersion);
        bus.emit('TAB_CHANGED', currentTab);

        // Diff 页签需要额外处理高亮
        if (currentTab === 'diff') {
            applyDiffHighlight();
        }

        // 更新对比版本下拉框选项
        updateCompareVersionOptions();
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

    // EventBus 监听
    bus.on('TAB_CHANGED', (tabKey) => {
        currentTab = tabKey;
    });

    // 初始化
    initGlobalVersionSelect();
    updateCompareVersionOptions();

    console.log('版本管理器初始化完成');
}
