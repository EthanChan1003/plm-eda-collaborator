// ============ V4.0 选择管理器 - 器件选择与属性卡片 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';

// 局部状态
let currentTab = 'tree';
let mockComponentData = {};
let mockDiffData = {};

export function initSelectionManager() {
    // DOM 获取
    const popover = document.getElementById('comp-property-popover');
    const popoverClose = document.getElementById('popover-close');
    const canvasContainer = document.getElementById('canvas-container');

    // 初始化数据
    mockComponentData = window.mockComponentData || {};
    mockDiffData = window.mockDiffData || {};

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

        // 发送选择事件
        bus.emit('COMPONENT_SELECTED', refDes);
    };

    // === 核心修复：支持防回环的全局清理函数 ===
    window.clearSelection = function(fromBus = false) {
        // 1. 执行 2D 侧的物理清理
        hidePropertyCard();
        clearAllSelection();

        // 2. 联动逻辑：如果不是从总线收到的信号，就向外广播
        // 这样：2D 点击 -> 广播 -> 3D 收到；而 3D 点击 -> 2D 收到 -> 不再广播（切断死循环）
        if (!fromBus) {
            console.log("2D 发起全局清理信号");
            bus.emit('CLEAR_SELECTION');
        }
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
        // 新增：点击空白处时，同步隐藏批注气泡
        if (typeof window.hideAnnotationBubble === 'function') {
            window.hideAnnotationBubble();
        }
    }

    // ============ 全局 Hover 联动函数（挂载到 window 供 HTML 内联调用） ============
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

    // ============ 画布交互 ============
    function bindSvgEvents() {
        const components = document.querySelectorAll('.eda-component');
        components.forEach(comp => {
            comp.addEventListener('click', (e) => {
                e.stopPropagation();
                const ref = comp.getAttribute('data-ref');
                window.selectComponent(ref);
            });
        });
    }

    // 2. 核心修复：扩大点击监听范围
    // 不仅仅监听 container，我们要确保点击 SVG 的空白处也能触发
    if (canvasContainer) {
        canvasContainer.addEventListener('click', (e) => {
            // 如果点击的是容器本身，或者是底层的 PCB 基板(假设 ID 或类名)
            // 或者是没有任何 data-ref 的空白区域
            const isComponent = e.target.closest('.eda-component');
            if (!isComponent) {
                console.log("2D 侧感知到空白点击");
                window.clearSelection();
            }
        });
    }

    // 属性卡片点击阻止冒泡
    if (popover) {
        popover.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // 关闭按钮
    if (popoverClose) {
        popoverClose.addEventListener('click', () => {
            hidePropertyCard();
            clearAllSelection();
        });
    }

    // ============ EventBus 监听 ============
    bus.on('TAB_CHANGED', (tabKey) => {
        currentTab = tabKey;
    });

    bus.on('VIEW_CHANGED', () => {
        // 视图切换后重新绑定器件点击事件
        setTimeout(() => bindSvgEvents(), 0);
    });

    // 3. 监听来自 3D 或其他模块的清理信号
    bus.on('CLEAR_SELECTION', () => {
        // 收到信号，仅执行内部清理，标记为 fromBus=true 防止死循环
        window.clearSelection(true); 
    });

    // === 核心修复：监听版本切换事件，同步更新数据引用 ===
    bus.on('DATA_UPDATED', () => {
        mockComponentData = window.mockComponentData || {};
        mockDiffData = window.mockDiffData || {};
    });

    // 初始绑定
    setTimeout(() => bindSvgEvents(), 100);

    console.log('选择管理器初始化完成');
}
