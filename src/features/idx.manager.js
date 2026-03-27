// ============ V6.0 IDX (EDMD) 机电协同管理器 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { idxTransactions } from '../data/mock.data.js';

let currentTab = AppState.currentTab;
let transactions = [...idxTransactions];

export function initIdxManager() {
    const tabContent = document.getElementById('tab-content');
    if (!tabContent) {
        console.warn('IDX: tab-content 元素未找到');
        return;
    }

    // 监听 Tab 切换，如果在 collab 页签，则渲染 IDX 面板并唤起 3D
    bus.on('TAB_CHANGED', (tabKey) => {
        currentTab = tabKey;
        if (tabKey === 'collab') {
            renderIdxPanel(tabContent);

            // === 新增：自动切至 PCB 视图并打开 3D 分屏 ===
            // 稍微延迟 50ms 执行，避免阻塞当前帧的渲染
            setTimeout(() => {
                // 如果当前不是 PCB 视图，则模拟点击 PCB 按钮
                if (AppState.currentDrawingType !== 'pcb') {
                    const btnPcb = document.getElementById('btn-pcb');
                    if (btnPcb) btnPcb.click();
                }

                // 如果当前 3D 处于关闭状态，则模拟点击 3D 分屏按钮
                if (!AppState.isSplitViewActive) {
                    const splitBtn = document.getElementById('tool-split-view');
                    if (splitBtn && !splitBtn.classList.contains('hidden')) {
                        splitBtn.click();
                    }
                }
            }, 50);
            // ============================================
        }
    });

    // 初始渲染（如果当前在 collab 页签）
    if (currentTab === 'collab') {
        renderIdxPanel(tabContent);
    }

    console.log('IDX 协同管理器初始化完成');
}

function renderIdxPanel(container) {
    if (transactions.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <i class="fas fa-exchange-alt text-3xl mb-2"></i>
                <span class="text-xs">暂无协同记录</span>
            </div>
        `;
        return;
    }

    let html = '<div class="space-y-3 p-3">';

    transactions.forEach(tx => {
        const typeConfig = getTypeConfig(tx.type);
        const statusConfig = getStatusConfig(tx.status);

        html += `
            <div class="idx-item bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden" data-idx-id="${tx.id}">
                <!-- 头部信息 -->
                <div class="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <span class="text-[10px] px-1.5 py-0.5 rounded ${typeConfig.bgClass} ${typeConfig.textClass} font-medium">
                            ${typeConfig.label}
                        </span>
                        <span class="text-xs font-mono text-gray-500">${tx.id}</span>
                    </div>
                    <span class="text-[10px] text-gray-400">${tx.time}</span>
                </div>
                
                <!-- 内容区域 -->
                <div class="p-3">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center space-x-2">
                            <i class="fas fa-user-circle text-gray-400"></i>
                            <span class="text-xs font-medium text-gray-700">${tx.sender}</span>
                        </div>
                        <span class="text-[10px] px-2 py-0.5 rounded-full ${statusConfig.bgClass} ${statusConfig.textClass}">
                            ${statusConfig.label}
                        </span>
                    </div>
                    
                    <h4 class="text-sm font-medium text-gray-800 mb-2">${tx.title}</h4>
                    
                    <!-- 详情列表 -->
                    ${tx.details.length > 0 ? `
                        <div class="space-y-1.5 mt-3">
                            ${tx.details.map((detail, idx) => `
                                <div class="detail-item flex items-start p-2 rounded bg-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
                                     data-ref="${detail.targetRef}" data-idx="${idx}">
                                    <div class="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold mr-2">
                                        ${detail.action.charAt(0)}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center space-x-1">
                                            <span class="text-xs font-medium text-gray-700">${detail.targetRef}</span>
                                            <span class="text-[10px] text-gray-400">${detail.desc}</span>
                                        </div>
                                        <div class="text-[10px] text-gray-400 mt-0.5">
                                            (${Math.round(detail.oldPos.x)}, ${Math.round(detail.oldPos.y)}) 
                                            <i class="fas fa-arrow-right mx-1"></i> 
                                            (${Math.round(detail.newPos.x)}, ${Math.round(detail.newPos.y)})
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <!-- 预览提示 -->
                    ${tx.status === 'pending' ? `
                        <div class="flex items-center justify-end space-x-2 mt-3 pt-2 border-t border-gray-100">
                            <span class="text-xs text-gray-500 font-medium flex items-center">
                                <i class="fas fa-eye mr-1 text-blue-500"></i>点击上方变更项可预览位移
                            </span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;

    // 绑定事件
    bindIdxEvents(container);
}

let previewStates = {}; // 记录器件的预览状态

function bindIdxEvents(container) {
    // 详情项悬浮/点击：定位并预览元器件
    container.querySelectorAll('.detail-item').forEach(item => {
        const ref = item.getAttribute('data-ref');
        const idx = item.getAttribute('data-idx');
        const txId = item.closest('.idx-item').getAttribute('data-idx-id');

        item.addEventListener('mouseenter', () => {
            if (typeof window.highlightComponent === 'function') window.highlightComponent(ref);
        });

        item.addEventListener('mouseleave', () => {
            if (typeof window.clearHighlight === 'function') window.clearHighlight();
        });

        // 点击切换预览状态
        item.addEventListener('click', () => {
            const tx = transactions.find(t => t.id === txId);
            if (!tx || tx.status !== 'pending') {
                bus.emit('SHOW_TOAST', { message: '该协同记录已固化，仅支持高亮定位', type: 'info' });
                return;
            }

            const detail = tx.details[idx];
            const isPreviewing = !previewStates[ref];
            previewStates[ref] = isPreviewing;

            // UI 状态反馈
            if (isPreviewing) {
                item.classList.add('bg-blue-100', 'border-blue-300');
                item.classList.remove('bg-gray-50');
            } else {
                item.classList.remove('bg-blue-100', 'border-blue-300');
                item.classList.add('bg-gray-50');
            }

            // 计算位移偏差
            const dx = detail.newPos.x - detail.oldPos.x;
            const dy = detail.newPos.y - detail.oldPos.y;

            // 1. 驱动 2D 引擎产生残影预览
            document.querySelectorAll(`.eda-component[data-ref="${ref}"]`).forEach(comp => {
                if (isPreviewing) {
                    comp.style.transform = `translate(${dx}px, ${dy}px)`;
                    comp.style.opacity = '0.5';
                    comp.style.filter = 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.8))'; // 琥珀色发光
                } else {
                    comp.style.transform = '';
                    comp.style.opacity = '1';
                    comp.style.filter = '';
                }
            });

            // 2. 驱动 3D 引擎产生残影预览
            bus.emit('TOGGLE_IDX_PREVIEW_3D', { ref, dx, dy, isPreviewing });
        });
    });
}

function getTypeConfig(type) {
    const configs = {
        baseline: { label: '基线', bgClass: 'bg-blue-100', textClass: 'text-blue-700' },
        propose: { label: '建议', bgClass: 'bg-yellow-100', textClass: 'text-yellow-700' },
        accept: { label: '接受', bgClass: 'bg-green-100', textClass: 'text-green-700' },
        reject: { label: '拒绝', bgClass: 'bg-red-100', textClass: 'text-red-700' }
    };
    return configs[type] || { label: type, bgClass: 'bg-gray-100', textClass: 'text-gray-700' };
}

function getStatusConfig(status) {
    const configs = {
        applied: { label: '已应用', bgClass: 'bg-gray-100', textClass: 'text-gray-600' },
        pending: { label: '待处理', bgClass: 'bg-yellow-100', textClass: 'text-yellow-700' },
        accepted: { label: '已接受', bgClass: 'bg-green-100', textClass: 'text-green-700' },
        rejected: { label: '已拒绝', bgClass: 'bg-red-100', textClass: 'text-red-700' }
    };
    return configs[status] || { label: status, bgClass: 'bg-gray-100', textClass: 'text-gray-600' };
}
