// ============ V6.0 IDX (EDMD) 机电协同管理器 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { updateCanvasState } from '../core/engine.2d.js';
// === 新增：引入批注数据，用于查询关联状态 ===
import { idxTransactions, presetAnnotations } from '../data/mock.data.js';

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
        } else {
            // === 新增：当离开 collab 面板时，清理所有预览状态 ===
            cleanupAllPreviews();
        }
    });

    // === 新增：监听 VIEW_CHANGED 事件，在视图切换时也清理预览状态 ===
    bus.on('VIEW_CHANGED', (viewType) => {
        // 如果切换到非 PCB 视图，清理预览状态
        if (viewType !== 'pcb') {
            cleanupAllPreviews();
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
                            ${tx.details.map((detail, idx) => {
                                // === 核心替换：带有状态关联与视觉隔离的 UI 渲染 ===
                                const ref = detail.targetRef;
                                            
                                // 动态计算关联的批注数量
                                const linkedAnnotations = presetAnnotations.filter(a => a.linkedIdxId === tx.id);
                                const openLinkedCount = linkedAnnotations.filter(a => a.status === 'open').length;
                    
                                return `
                                <div class="detail-item p-3 bg-gray-50 rounded border border-gray-200 cursor-pointer transition-all duration-200 mb-2" data-ref="${ref}" data-txid="${tx.id}" data-idx="${idx}">
                                    <div class="flex justify-between items-start mb-1">
                                        <span class="font-bold text-gray-800">${ref}</span>
                                        <span class="text-xs px-1.5 py-0.5 rounded ${tx.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}">${tx.status === 'pending' ? '待处理' : '已固化'}</span>
                                    </div>
                                    <p class="text-xs text-gray-600 mb-2">${tx.desc || detail.desc}</p>
                                    <div class="text-xs font-mono text-gray-500 bg-white p-1.5 rounded border border-gray-100 mb-2">
                                        ${detail.oldPos ? `X: ${detail.oldPos.x} &rarr; ${detail.newPos.x}<br>Y: ${detail.oldPos.y} &rarr; ${detail.newPos.y}` : `变更详情见 3D 视图`}
                                    </div>
                                                
                                    <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                                        <div class="text-xs text-blue-600 font-medium">
                                            ${linkedAnnotations.length > 0 ? 
                                                `<i class="fas fa-comment-dots mr-1"></i> ${openLinkedCount} 条待解决探讨` : 
                                                `<span class="text-gray-400">暂无探讨</span>`}
                                        </div>
                                        ${tx.status === 'pending' ? `
                                            <button class="btn-link-annotation px-2 py-1 text-xs bg-white border border-blue-300 rounded text-blue-700 hover:bg-blue-50 transition shadow-sm" title="针对此提议添加评审意见" data-txid="${tx.id}" data-ref="${ref}">
                                                <i class="fas fa-thumbtack"></i> 添加批注
                                            </button>
                                        ` : ''}
                                    </div>
                    
                                    ${tx.status === 'pending' ? `
                                    <div class="mt-3 p-2 bg-slate-100 border border-dashed border-slate-300 rounded relative group">
                                        <div class="absolute -top-2 right-2 bg-slate-100 text-slate-400 text-[10px] px-1 font-mono">Mock ECAD Sync</div>
                                        <div class="flex justify-between items-center">
                                            <span class="text-xs text-slate-500"><i class="fas fa-laptop-code mr-1"></i>模拟本地工程师同步</span>
                                            <button class="btn-simulate-accept px-2 py-1 text-xs bg-white border border-emerald-300 rounded text-emerald-700 hover:bg-emerald-50 transition shadow-sm" title="模拟本地软件接受此提议并生成 Response" data-txid="${tx.id}">
                                                <i class="fas fa-check"></i> 固化同步
                                            </button>
                                        </div>
                                    </div>
                                    ` : ''}
                                </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                    
                    <!-- 预览提示 -->
                    ${tx.status === 'pending' ? `
                        <div class="flex items-center justify-end space-x-2 mt-3 pt-2 border-t border-gray-100">
                            <span class="text-xs text-gray-500 font-medium flex items-center">
                                <i class="fas fa-eye mr-1 text-blue-500"></i>点击上方变更项可预览
                            </span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';

    // === 新增：如果存在待处理(pending)的提议，在面板底部固定展示全局控制按钮 ===
    const hasPending = transactions.some(tx => tx.status === 'pending');
    if (hasPending) {
        html += `
            <div class="sticky bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-200 flex justify-center space-x-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                <button id="btn-clear-all-idx" class="px-3 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded transition-colors shadow-sm">
                    清除预览
                </button>
                <button id="btn-preview-all-idx" class="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm transition-colors">
                    预览所有
                </button>
            </div>
        `;
    }

    container.innerHTML = html;

    // 绑定事件
    bindIdxEvents(container);
}

let previewStates = {}; // 记录器件的预览状态

// === 新增：预览状态生命周期清理函数 ===
function cleanupAllPreviews() {
    // 遍历所有活动中的预览状态
    Object.keys(previewStates).forEach(ref => {
        if (previewStates[ref]) {
            // 1. 清理 2D CSS 变换
            document.querySelectorAll(`.eda-component[data-ref="${ref}"]`).forEach(comp => {
                comp.style.transform = '';
                comp.style.opacity = '1';
                comp.style.filter = '';
            });
            
            // 2. 向 3D 引擎发送关闭预览信号
            bus.emit('TOGGLE_IDX_PREVIEW_3D', { ref, dx: 0, dy: 0, isPreviewing: false });
            
            // 3. 重置预览状态
            previewStates[ref] = false;
            
            // 4. 清理 UI 状态
            document.querySelectorAll(`.detail-item[data-ref="${ref}"]`).forEach(item => {
                item.classList.remove('bg-blue-100', 'border-blue-300');
                item.classList.add('bg-gray-50');
            });
        }
    });
    
    // 清空预览状态字典
    previewStates = {};
    
    // === 新增：广播全局清理信号 ===
    bus.emit('CLEANUP_ALL_PREVIEWS');
    
    console.log('IDX: 已清理所有预览状态');
}

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
                
                // === 核心优化 1：镜头自动追踪定位 (Auto-Focus & Locate) ===
                const canvasTransform = document.getElementById('canvas-transform');
                if (canvasTransform && detail.oldPos) {
                    const targetScale = 1.8; // 放大系数，看得更清楚
                    // 画布基准中心是 (500, 400)
                    const targetTranslateX = (500 - detail.oldPos.x) * targetScale;
                    const targetTranslateY = (400 - detail.oldPos.y) * targetScale;
                
                    canvasTransform.style.transition = 'transform 0.4s ease-out';
                    updateCanvasState({
                        scale: targetScale,
                        translateX: targetTranslateX,
                        translateY: targetTranslateY
                    });
                    bus.emit('CANVAS_STATE_CHANGED'); // 广播重绘
                                
                    // === 新增：向 EventBus 发送 LOCATE_COMPONENT 信号，实现 2D/3D 同步定位 ===
                    bus.emit('LOCATE_COMPONENT', { 
                        ref: ref, 
                        targetX: detail.oldPos.x, 
                        targetY: detail.oldPos.y,
                        scale: targetScale 
                    });
                                
                    setTimeout(() => {
                        canvasTransform.style.transition = '';
                    }, 400);
                }
                // =================================================

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

    // === 新增：绑定【清除所有预览】按钮 ===
    const btnClearAll = container.querySelector('#btn-clear-all-idx');
    if (btnClearAll) {
        btnClearAll.addEventListener('click', () => {
            // 需要使用全局清理函数
            cleanupAllPreviews();
        });
    }

    // === 新增：绑定【预览所有更改】按钮 ===
    const btnPreviewAll = container.querySelector('#btn-preview-all-idx');
    if (btnPreviewAll) {
        btnPreviewAll.addEventListener('click', () => {
            transactions.forEach(tx => {
                // 只处理处于待定状态的记录
                if (tx.status === 'pending') {
                    tx.details.forEach(detail => {
                        const ref = detail.targetRef;
                        
                        // 如果已经在预览中了，直接跳过，防止重复渲染
                        if (previewStates[ref]) return;

                        // 标记状态
                        previewStates[ref] = true;

                        // 1. 同步侧边栏列表的选中 UI
                        const detailItem = container.querySelector(`.detail-item[data-ref="${ref}"]`);
                        if (detailItem) {
                            detailItem.classList.add('bg-blue-100', 'border-blue-300');
                            detailItem.classList.remove('bg-gray-50');
                        }

                        // 计算位移偏差
                        const dx = detail.newPos.x - detail.oldPos.x;
                        const dy = detail.newPos.y - detail.oldPos.y;

                        // 2. 驱动 2D 引擎产生残影预览（注意这里不调用 updateCanvasState 追踪镜头）
                        document.querySelectorAll(`.eda-component[data-ref="${ref}"]`).forEach(comp => {
                            comp.style.transform = `translate(${dx}px, ${dy}px)`;
                            comp.style.opacity = '0.5';
                            comp.style.filter = 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.8))';
                        });

                        // 3. 驱动 3D 引擎产生残影预览
                        bus.emit('TOGGLE_IDX_PREVIEW_3D', { ref, dx, dy, isPreviewing: true });
                    });
                }
            });
        });
    }

    // === 新增：绑定交互按钮 ===
    // 1. Web 端发起批注 (只发信号，具体实现在下一个迭代补齐绘图逻辑)
    container.querySelectorAll('.btn-link-annotation').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止卡片本身的预览点击
            const targetRef = btn.getAttribute('data-ref');
            if (window.showToast) {
                window.showToast(`已进入批注模式，请在图纸上点击放置针对 ${targetRef} 的意见`, 'info');
            }
            // 激活图钉工具
            bus.emit('ANNOTATION_SHAPE_CHANGED', 'pin');
            bus.emit('TOOL_MODE_CHANGED', 'ANNOTATE');
            // 此处可以进一步扩展：将 txId 存入 AppState，供保存批注时读取
        });
    });

    // 2. 模拟线下固化同步 (触发状态级联)
    container.querySelectorAll('.btn-simulate-accept').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const txId = btn.getAttribute('data-txid');
            const tx = transactions.find(t => t.id === txId);
            
            if (tx) {
                tx.status = 'accepted'; // 改变自身状态
                
                // === 核心：广播联动信号，要求批注系统自动关闭关联项 ===
                bus.emit('CASCADE_RESOLVE_ANNOTATIONS', txId);
                
                if (window.showToast) {
                    window.showToast(`提议 ${txId} 已在本地固化，关联探讨已自动关闭`, 'success');
                }
                
                // 清理所有高亮残影，并重新渲染当前面板
                bus.emit('VIEW_CHANGED'); 
                const tabContent = document.getElementById('tab-content');
                if (tabContent) renderIdxPanel(tabContent);
            }
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

// === 新增：全局 API 挂载，供其他模块调用 ===
window.cleanupIdxPreviews = cleanupAllPreviews;
