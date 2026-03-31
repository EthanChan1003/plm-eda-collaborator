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

    // === 核心修复：监听数据刷新事件 ===
    bus.on('ANNOTATIONS_UPDATED', () => {
        if (currentTab === 'collab') {
            const tabContent = document.getElementById('tab-content');
            if (tabContent) renderIdxPanel(tabContent);
        }
    });

    // === 沙箱控制台事件监听：接受提议（完整闭环逻辑） ===
    bus.on('MOCK_ECAD_SYNC_ACCEPTED', ({ targetRef, txId, detailId }) => {
        console.log('[IDX] 收到接受提议事件:', { targetRef, txId, detailId });
        
        // ========== Step 1: 强制清理预览状态 ==========
        if (previewStates[targetRef]) {
            // 清理 2D CSS 变换
            document.querySelectorAll(`.eda-component[data-ref="${targetRef}"]`).forEach(comp => {
                comp.style.transform = '';
                comp.style.opacity = '1';
                comp.style.filter = '';
            });
            
            // 通知 3D 引擎关闭残影模式
            bus.emit('TOGGLE_IDX_PREVIEW_3D', { ref: targetRef, dx: 0, dy: 0, isPreviewing: false });
            
            // 重置预览状态
            previewStates[targetRef] = false;
            console.log(`[IDX] 已清理 ${targetRef} 的预览状态`);
        }
        
        // ========== Step 2: 物理挪移与数据持久化 ==========
        const tx = transactions.find(t => t.id === txId);
        let detail = null;
        if (tx && tx.details) {
            detail = tx.details.find(d => (d.id || `${txId}-${d.targetRef}`) === detailId);
        }
        
        if (detail && detail.oldPos && detail.newPos) {
            const dx = detail.newPos.x - detail.oldPos.x;
            const dy = detail.newPos.y - detail.oldPos.y;
            const dz = detail.newZ !== undefined ? (detail.newZ - detail.oldZ) : 0;
            
            // DOM 层：直接修改 2D 画布中器件的物理坐标
            document.querySelectorAll(`.eda-component[data-ref="${targetRef}"]`).forEach(comp => {
                // 获取当前位置（如果有 g 元素包裹，需要处理 transform）
                const currentTransform = comp.getAttribute('transform') || '';
                
                // 如果有现有的 transform，解析并更新
                const translateMatch = currentTransform.match(/translate\s*\(\s*([^,\)]+)\s*,?\s*([^\)]*)\)/);
                let currentX = 0, currentY = 0;
                if (translateMatch) {
                    currentX = parseFloat(translateMatch[1]) || 0;
                    currentY = parseFloat(translateMatch[2]) || 0;
                }
                
                // 应用新的 transform（在原有基础上加上偏移）
                const newTransform = `translate(${currentX + dx}, ${currentY + dy})`;
                comp.setAttribute('transform', newTransform);
                
                // 同时清理任何 CSS 样式中的预览效果
                comp.style.transform = '';
                comp.style.opacity = '1';
                comp.style.filter = '';
            });
            
            // 通知 3D 引擎更新模型坐标
            bus.emit('UPDATE_COMPONENT_POSITION_3D', {
                ref: targetRef,
                dx,
                dy,
                dz,
                isPermanent: true
            });
            
            // 数据层：将 oldPos 更新为 newPos，确保持久化
            detail.oldPos = { ...detail.newPos };
            if (detail.oldZ !== undefined && detail.newZ !== undefined) {
                detail.oldZ = detail.newZ;
            }
            
            console.log(`[IDX] ${targetRef} 物理位置已更新: 偏移 (${dx}, ${dy})`);
        }
        
        // ========== Step 3: IDX 提议状态机更新 ==========
        if (tx) {
            // 更新 detail 状态
            if (detail) {
                detail.status = 'accepted';
            }
            // 检查是否所有 detail 都已 accepted
            if (tx.details) {
                const allAccepted = tx.details.every(d => d.status === 'accepted');
                if (allAccepted) {
                    tx.status = 'accepted';
                }
            }
        }
        
        // ========== Step 4: 级联闭环批注系统 ==========
        // 发射基于 targetRef 的级联闭环事件
        bus.emit('CASCADE_RESOLVE_ANNOTATIONS_BY_REF', targetRef);
        
        // ========== Step 5: IDX 协同面板 UI 收敛 ==========
        // 重新渲染 IDX 面板（状态变化后按钮会自动隐藏）
        if (currentTab === 'collab') {
            const tabContent = document.getElementById('tab-content');
            if (tabContent) {
                // 重置事件绑定标志，允许重新绑定
                tabContent._idxEventsBound = false;
                renderIdxPanel(tabContent);
            }
        }
        
        // 发射数据刷新事件
        bus.emit('ANNOTATIONS_UPDATED');
        bus.emit('IDX_DATA_REFRESH');
        
        // ========== Step 6: 弹出成功提示 ==========
        if (window.showToast) {
            window.showToast(`接收到本地 ECAD 同步指令，${targetRef} 提议已接受，关联讨论已自动闭环。`, 'success');
        }
        
        console.log(`[IDX] ${targetRef} 接受提议闭环处理完成`);
    });

    // === 沙箱控制台事件监听：重置所有测试数据 ===
    bus.on('SANDBOX:RESET_ALL', () => {
        console.log('[IDX] 收到沙箱重置事件');
        
        // 1. 重新加载原始Mock数据
        transactions = JSON.parse(JSON.stringify(idxTransactions));
        
        // 2. 更新全局批注数据
        if (window.currentAnnotations) {
            window.currentAnnotations = JSON.parse(JSON.stringify(presetAnnotations));
        }
        
        // 3. 清理所有预览状态
        cleanupAllPreviews();
        
        // 4. 重新渲染IDX面板
        if (currentTab === 'collab') {
            const tabContent = document.getElementById('tab-content');
            if (tabContent) renderIdxPanel(tabContent);
        }
        
        // 5. 广播全局刷新事件，让其他模块响应
        bus.emit('ANNOTATIONS_UPDATED');
        bus.emit('GLOBAL_DATA_RESET');
        
        // 6. 弹出提示
        if (window.showToast) {
            window.showToast('已重置所有测试数据', 'info');
        }
        
        console.log('[IDX] 重置处理完成');
    });

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
                                            
                                // === 核心修复 3：读取实时的全局批注池，确保探讨数量动态更新 ===
                                const allAnnots = window.currentAnnotations || presetAnnotations;
                                // === Bug 修复：使用 detail.id 作为关联键，而不是 tx.id 或 ref ===
                                // detail.id 是每条建议的唯一标识符（如 'IDX-U3-001'），这样可以精确匹配到特定的那条建议
                                const detailId = detail.id || `${tx.id}-${ref}`; // 兼容没有 id 的 detail
                                                                
                                // === 核心升级：双向或集匹配（显式 linkedIdxId OR 隐式 targetRef） ===
                                const linkedAnnotations = allAnnots.filter(a => {
                                    if (a.status !== 'open') return false;
                                    // 【核心变更】：显式 ID 匹配 OR 隐式 targetRef 匹配
                                    const isExplicitlyLinked = a.linkedIdxId === detailId;
                                    const isImplicitlyLinked = a.targetRef && a.targetRef === ref;
                                    return isExplicitlyLinked || isImplicitlyLinked;
                                });
                                const openLinkedCount = linkedAnnotations.length;
                    
                                return `
                                <div class="detail-item bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200" data-ref="${ref}" data-txid="${tx.id}" data-idx="${idx}">
                                    <!-- Layer 1: 基础信息区 -->
                                    <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                        <div class="flex items-center space-x-2">
                                            <span class="text-sm font-bold text-gray-800">${ref}</span>
                                        </div>
                                        <span class="text-xs px-2 py-1 rounded-full ${detail.status === 'accepted' ? 'bg-green-100 text-green-700' : (tx.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')} font-medium">
                                            ${detail.status === 'accepted' ? '已接受' : (tx.status === 'pending' ? '待处理' : '已固化')}
                                        </span>
                                    </div>
                                    <!-- Layer 2: 变更详情区 -->
                                    <div class="px-4 py-3">
                                        <p class="text-sm text-gray-600 mb-3">${tx.desc || detail.desc || '未提供变更原因'}</p>
                                        ${detail.oldPos ? `
                                            <div class="bg-gray-50 rounded p-2 font-mono text-xs border border-gray-200">
                                                <div>X: ${detail.oldPos.x} → ${detail.newPos.x}</div>
                                                <div>Y: ${detail.oldPos.y} → ${detail.newPos.y}</div>
                                            </div>
                                        ` : `
                                            <div class="text-xs text-gray-400 italic">变更详情见 3D 视图</div>
                                        `}
                                    </div>
                                                
                                    <!-- Layer 3: 探讨状态区 -->
                                    <div class="px-4 pb-3">
                                        <div class="text-xs flex items-center ${linkedAnnotations.length > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}">
                                            <i class="fas fa-comment-dots mr-1"></i>
                                            ${linkedAnnotations.length > 0 ? 
                                                `${openLinkedCount} 条待解决探讨` : 
                                                `暂无待解决探讨`}
                                        </div>
                                    </div>
                                    
                                    <!-- Layer 4: 卡片操作底栏 (Action Bar) -->
                                    <!-- 修复：基于 detail.status 而非 tx.status 决定是否显示按钮 -->
                                    ${(detail.status !== 'accepted' && tx.status === 'pending') ? `
                                        <div class="px-4 py-3 border-t border-gray-200 bg-gray-50/50">
                                            <div class="flex justify-end space-x-2">
                                                <button class="btn-load-preview px-3 py-1.5 text-xs bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all shadow-sm font-medium" title="加载此提议的预览效果" data-txid="${tx.id}" data-ref="${ref}">
                                                    加载预览
                                                </button>
                                                <button class="btn-add-annotation px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm font-medium flex items-center" title="针对此提议添加评审意见" data-txid="${tx.id}" data-ref="${ref}" data-detail-id="${detail.id || `${tx.id}-${ref}`}">
                                                    添加批注
                                                </button>
                                            </div>
                                        </div>
                                    ` : `
                                        <!-- 已接受的提议：显示只读提示 -->
                                        <div class="px-4 py-3 border-t border-gray-200 bg-green-50/50">
                                            <div class="text-xs text-green-600 flex items-center justify-center">
                                                <i class="fas fa-check-circle mr-1"></i>
                                                ${linkedAnnotations.length > 0 ? `${linkedAnnotations.length} 条探讨已关闭` : '提议已接受'}
                                            </div>
                                        </div>
                                    `}
                                    
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';

    // === 修复：基于 detail.status 细粒度判断是否存在待处理项 ===
    // 遍历所有 transactions 及其 details，只有存在至少一个 status !== 'accepted' 的 detail 时才显示底栏
    let hasPendingDetail = false;
    transactions.forEach(tx => {
        if (tx.details) {
            tx.details.forEach(detail => {
                if (detail.status !== 'accepted') {
                    hasPendingDetail = true;
                }
            });
        }
    });
    
    if (hasPendingDetail) {
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

    console.log('[DEBUG] Panel rendered, binding events...');
    console.log('[DEBUG] Container:', container);
    console.log('[DEBUG] Buttons found:', container.querySelectorAll('.btn-load-preview').length);
    
    // 绑定事件
    bindIdxEvents(container);
}

let previewStates = {}; // 记录器件的预览状态

// === 预览状态生命周期清理函数（安全兜底） ===
// 核心原则：只清除临时附加的视觉属性，绝不破坏已固化的物理位置
function cleanupAllPreviews() {
    // 遍历所有活动中的预览状态
    Object.keys(previewStates).forEach(ref => {
        if (previewStates[ref]) {
            // 1. 清理 2D CSS 变换（临时视觉层）
            // 注意：这里只清除 CSS style 属性，不会影响 SVG 的 transform 属性（物理位置）
            // 对于已固化的器件，其物理位置已通过 SVG transform 属性持久化，不会被此操作影响
            document.querySelectorAll(`.eda-component[data-ref="${ref}"]`).forEach(comp => {
                comp.style.transform = '';
                comp.style.opacity = '1';
                comp.style.filter = '';
            });
            
            // 2. 向 3D 引擎发送关闭预览信号（Ghost 模式）
            bus.emit('TOGGLE_IDX_PREVIEW_3D', { ref, dx: 0, dy: 0, isPreviewing: false });
            
            // 3. 重置预览状态字典
            previewStates[ref] = false;
            
            // 4. 清理侧边栏 UI 状态
            document.querySelectorAll(`.detail-item[data-ref="${ref}"]`).forEach(item => {
                item.classList.remove('bg-blue-100', 'border-blue-300');
                item.classList.add('bg-gray-50');
            });
            
            // 5. 重置单个预览按钮状态
            document.querySelectorAll(`.btn-load-preview[data-ref="${ref}"]`).forEach(btn => {
                btn.innerHTML = '加载预览';
                btn.classList.replace('bg-amber-50', 'bg-white');
                btn.classList.replace('text-amber-700', 'text-gray-700');
                btn.classList.replace('border-amber-300', 'border-gray-300');
            });
        }
    });
    
    // 清空预览状态字典
    previewStates = {};
    
    // 广播全局清理信号
    bus.emit('CLEANUP_ALL_PREVIEWS');
    
    console.log('IDX: 已安全清理所有预览状态（未破坏已固化位置）');
}

function bindIdxEvents(container) {
    // === 核心优化：使用事件委托避免重复绑定 ===
    console.log('[DEBUG] bindIdxEvents called, container._idxEventsBound:', container._idxEventsBound);
    
    // === 核心修复：防止事件监听器重复绑定 ===
    if (container._idxEventsBound) {
        console.log('[IDX] Events already bound, skipping re-binding');
        return;
    }
    container._idxEventsBound = true;

    // === 辅助函数：应用预览残影效果 ===
    const applyPreviewEffect = (ref, dx, dy, dz = 0) => {
        document.querySelectorAll('.eda-component[data-ref="' + ref + '"]').forEach(comp => {
            comp.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
            comp.style.opacity = '0.5';
            comp.style.filter = 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.8))';
        });
        bus.emit('TOGGLE_IDX_PREVIEW_3D', { ref, dx, dy, dz, isPreviewing: true });
    };

    // === 辅助函数：清理预览残影效果 ===
    const clearPreviewEffect = (ref) => {
        document.querySelectorAll('.eda-component[data-ref="' + ref + '"]').forEach(comp => {
            comp.style.transform = '';
            comp.style.opacity = '1';
            comp.style.filter = '';
        });
        bus.emit('TOGGLE_IDX_PREVIEW_3D', { ref, dx: 0, dy: 0, dz: 0, isPreviewing: false });
    };

    // 1. 详情项悬浮/点击：定位并预览元器件（事件委托）
    container.addEventListener('mouseenter', (e) => {
        const item = e.target.closest('.detail-item');
        if (item) {
            const ref = item.getAttribute('data-ref');
            if (typeof window.highlightComponent === 'function') window.highlightComponent(ref);
        }
    }, true); // 使用捕获阶段

    container.addEventListener('mouseleave', (e) => {
        const item = e.target.closest('.detail-item');
        if (item) {
            if (typeof window.clearHighlight === 'function') window.clearHighlight();
        }
    }, true); // 使用捕获阶段

    container.addEventListener('click', (e) => {
        // === 新增：专门针对【加载预览】按钮的交互逻辑 ===
        const loadPreviewBtn = e.target.closest('.btn-load-preview');
        console.log('[DEBUG] Click event, loadPreviewBtn:', loadPreviewBtn);
        if (loadPreviewBtn) {
            console.log('[DEBUG] Load preview button clicked, txId:', loadPreviewBtn.getAttribute('data-txid'), 'ref:', loadPreviewBtn.getAttribute('data-ref'));
            // 1. 阻止事件冒泡，防止触发卡片外层的其他无关点击
            e.stopPropagation();
            
            const txId = loadPreviewBtn.getAttribute('data-txid');
            const ref = loadPreviewBtn.getAttribute('data-ref');
            
            // 2. 查找对应的事务数据
            const tx = transactions.find(t => t.id === txId);
            if (!tx) return;
            const details = tx.details || [tx];
            const detail = details.find(d => d.targetRef === ref);
            if (!detail) return;

            // 3. 切换预览状态 (Toggle)
            const isPreviewing = !previewStates[ref];
            previewStates[ref] = isPreviewing;

            // 4. UI 状态反馈：动态改变按钮的文字和样式
            if (isPreviewing) {
                loadPreviewBtn.innerHTML = '取消预览';
                loadPreviewBtn.classList.replace('bg-white', 'bg-amber-50');
                loadPreviewBtn.classList.replace('text-gray-700', 'text-amber-700');
                loadPreviewBtn.classList.replace('border-gray-300', 'border-amber-300');
                
                // 计算坐标和属性变更偏差 (兼容平移和高度调整)
                let dx = 0, dy = 0, dz = 0;
                if (detail.oldPos && detail.newPos) {
                    dx = detail.newPos.x - detail.oldPos.x;
                    dy = detail.newPos.y - detail.oldPos.y;
                }
                if (detail.action === 'PROP_CHANGE' && detail.oldVal && detail.newVal) {
                    if (detail.newVal.z !== undefined && detail.oldVal.z !== undefined) {
                        dz = detail.newVal.z - detail.oldVal.z;
                    }
                }
                
                // === 核心修复：立即应用残影效果，让用户立刻看到反馈 ===
                applyPreviewEffect(ref, dx, dy, dz);
                
                // === 镜头自动追踪定位 (Auto-Focus) - 异步执行，不阻塞残影显示 ===
                if (detail.oldPos) {
                    const canvasTransform = document.getElementById('canvas-transform');
                    if (canvasTransform) {
                        const targetScale = 1.8;
                        const targetTranslateX = (500 - detail.oldPos.x) * targetScale;
                        const targetTranslateY = (400 - detail.oldPos.y) * targetScale;

                        canvasTransform.style.transition = 'transform 0.4s ease-out';
                        updateCanvasState({
                            scale: targetScale,
                            translateX: targetTranslateX,
                            translateY: targetTranslateY
                        });
                        bus.emit('CANVAS_STATE_CHANGED');
                        
                        // === 新增：同步聚焦 3D 视图 ===
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
                }
            } else {
                loadPreviewBtn.innerHTML = '加载预览';
                loadPreviewBtn.classList.replace('bg-amber-50', 'bg-white');
                loadPreviewBtn.classList.replace('text-amber-700', 'text-gray-700');
                loadPreviewBtn.classList.replace('border-amber-300', 'border-gray-300');
                
                // === 取消预览时，清理残影效果（内部会发送3D关闭信号） ===
                clearPreviewEffect(ref);
            }

            return;
        }

        // 2. 处理添加批注按钮点击 (Layer 4 Action Bar)
        const addAnnotationBtn = e.target.closest('.btn-add-annotation');
        if (addAnnotationBtn) {
            console.log('[DEBUG] Add annotation button clicked:', { 
                txId: addAnnotationBtn.getAttribute('data-txid'),
                targetRef: addAnnotationBtn.getAttribute('data-ref'),
                detailId: addAnnotationBtn.getAttribute('data-detail-id')
            });
            e.stopPropagation(); // 阻止事件冒泡，避免触发卡片主体点击
            const txId = addAnnotationBtn.getAttribute('data-txid');
            const targetRef = addAnnotationBtn.getAttribute('data-ref');
            const detailId = addAnnotationBtn.getAttribute('data-detail-id');
            
            // 查找器件坐标
            let x = 0, y = 0;
            transactions.forEach(tx => {
                const items = tx.details ? tx.details : [tx];
                const detail = items.find(d => d.targetRef === targetRef);
                if (detail && detail.oldPos) { 
                    x = detail.oldPos.x; 
                    y = detail.oldPos.y; 
                    console.log('[DEBUG] Found coordinates:', { x, y });
                }
            });

            // 发射添加批注事件
            console.log('[DEBUG] Emitting AUTO_ADD_IDX_ANNOTATION event');
            bus.emit('AUTO_ADD_IDX_ANNOTATION', { targetRef, txId, detailId, x, y });
            return;
        }


        const clearBtn = e.target.closest('#btn-clear-all-idx');
        if (clearBtn) {
            cleanupAllPreviews();
            return;
        }

        const previewBtn = e.target.closest('#btn-preview-all-idx');
        if (previewBtn) {
            // === 修复：严格过滤，只对 pending 状态的 detail 应用残影 ===
            transactions.forEach(tx => {
                if (tx.details) {
                    tx.details.forEach(detail => {
                        const ref = detail.targetRef;
                        
                        // === 核心过滤：跳过已固化的 detail ===
                        if (detail.status === 'accepted') {
                            console.log(`[IDX] 预览所有：跳过已固化的器件 ${ref}`);
                            return;
                        }
                        
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

                        // 计算位移偏差（只有存在位置信息时才计算）
                        if (detail.oldPos && detail.newPos) {
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
                        }
                        
                        // 4. 更新按钮状态
                        const btn = container.querySelector(`.btn-load-preview[data-ref="${ref}"]`);
                        if (btn) {
                            btn.innerHTML = '取消预览';
                            btn.classList.replace('bg-white', 'bg-amber-50');
                            btn.classList.replace('text-gray-700', 'text-amber-700');
                            btn.classList.replace('border-gray-300', 'border-amber-300');
                        }
                    });
                }
            });
        }
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
