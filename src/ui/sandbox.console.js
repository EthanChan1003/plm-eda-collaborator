// ============ 模拟数据测试沙箱控制台 ============
// 核心定位：纯粹的触发器，通过EventBus进行跨模块通信
// 架构：插件化/多插槽UI，当前支持"IDX协同"Tab

import { bus } from '../core/event.bus.js';
import { idxTransactions, presetAnnotations } from '../data/mock.data.js';

// ============ 状态管理 ============
let isPanelVisible = false;
let currentTab = 'idx';
let panelPosition = { x: 0, y: 0 }; // 面板位置（用于拖拽）
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// 本地数据副本（用于操作）
let localIdxTransactions = JSON.parse(JSON.stringify(idxTransactions));
let localAnnotations = JSON.parse(JSON.stringify(presetAnnotations));

// 挂载到全局供外部访问
window.sandboxData = {
    idxTransactions: localIdxTransactions,
    annotations: localAnnotations
};

// ============ 初始化入口 ============
export function initSandboxConsole() {
    renderFAB();
    bindGlobalEvents();
    console.log('沙箱控制台初始化完成');
}

// ============ 折叠态：FAB悬浮按钮 ============
function renderFAB() {
    // 检查是否已存在
    if (document.getElementById('sandbox-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'sandbox-fab';
    fab.className = 'sandbox-fab';
    fab.innerHTML = `
        <button class="fab-btn" title="模拟数据测试">
            <i class="fas fa-terminal"></i>
        </button>
        <span class="fab-tooltip">模拟数据测试</span>
    `;

    document.body.appendChild(fab);

    // 绑定点击事件
    fab.querySelector('.fab-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
    });
}

// ============ 切换面板显示/隐藏 ============
function togglePanel() {
    if (isPanelVisible) {
        hidePanel();
    } else {
        showPanel();
    }
}

function showPanel() {
    isPanelVisible = true;
    
    // 隐藏FAB
    const fab = document.getElementById('sandbox-fab');
    if (fab) fab.style.display = 'none';
    
    // 创建面板
    renderPanel();
}

function hidePanel() {
    isPanelVisible = false;
    
    // 移除面板
    const panel = document.getElementById('sandbox-panel');
    if (panel) panel.remove();
    
    // 显示FAB
    const fab = document.getElementById('sandbox-fab');
    if (fab) fab.style.display = 'flex';
}

// ============ 展开态：控制台面板 ============
function renderPanel() {
    // 检查是否已存在
    if (document.getElementById('sandbox-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'sandbox-panel';
    panel.className = 'sandbox-panel';
    
    // 计算初始位置（右下角，避开画板核心区域）
    const initialX = window.innerWidth - 440 - 24;
    const initialY = window.innerHeight - 450 - 24;
    panelPosition = { x: initialX, y: initialY };
    
    panel.style.left = `${initialX}px`;
    panel.style.top = `${initialY}px`;

    panel.innerHTML = `
        <!-- Layer 1: 头部（拖拽把手） -->
        <div class="panel-header">
            <div class="header-drag-handle">
                <i class="fas fa-grip-vertical text-gray-400 mr-2"></i>
                <span class="header-title">模拟数据测试</span>
                <span class="header-disclaimer">仅供演示使用</span>
            </div>
            <button class="header-collapse-btn" title="收起">
                <i class="fas fa-minus"></i>
            </button>
        </div>
        
        <!-- Layer 2: Tab导航栏 -->
        <div class="panel-tabs">
            <button class="tab-item active" data-tab="idx">
                <i class="fas fa-exchange-alt mr-1"></i>IDX协同
            </button>
            <!-- 未来扩展：DRC规则模拟、版本冲突模拟等 -->
            <button class="tab-item disabled" data-tab="drc" disabled>
                <i class="fas fa-ruler-combined mr-1"></i>DRC模拟
            </button>
            <button class="tab-item disabled" data-tab="version" disabled>
                <i class="fas fa-code-branch mr-1"></i>版本冲突
            </button>
        </div>
        
        <!-- Layer 3: 动态内容视口 -->
        <div class="panel-viewport">
            ${renderViewportContent()}
        </div>
        
        <!-- Layer 4: 全局操作底栏 -->
        <div class="panel-footer">
            <button id="btn-reset-all" class="reset-btn">
                <i class="fas fa-redo mr-1"></i>重置所有测试数据
            </button>
        </div>
    `;

    document.body.appendChild(panel);

    // 绑定事件
    bindPanelEvents(panel);
}

// ============ 视口内容渲染 ============
function renderViewportContent() {
    if (currentTab === 'idx') {
        return renderIdxContent();
    }
    return '<div class="empty-state">暂无内容</div>';
}

// ============ IDX协同Tab内容 ============
function renderIdxContent() {
    // 筛选pending状态的提议
    const pendingProposals = [];
        
    // === 修复 1：只提取最新的一条 pending 事务进行模拟，避免历史版本（如 C3）污染沙箱 ===
    const latestPendingTx = localIdxTransactions.slice().reverse().find(tx => tx.status === 'pending');
    
    if (latestPendingTx && latestPendingTx.details) {
        latestPendingTx.details.forEach(detail => {
            if (detail.status === 'pending' || !detail.status) {
                pendingProposals.push({
                    txId: latestPendingTx.id,
                    detailId: detail.id || `${latestPendingTx.id}-${detail.targetRef}`,
                    targetRef: detail.targetRef,
                    desc: detail.desc || '变更提议',
                    sender: latestPendingTx.sender,
                    time: latestPendingTx.time
                });
            }
        });
    }
    
    if (pendingProposals.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>当前无可模拟的挂起任务</p>
            </div>
        `;
    }
    
    let html = '<div class="pending-list">';
        
    pendingProposals.forEach((proposal, index) => {
        // === 修复 3：使用 !block 和 !p-0 覆盖原 CSS 的 flex 居中，重新使用 Tailwind 布局 ===
        html += `
            <div class="pending-item !block !p-0 bg-white border border-gray-200 rounded-lg shadow-sm mb-3 overflow-hidden" data-tx-id="${proposal.txId}" data-detail-id="${proposal.detailId}" data-ref="${proposal.targetRef}">
                <div class="p-3 text-left">
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="font-bold text-gray-800 text-sm">${proposal.targetRef}</span>
                        <span class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">${proposal.txId}</span>
                    </div>
                    <div class="text-xs text-gray-600 line-clamp-2 leading-relaxed">${proposal.desc}</div>
                </div>
                <div class="flex justify-end space-x-2 bg-gray-50 border-t border-gray-100 px-3 py-2">
                    <button class="action-btn reject-btn px-3 py-1.5 bg-white text-red-600 border border-red-200 hover:bg-red-50 rounded text-xs transition-colors flex items-center shadow-sm">
                        <i class="fas fa-times mr-1"></i>拒绝
                    </button>
                    <button class="action-btn accept-btn px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded text-xs transition-colors flex items-center shadow-sm">
                        <i class="fas fa-check mr-1"></i>接受
                    </button>
                </div>
            </div>
        `;
    });
        
    html += '</div>';
    return html;
}

// ============ 面板事件绑定 ============
function bindPanelEvents(panel) {
    // 收起按钮
    panel.querySelector('.header-collapse-btn').addEventListener('click', () => {
        hidePanel();
    });

    // Tab切换
    panel.querySelectorAll('.tab-item:not(.disabled)').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.dataset.tab;
            // 更新Tab激活状态
            panel.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // 重新渲染视口
            const viewport = panel.querySelector('.panel-viewport');
            viewport.innerHTML = renderViewportContent();
            // 重新绑定视口内事件
            bindViewportEvents(viewport);
        });
    });

    // 拖拽功能
    const header = panel.querySelector('.panel-header');
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);

    // 视口内事件
    bindViewportEvents(panel.querySelector('.panel-viewport'));

    // 重置按钮
    panel.querySelector('#btn-reset-all').addEventListener('click', handleReset);
}

// ============ 视口内事件绑定 ============
function bindViewportEvents(viewport) {
    viewport.querySelectorAll('.accept-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const item = e.target.closest('.pending-item');
            await handleSync(btn, item, 'MOCK_ECAD_SYNC_ACCEPTED', 'accepted');
        });
    });

    viewport.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const item = e.target.closest('.pending-item');
            await handleSync(btn, item, 'MOCK_ECAD_SYNC_REJECTED', 'rejected');
        });
    });
}

// ============ 接受/拒绝提议处理 ============
async function handleSync(btn, item, eventName, targetStatus) {
    const txId = item.dataset.txId;
    const detailId = item.dataset.detailId;
    const targetRef = item.dataset.ref;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>处理中';
    
    // 禁用同卡片的另一个按钮
    const siblings = item.querySelectorAll('.action-btn');
    siblings.forEach(s => s.disabled = true);

    await new Promise(resolve => setTimeout(resolve, 500));

    // 触发事件
    bus.emit(eventName, { targetRef, txId, detailId });

    // 更新沙箱本地数据状态
    const tx = localIdxTransactions.find(t => t.id === txId);
    if (tx && tx.details) {
        const detail = tx.details.find(d => (d.id || `${txId}-${d.targetRef}`) === detailId);
        if (detail) detail.status = targetStatus;
        
        const hasPending = tx.details.some(d => d.status === 'pending' || !d.status);
        if (!hasPending) {
            tx.status = tx.details.every(d => d.status === 'rejected') ? 'rejected' : 'accepted';
        }
    }

    item.style.transition = 'all 0.3s ease';
    item.style.opacity = '0';
    item.style.transform = 'translateX(20px)';
    
    setTimeout(() => {
        item.remove();
        const viewport = document.querySelector('.panel-viewport');
        if (viewport && viewport.querySelectorAll('.pending-item').length === 0) {
            viewport.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>当前无可模拟的挂起任务</p></div>`;
        }
    }, 300);
}

// ============ 重置所有测试数据 ============
function handleReset() {
    // === 修复 2：直接使用原始 mock 数据进行深度克隆，移除错误的状态覆盖循环 ===
    localIdxTransactions = JSON.parse(JSON.stringify(idxTransactions));
    localAnnotations = JSON.parse(JSON.stringify(presetAnnotations));

    // 更新全局引用
    window.sandboxData.idxTransactions = localIdxTransactions;
    window.sandboxData.annotations = localAnnotations;

    // 发射重置事件给其他模块 (如 idx.manager.js)
    bus.emit('SANDBOX:RESET_ALL');

    // 刷新沙箱视口
    const viewport = document.querySelector('.panel-viewport');
    if (viewport) {
        viewport.innerHTML = renderViewportContent();
        bindViewportEvents(viewport);
    }

    console.log('沙箱：已重置所有测试数据，页面已恢复初始状态');
}

// ============ 拖拽功能 ============
function startDrag(e) {
    if (e.target.closest('.header-collapse-btn')) return;
    
    const panel = document.getElementById('sandbox-panel');
    if (!panel) return;

    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    
    panel.style.transition = 'none';
    document.body.style.userSelect = 'none';
}

function onDrag(e) {
    if (!isDragging) return;

    const panel = document.getElementById('sandbox-panel');
    if (!panel) return;

    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;

    // 边界约束
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;
    
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    panel.style.left = `${newX}px`;
    panel.style.top = `${newY}px`;
    panelPosition = { x: newX, y: newY };
}

function endDrag() {
    isDragging = false;
    document.body.style.userSelect = '';
}

// ============ 全局事件监听 ============
function bindGlobalEvents() {
    // 监听批注数据更新
    bus.on('ANNOTATIONS_UPDATED', () => {
        if (isPanelVisible && currentTab === 'idx') {
            const viewport = document.querySelector('.panel-viewport');
            if (viewport) {
                viewport.innerHTML = renderViewportContent();
                bindViewportEvents(viewport);
            }
        }
    });

    // 监听IDX数据刷新
    bus.on('IDX_DATA_REFRESH', () => {
        localIdxTransactions = JSON.parse(JSON.stringify(idxTransactions));
        window.sandboxData.idxTransactions = localIdxTransactions;
        
        if (isPanelVisible && currentTab === 'idx') {
            const viewport = document.querySelector('.panel-viewport');
            if (viewport) {
                viewport.innerHTML = renderViewportContent();
                bindViewportEvents(viewport);
            }
        }
    });
}
