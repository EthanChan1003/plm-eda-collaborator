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

    // 监听 Tab 切换，如果在 collab 页签，则渲染 IDX 面板
    bus.on('TAB_CHANGED', (tabKey) => {
        currentTab = tabKey;
        if (tabKey === 'collab') {
            renderIdxPanel(tabContent);
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
                    
                    <!-- 操作按钮 -->
                    ${tx.status === 'pending' ? `
                        <div class="flex items-center justify-end space-x-2 mt-3 pt-2 border-t border-gray-100">
                            <button class="idx-reject-btn px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors" data-idx-id="${tx.id}">
                                <i class="fas fa-times mr-1"></i>拒绝
                            </button>
                            <button class="idx-accept-btn px-3 py-1 text-xs text-white bg-green-500 hover:bg-green-600 rounded transition-colors" data-idx-id="${tx.id}">
                                <i class="fas fa-check mr-1"></i>接受
                            </button>
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

function bindIdxEvents(container) {
    // 详情项悬浮/点击：定位元器件
    container.querySelectorAll('.detail-item').forEach(item => {
        const ref = item.getAttribute('data-ref');

        item.addEventListener('mouseenter', () => {
            if (typeof window.highlightComponent === 'function') {
                window.highlightComponent(ref);
            }
        });

        item.addEventListener('mouseleave', () => {
            if (typeof window.clearHighlight === 'function') {
                window.clearHighlight();
            }
        });

        item.addEventListener('click', () => {
            if (typeof window.selectComponent === 'function') {
                window.selectComponent(ref);
            }
        });
    });

    // 接受按钮
    container.querySelectorAll('.idx-accept-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idxId = btn.getAttribute('data-idx-id');
            handleAccept(idxId);
        });
    });

    // 拒绝按钮
    container.querySelectorAll('.idx-reject-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idxId = btn.getAttribute('data-idx-id');
            handleReject(idxId);
        });
    });
}

function handleAccept(idxId) {
    const tx = transactions.find(t => t.id === idxId);
    if (!tx || tx.status !== 'pending') return;

    // 更新状态
    tx.status = 'accepted';

    // 执行实际的器件位置移动
    tx.details.forEach(detail => {
        bus.emit('COMPONENT_MOVE', {
            ref: detail.targetRef,
            oldPos: detail.oldPos,
            newPos: detail.newPos,
            source: 'IDX'
        });
    });

    // 触发全局 Toast 提示
    bus.emit('SHOW_TOAST', {
        message: `已接受 ${tx.sender} 的协同建议 (${tx.details.length} 处变更)`,
        type: 'success'
    });

    // 重新渲染
    const tabContent = document.getElementById('tab-content');
    if (tabContent && currentTab === 'collab') {
        renderIdxPanel(tabContent);
    }

    // 通知其他模块更新
    bus.emit('IDX_TRANSACTION_UPDATED', tx);
}

function handleReject(idxId) {
    const tx = transactions.find(t => t.id === idxId);
    if (!tx || tx.status !== 'pending') return;

    // 更新状态
    tx.status = 'rejected';

    // 触发全局 Toast 提示
    bus.emit('SHOW_TOAST', {
        message: `已拒绝 ${tx.sender} 的协同建议`,
        type: 'warning'
    });

    // 重新渲染
    const tabContent = document.getElementById('tab-content');
    if (tabContent && currentTab === 'collab') {
        renderIdxPanel(tabContent);
    }

    // 通知其他模块更新
    bus.emit('IDX_TRANSACTION_UPDATED', tx);
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
