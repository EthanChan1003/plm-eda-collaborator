// ============ V4.7 Sidebar 渲染模块 - 反应式 UI ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { getAnnotations } from '../features/annotation.manager.js';
import { versionedComponentData } from '../data/mock.data.js';

// DOM 引用
let tabContent = null;
let currentDrawingType = AppState.currentDrawingType;
let currentTab = AppState.currentTab;

/**
 * 初始化 Sidebar 模块
 */
export function initSidebar() {
    tabContent = document.getElementById('tab-content');
    
    if (!tabContent) {
        console.warn('Sidebar: tab-content 元素未找到');
        return;
    }
    
    // 监听批注更新事件
    bus.on('ANNOTATIONS_UPDATED', () => {
        if (currentTab === 'notes') {
            renderNotesContent();
        }
    });
    
    // 监听视图切换
    bus.on('VIEW_CHANGED', (viewType) => {
        currentDrawingType = viewType;
        if (currentTab === 'tree') {
            renderTreeContent();
        }
    });
    
    // 监听 Tab 切换
    bus.on('TAB_CHANGED', (tabKey) => {
        currentTab = tabKey;
        const tabContent = document.getElementById('tab-content');
        if (!tabContent) return;

        // 如果是协同记录 (collab) 页签，Sidebar 直接放权，交给 idx.manager 处理
        if (tabKey === 'collab') {
            return;
        }

        // === 核心修复：分离 tree 和 diff 的渲染调用 ===
        if (tabKey === 'tree') {
            renderTreeContent();
        } else if (tabKey === 'diff') {
            renderDiffContent();
        } else if (tabKey === 'notes') {
            renderNotesContent();
        } else {
            tabContent.innerHTML = ''; // 未知页签清空
        }
    });

    // === 核心修复：监听版本切换事件，重新渲染当前 Tab 内容 ===
    bus.on('VERSION_CHANGED', () => {
        if (currentTab === 'tree') {
            renderTreeContent();
        } else if (currentTab === 'diff') {
            renderDiffContent();
        } else if (currentTab === 'notes') {
            renderNotesContent();
        }
    });
    
    // 初始渲染结构树
    renderTreeContent();
    
    console.log('Sidebar 模块初始化完成');
}

/**
 * 渲染结构树内容
 */
export function renderTreeContent() {
    if (!tabContent) return;
    
    const canvasSchematic = document.getElementById('canvas-schematic');
    const canvasPcb = document.getElementById('canvas-pcb');
    
    if (currentDrawingType === 'schematic') {
        if (canvasSchematic) canvasSchematic.classList.remove('hidden');
        if (canvasPcb) canvasPcb.classList.add('hidden');
        
        let treeHTML = '<div class="space-y-3">';
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-bolt mr-2 text-yellow-500"></i>电源管理
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('U2', 'AMS1117-3.3', 'microchip')}
                    ${generateTreeItem('C1', '100nF 去耦', 'bolt')}
                    ${generateTreeItem('C2', '10uF 滤波', 'bolt')}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-microchip mr-2 text-blue-500"></i>核心 MCU
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('U1', 'STM32F103', 'microchip')}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-clock mr-2 text-purple-500"></i>时钟系统
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('Y1', '8MHz 晶振', 'wave-square')}
                    ${generateTreeItem('C3', '22pF 负载', 'bolt')}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-circle-notch mr-2 text-green-500"></i>外围电路
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('R1', '10K 上拉', 'minus')}
                    ${generateTreeItem('R2', '4.7K 限流', 'minus')}
                    ${generateTreeItem('R3', '330R LED限流', 'minus')}
                    ${generateTreeItem('D1', 'LED 指示灯', 'lightbulb')}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-plug mr-2 text-orange-500"></i>接口
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('J1', 'SWD 4P 调试', 'plug')}
                    ${generateTreeItem('C4', '100nF 接口滤波', 'bolt')}
                </div>
            </div>
        `;
        
        treeHTML += '</div>';
        tabContent.innerHTML = treeHTML;
        
    } else {
        if (canvasSchematic) canvasSchematic.classList.add('hidden');
        if (canvasPcb) canvasPcb.classList.remove('hidden');
        
        tabContent.innerHTML = `
            <div class="space-y-3">
                <div>
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-layer-group mr-2 text-gray-400"></i>图层管理
                    </div>
                    <div class="ml-4 space-y-1 mt-1">
                        <label class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="cb-layer-top" checked class="mr-3 w-3 h-3 accent-blue-600">
                            <span class="text-gray-600">Top Layer (顶层信号)</span>
                        </label>
                        <label class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="cb-layer-bottom" checked class="mr-3 w-3 h-3 accent-blue-600">
                            <span class="text-gray-600">Bottom Layer (底层信号)</span>
                        </label>
                        <label class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="cb-layer-silkscreen" checked class="mr-3 w-3 h-3 accent-blue-600">
                            <span class="text-gray-600">Top Silkscreen (丝印)</span>
                        </label>
                    </div>
                </div>
                <div class="mt-4">
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-ruler-combined mr-2 text-gray-400"></i>板框信息
                    </div>
                    <div class="ml-4 mt-2 text-xs text-gray-500">
                        <div>尺寸: 90mm x 70mm</div>
                        <div>层数: 2-Layer</div>
                        <div>板厚: 1.6mm</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // PCB 视图下绑定层复选框事件
    if (currentDrawingType === 'pcb') {
        document.getElementById('cb-layer-top')?.addEventListener('change', (e) => window.togglePcbLayer('top', e.target.checked));
        document.getElementById('cb-layer-bottom')?.addEventListener('change', (e) => window.togglePcbLayer('bottom', e.target.checked));
        document.getElementById('cb-layer-silkscreen')?.addEventListener('change', (e) => window.togglePcbLayer('silkscreen', e.target.checked));
    }
    
    bindSvgEvents();
}

/**
 * 生成树形项目 HTML
 */
function generateTreeItem(ref, label, icon, isPrimary = false) {
    const data = versionedComponentData[AppState.currentVersion]?.[ref];
    if (!data) return '';
    const primaryClass = isPrimary ? 'text-blue-600 bg-blue-50/30' : 'text-gray-600';
    const iconClass = isPrimary ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500';
    const partNumber = data.PartNumber?.split('-')[0] || 'N/A';
    return `
        <div class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer ${primaryClass} group"
             onmouseover="highlightComponent('${ref}')"
             onmouseout="clearHighlight()"
             onclick="selectComponent('${ref}')">
            <i class="fas fa-${icon} w-5 ${iconClass}"></i>
            <span>${ref} (${partNumber})</span>
        </div>
    `;
}

/**
 * 渲染版本差异列表
 */
export function renderDiffContent() {
    if (!tabContent || currentTab !== 'diff') return;

    // 获取差异数据
    const mockDiffData = window.mockDiffData || {};

    // === 体验优化：当数据为空时，渲染专业级的空状态提示 ===
    if (Object.keys(mockDiffData).length === 0) {
        tabContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <i class="fas fa-code-compare text-3xl mb-2"></i>
                <span class="text-xs font-bold text-gray-500">暂无差异项</span>
                <span class="text-[10px] mt-1 text-center px-4">当前为最早期版本，无历史可对比；<br>或与所选历史版本之间无变更。</span>
            </div>
        `;
        return;
    }
    // ====================================================

    const typeLabels = {
        'added': { text: '新增', color: 'bg-green-500', textColor: 'text-green-700' },
        'modified': { text: '修改', color: 'bg-yellow-500', textColor: 'text-yellow-700' },
        'deleted': { text: '删除', color: 'bg-red-500', textColor: 'text-red-700' },
        'moved': { text: '位移', color: 'bg-yellow-500', textColor: 'text-yellow-700' }
    };

    let diffHTML = '<div class="space-y-2 p-2">';
    
    Object.keys(mockDiffData).forEach(ref => {
        const diff = mockDiffData[ref];
        const label = typeLabels[diff.type];
        
        diffHTML += `
            <div class="diff-item flex items-start p-3 rounded-lg cursor-pointer border border-gray-100" 
                 onclick="selectComponent('${ref}')">
                <div class="flex-shrink-0 mt-0.5">
                    <div class="w-3 h-3 rounded-full ${label.color}"></div>
                </div>
                <div class="ml-3 flex-1">
                    <div class="flex items-center space-x-2">
                        <span class="font-bold text-gray-800 text-sm">${ref}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded ${label.textColor} bg-opacity-10 ${label.color.replace('bg-', 'bg-')}/10 font-medium">
                            ${label.text}
                        </span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">${diff.desc}</div>
                    ${(diff.type === 'modified' || diff.type === 'moved') ? `
                        <div class="mt-2 text-xs flex items-center space-x-2">
                            <span class="text-gray-400 line-through">${diff.oldVal}</span>
                            <i class="fas fa-arrow-right text-gray-300 text-[10px]"></i>
                            <span class="text-yellow-600 font-bold">${diff.newVal}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    diffHTML += '</div>';
    tabContent.innerHTML = diffHTML;
}

/**
 * 渲染批注列表内容
 */
export function renderNotesContent() {
    if (!tabContent || currentTab !== 'notes') return;
    
    const isLatest = AppState.currentVersion === AppState.latestVersion;
    const versionAnnotations = getAnnotations(AppState.currentVersion);
    
    if (versionAnnotations.length === 0) {
        tabContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <i class="fas fa-comment-slash text-3xl mb-2"></i>
                <span class="text-xs">暂无批注</span>
                ${isLatest ? '<span class="text-[10px] mt-1">点击工具栏矩形框按钮添加批注</span>' : '<span class="text-[10px] mt-1">历史版本不可新增批注</span>'}
            </div>
        `;
        return;
    }
    
    let notesHTML = '<div class="space-y-2 p-2">';
    
    versionAnnotations.slice().reverse().forEach(note => {
        const viewLabel = note.viewType === 'schematic' ? '原理图' : 'PCB';
        const isResolved = note.status === 'resolved';
        const statusIcon = isResolved ? 'fa-check-circle text-green-500' : 'fa-circle text-blue-500';
        const cardBgClass = isResolved ? 'bg-gray-50' : 'bg-white';
        const textClass = isResolved ? 'line-through text-gray-400' : 'text-gray-600';
        const deleteBtn = isLatest ?
            `<i class="fas fa-trash text-xs cursor-pointer text-gray-400 hover:text-red-500 delete-btn" onclick="event.stopPropagation(); deleteAnnotation(${note.id}, '${note.version}')" title="删除批注"></i>` : '';
        const shortTime = note.time || '';
        const safeAuthor = note.author || '系统';
        
        // 【新增】：计算回复数和关联器件徽标
        const replyCount = note.replies ? note.replies.length : 0;
        const replyIndicator = replyCount > 0 ? `<span class="ml-2 text-[10px] text-blue-500 font-medium"><i class="fas fa-comment-dots"></i> ${replyCount} 回复</span>` : '';
        const refBadge = note.targetRef ? `<span class="ml-1 text-[9px] px-1 bg-blue-50 text-blue-600 border border-blue-100 rounded">${note.targetRef}</span>` : '';
        const viewBadge = `<span class="ml-1 text-[9px] px-1 bg-gray-100 text-gray-500 border border-gray-200 rounded">${viewLabel}</span>`;

        notesHTML += `
            <div class="note-item p-3 rounded-lg cursor-pointer border border-gray-100 ${cardBgClass} hover:border-blue-300 transition-colors" data-note-id="${note.id}" data-note-version="${note.version}">
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center min-w-0">
                        <span class="flex-shrink-0 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold mr-1.5">${note.id}</span>
                        <span class="font-bold text-gray-800 text-xs truncate max-w-[60px]" title="${safeAuthor}">${safeAuthor}</span>
                        ${refBadge}
                        ${viewBadge}
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0 ml-1">
                        <span class="text-[9px] text-gray-400">${shortTime}</span>
                        <i class="fas ${statusIcon} text-xs cursor-pointer hover:scale-110 transition-transform" onclick="event.stopPropagation(); toggleAnnotationStatus(${note.id}, '${note.version}')" title="${isResolved ? '已解决，点击恢复' : '待处理，点击解决'}"></i>
                        ${deleteBtn}
                    </div>
                </div>
                <div class="text-xs ${textClass} leading-relaxed line-clamp-2">${note.text}</div>
                ${replyIndicator ? `<div class="mt-1.5 flex justify-end">${replyIndicator}</div>` : ''}
            </div>
        `;
    });
    
    notesHTML += '</div>';
    tabContent.innerHTML = notesHTML;
    
    // 绑定点击事件
    document.querySelectorAll('.note-item').forEach(item => {
        item.addEventListener('click', () => {
            const noteId = parseInt(item.getAttribute('data-note-id'));
            const noteVersion = item.getAttribute('data-note-version');
            window.locateAnnotation(noteId, noteVersion);
        });
    });
}

/**
 * 绑定 SVG 事件
 */
function bindSvgEvents() {
    const components = document.querySelectorAll('.eda-component');
    components.forEach(comp => {
        comp.addEventListener('click', (e) => {
            e.stopPropagation();
            const ref = comp.getAttribute('data-ref');
            if (window.selectComponent) {
                window.selectComponent(ref);
            }
        });
    });
}
