// ============ V4.0 布局管理器 - Tab 切换、视图切换、图层控制 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';

export function initLayoutManager() {
    // DOM 获取
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabTitle = document.getElementById('tab-title');
    const panelTopSearch = document.getElementById('panel-top-search');
    const panelTopDiff = document.getElementById('panel-top-diff');
    const panelBottomNotes = document.getElementById('panel-bottom-notes');

    const btnSchematic = document.getElementById('btn-schematic');
    const btnPcb = document.getElementById('btn-pcb');
    const canvasSchematic = document.getElementById('canvas-schematic');
    const canvasPcb = document.getElementById('canvas-pcb');

    const searchInput = document.getElementById('search-input');

    // 当前状态
    let currentTab = AppState.currentTab || 'tree';
    let currentDrawingType = AppState.currentDrawingType || 'schematic';

    // ============ PCB 图层状态机 ============
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

        // === 新增：将图层显隐信号广播给 3D 引擎 ===
        bus.emit('PCB_LAYER_TOGGLED', { layerName, isVisible });
        // ===========================================
    };

    // ============ 视图切换 ============
    function switchToSchematic() {
        currentDrawingType = 'schematic';
        AppState.currentDrawingType = 'schematic';

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

        // 通知其他模块
        bus.emit('VIEW_CHANGED', 'schematic');
        bus.emit('TAB_CHANGED', currentTab);
    }

    function switchToPcb() {
        currentDrawingType = 'pcb';
        AppState.currentDrawingType = 'pcb';

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

        // 通知其他模块
        bus.emit('VIEW_CHANGED', 'pcb');
        bus.emit('TAB_CHANGED', currentTab);
    }

    // 视图按钮事件绑定
    if (btnSchematic) btnSchematic.addEventListener('click', switchToSchematic);
    if (btnPcb) btnPcb.addEventListener('click', switchToPcb);

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
            if (searchInput) {
                if (tabKey === 'tree') {
                    searchInput.placeholder = '搜索位号 / 网络名...';
                } else if (tabKey === 'diff') {
                    searchInput.placeholder = '搜索位号 / 差异描述...';
                } else if (tabKey === 'notes') {
                    searchInput.placeholder = '搜索批注内容...';
                }
            }

            // 更新 Tab 按钮样式
            tabButtons.forEach(b => {
                b.classList.remove('text-blue-600', 'bg-blue-50');
                b.classList.add('text-gray-400');
            });
            btn.classList.add('text-blue-600', 'bg-blue-50');
            btn.classList.remove('text-gray-400');

            // 更新标题
            if (tabTitle) tabTitle.innerText = config.title;

            // 通知其他模块
            bus.emit('TAB_CHANGED', tabKey);

            // 同步面板显隐
            if (panelTopSearch) panelTopSearch.classList.toggle('hidden', !config.showSearch);
            if (panelTopDiff) panelTopDiff.classList.toggle('hidden', !config.showDiff);
            if (panelBottomNotes) panelBottomNotes.classList.toggle('hidden', !config.showBottom);
        });
    });

    // ============ EventBus 监听 ============
    // 监听版本变化，更新 Diff 高亮
    bus.on('VERSION_CHANGED', () => {
        if (currentTab === 'diff') {
            bus.emit('TAB_CHANGED', 'diff');
        }
    });

    // 监听批注管理器发出的跨视图请求
    bus.on('REQUEST_VIEW_CHANGE', (viewType) => {
        if (viewType === 'schematic') switchToSchematic();
        else if (viewType === 'pcb') switchToPcb();
    });

    // 初始触发
    bus.emit('VIEW_CHANGED', currentDrawingType);
    bus.emit('TAB_CHANGED', currentTab);

    console.log('布局管理器初始化完成');
}
