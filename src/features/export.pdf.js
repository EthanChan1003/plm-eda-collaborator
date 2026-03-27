import { AppState } from '../core/state.js';
import { bus } from '../core/event.bus.js';

export function initPdfExporter(annotations) {
    const btnExportPdf = document.getElementById('btn-export-pdf');
    if (btnExportPdf) {
        btnExportPdf.addEventListener('click', () => generatePDFReport(annotations));
    }
}

async function generatePDFReport(annotations) {
    // 修复：annotations 可能是函数，需要调用获取最新数据
    const currentAnnotations = typeof annotations === 'function' ? annotations() : annotations;

    const btnExportPdf = document.getElementById('btn-export-pdf');
    const originalBtnText = btnExportPdf.innerHTML;
    btnExportPdf.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>正在生成...';
    btnExportPdf.disabled = true;

    try {
        const canvasWrapper = document.getElementById('canvas-wrapper');
        const snapshotImg = document.getElementById('report-snapshot-img');
        const viewTypeSpan = document.getElementById('report-view-type');

        const currentDrawingType = AppState.currentDrawingType;
        viewTypeSpan.textContent = currentDrawingType === 'schematic' ? '原理图' : 'PCB';

        const canvas = await html2canvas(canvasWrapper, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#f8f9fa'
        });

        const imageData = canvas.toDataURL('image/jpeg', 0.95);
        snapshotImg.src = imageData;

        const versionAnnotations = currentAnnotations.filter(a => a.version === AppState.currentVersion);
        const totalCount = versionAnnotations.length;
        const openCount = versionAnnotations.filter(a => a.status === 'open').length;
        const resolvedCount = versionAnnotations.filter(a => a.status === 'resolved').length;

        document.getElementById('report-version').textContent = AppState.currentVersion;
        document.getElementById('report-date').textContent = new Date().toLocaleDateString('zh-CN');
        document.getElementById('report-total').textContent = totalCount;
        document.getElementById('report-open').textContent = openCount;
        document.getElementById('report-resolved').textContent = resolvedCount;

        const tableBody = document.getElementById('report-table-body');
        tableBody.innerHTML = '';

        if (versionAnnotations.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-4 text-center text-gray-500">当前版本暂无批注</td>
                </tr>
            `;
        } else {
            versionAnnotations.forEach(note => {
                const viewLabel = note.viewType === 'schematic' ? '原理图' : 'PCB';
                const statusClass = note.status === 'open' ? 'text-red-600' : 'text-green-600';
                const statusText = note.status === 'open' ? '待解决' : '已解决';

                const row = document.createElement('tr');
                row.className = 'border-b border-gray-200 hover:bg-gray-50';
                row.innerHTML = `
                    <td class="p-2 font-medium">#${note.id}</td>
                    <td class="p-2">${viewLabel}</td>
                    <td class="p-2 font-mono text-xs">${note.targetRef || '-'}</td>
                    <td class="p-2">${note.text}</td>
                    <td class="p-2 ${statusClass} font-medium">${statusText}</td>
                `;
                tableBody.appendChild(row);
            });
        }

        setTimeout(() => {
            const originalElement = document.getElementById('pdf-report-template');
            const clonedElement = originalElement.cloneNode(true);
            clonedElement.id = 'pdf-report-clone';
            clonedElement.classList.remove('hidden', 'absolute', 'z-[-10]', 'top-0', 'left-0');

            const offScreenContainer = document.createElement('div');
            offScreenContainer.style.position = 'absolute';
            offScreenContainer.style.left = '-9999px';
            offScreenContainer.style.top = '0';
            offScreenContainer.appendChild(clonedElement);
            document.body.appendChild(offScreenContainer);

            const opt = {
                margin: 0,
                filename: `硬件评审报告_${AppState.currentVersion}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    html2canvas: window.html2canvas
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            bus.emit('SHOW_TOAST', { message: '⏳ 正在生成 PDF 评审报告，请稍候...', type: 'info' });

            html2pdf().set(opt).from(clonedElement).save().then(() => {
                document.body.removeChild(offScreenContainer);
                btnExportPdf.innerHTML = originalBtnText;
                btnExportPdf.disabled = false;
                bus.emit('SHOW_TOAST', { message: '✔ PDF 评审报告下载成功', type: 'success' });
            }).catch(err => {
                console.error('PDF 导出失败:', err);
                if (document.body.contains(offScreenContainer)) {
                    document.body.removeChild(offScreenContainer);
                }
                btnExportPdf.innerHTML = originalBtnText;
                btnExportPdf.disabled = false;
                bus.emit('SHOW_TOAST', { message: '❌ PDF 导出失败，请检查控制台', type: 'error' });
            });
        }, 100);

    } catch (err) {
        console.error('PDF 生成失败:', err);
        btnExportPdf.innerHTML = originalBtnText;
        btnExportPdf.disabled = false;
        alert('PDF 生成失败，请重试');
    }
}
