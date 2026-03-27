// ============ V4.0 搜索管理器 - 全局搜索联想功能 ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { getAnnotations } from './annotation.manager.js';

// 局部状态
let currentTab = 'tree';
let mockComponentData = {};
let mockDiffData = {};

export function initSearchManager() {
    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-dropdown');

    // 初始化数据
    mockComponentData = window.mockComponentData || {};
    mockDiffData = window.mockDiffData || {};

    // ============ 场景化搜索联想功能 ============
    function renderSearchDropdown(query) {
        const upperQuery = query.toUpperCase();
        let matches = [];
        let html = '';

        if (currentTab === 'tree') {
            // 结构树模式：搜索位号
            matches = Object.keys(mockComponentData).filter(key =>
                key.toUpperCase().includes(upperQuery)
            );
            if (matches.length === 0 || query === '') {
                searchDropdown.classList.add('hidden');
                return;
            }
            html = matches.map(ref => {
                const data = mockComponentData[ref];
                return `
                    <li class="search-item px-3 py-2 text-sm text-gray-700 cursor-pointer flex items-center justify-between" data-type="component" data-ref="${ref}">
                        <span class="font-medium">${ref}</span>
                        <span class="text-xs text-gray-400">${data.PartNumber}</span>
                    </li>
                `;
            }).join('');
        } else if (currentTab === 'diff') {
            // 版本差异模式：搜索位号或差异描述
            matches = Object.keys(mockDiffData).filter(key => {
                const diff = mockDiffData[key];
                return key.toUpperCase().includes(upperQuery) ||
                       diff.desc.toUpperCase().includes(upperQuery);
            });
            if (matches.length === 0 || query === '') {
                searchDropdown.classList.add('hidden');
                return;
            }
            html = matches.map(ref => {
                const diff = mockDiffData[ref];
                const typeLabels = {
                    'added': '新增',
                    'modified': '修改',
                    'deleted': '删除',
                    'moved': '位移'
                };
                return `
                    <li class="search-item px-3 py-2 text-sm text-gray-700 cursor-pointer flex items-center justify-between" data-type="diff" data-ref="${ref}">
                        <div class="flex items-center space-x-2">
                            <span class="font-medium">${ref}</span>
                            <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">${typeLabels[diff.type]}</span>
                        </div>
                        <span class="text-xs text-gray-400 truncate max-w-[120px]">${diff.desc}</span>
                    </li>
                `;
            }).join('');
        } else if (currentTab === 'notes') {
            // 批注列表模式：搜索批注内容
            matches = getAnnotations().filter(note =>
                note.text.toUpperCase().includes(upperQuery)
            );
            if (matches.length === 0 || query === '') {
                searchDropdown.classList.add('hidden');
                return;
            }
            html = matches.map(note => {
                const viewLabel = note.viewType === 'schematic' ? '原理图' : 'PCB';
                return `
                    <li class="search-item px-3 py-2 text-sm text-gray-700 cursor-pointer flex items-center justify-between" data-type="annotation" data-id="${note.id}">
                        <div class="flex items-center space-x-2">
                            <span class="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold">${note.id}</span>
                            <span class="text-xs text-gray-500">${viewLabel}</span>
                        </div>
                        <span class="text-xs text-gray-600 truncate max-w-[150px]">${note.text}</span>
                    </li>
                `;
            }).join('');
        } else {
            searchDropdown.classList.add('hidden');
            return;
        }

        searchDropdown.innerHTML = html;

        searchDropdown.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = li.getAttribute('data-type');
                if (type === 'component') {
                    const ref = li.getAttribute('data-ref');
                    searchInput.value = ref;
                    searchDropdown.classList.add('hidden');
                    // 调用全局选择函数
                    if (typeof window.selectComponent === 'function') {
                        window.selectComponent(ref);
                    }
                } else if (type === 'diff') {
                    const ref = li.getAttribute('data-ref');
                    searchInput.value = ref;
                    searchDropdown.classList.add('hidden');
                    if (typeof window.selectComponent === 'function') {
                        window.selectComponent(ref);
                    }
                } else if (type === 'annotation') {
                    const id = parseInt(li.getAttribute('data-id'));
                    searchInput.value = '';
                    searchDropdown.classList.add('hidden');
                    // 调用全局定位函数
                    if (typeof window.locateAnnotation === 'function') {
                        window.locateAnnotation(id);
                    }
                }
            });
        });

        searchDropdown.classList.remove('hidden');
    }

    // 搜索输入事件
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (value === '') {
                searchDropdown.classList.add('hidden');
            } else {
                renderSearchDropdown(value);
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const value = e.target.value.trim();
                if (currentTab === 'tree' || currentTab === 'diff') {
                    const upperValue = value.toUpperCase();
                    if (mockComponentData[upperValue]) {
                        if (typeof window.selectComponent === 'function') {
                            window.selectComponent(upperValue);
                        }
                        searchDropdown.classList.add('hidden');
                        searchInput.blur();
                    }
                } else if (currentTab === 'notes') {
                    const match = getAnnotations().find(note =>
                        note.text.toUpperCase().includes(value.toUpperCase())
                    );
                    if (match) {
                        if (typeof window.locateAnnotation === 'function') {
                            window.locateAnnotation(match.id);
                        }
                        searchDropdown.classList.add('hidden');
                        searchInput.blur();
                    }
                }
            }
        });
    }

    // 点击外部关闭下拉框
    document.addEventListener('click', (e) => {
        if (searchInput && searchDropdown &&
            !searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.classList.add('hidden');
        }
    });

    // ============ EventBus 监听 ============
    bus.on('TAB_CHANGED', (tabKey) => {
        currentTab = tabKey;

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
    });

    // 数据更新监听
    bus.on('DATA_UPDATED', () => {
        mockComponentData = window.mockComponentData || {};
        mockDiffData = window.mockDiffData || {};
    });

    console.log('搜索管理器初始化完成');
}
