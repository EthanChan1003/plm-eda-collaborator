// 全局状态池
const AppState = {
    currentVersion: 'V2.1',
    latestVersion: 'V2.1'
};

// 全量版本器件库
const versionedComponentData = {
    'V1.0': {
        'U1': { RefDes: 'U1', PartNumber: 'STM32F103RBT6', Footprint: 'LQFP-64', ItemNumber: 'IC-MCU-ARM-100293', Description: 'ARM Cortex-M3 MCU, 128KB Flash, 72MHz, LQFP-64', Status: '归档' },
        'R1': { RefDes: 'R1', PartNumber: 'RC0603FR-0710KL', Footprint: '0603', ItemNumber: 'RES-STD-10K-201938', Description: 'Thick Film Resistor 10KΩ 1% 1/10W 0603 SMD', Status: '归档' },
        'R2': { RefDes: 'R2', PartNumber: 'RC0603FR-074K7L', Footprint: '0603', ItemNumber: 'RES-STD-4K7-201945', Description: 'Thick Film Resistor 4.7KΩ 1% 1/10W 0603 SMD', Status: '提交' },
        'R3': { RefDes: 'R3', PartNumber: 'RC0603FR-07330RL', Footprint: '0603', ItemNumber: 'RES-STD-330R-201952', Description: 'Thick Film Resistor 330Ω 1% 1/10W 0603 SMD, LED限流', Status: '归档' },
        'C1': { RefDes: 'C1', PartNumber: 'CC0603KRX7R9BB104', Footprint: '0603', ItemNumber: 'CAP-MLCC-100N-302156', Description: 'Ceramic Capacitor 100nF 50V X7R 0603 SMD, 去耦电容', Status: '归档' },
        'C2': { RefDes: 'C2', PartNumber: 'CC0805KKX5R8BB106', Footprint: '0805', ItemNumber: 'CAP-MLCC-10U-302178', Description: 'Ceramic Capacitor 10uF 25V X5R 0805 SMD, 滤波电容', Status: '归档' },
        'C3': { RefDes: 'C3', PartNumber: 'CC0402JRNPO9BN220', Footprint: '0402', ItemNumber: 'CAP-MLCC-22P-302189', Description: 'Ceramic Capacitor 22pF 50V NP0 0402 SMD, 晶振负载', Status: '归档' },
        'Y1': { RefDes: 'Y1', PartNumber: 'X49SM8MSD2SC', Footprint: 'HC-49S', ItemNumber: 'XTAL-8M-HC49-401223', Description: 'Crystal Oscillator 8MHz 20pF HC-49S SMD, 系统主时钟', Status: '提交' },
        'D1': { RefDes: 'D1', PartNumber: 'KT-0603R', Footprint: '0603', ItemNumber: 'LED-RED-0603-501334', Description: 'Red LED 0603 SMD, 20mA, 波长 620-625nm, 电源指示灯', Status: '归档' },
        'J1': { RefDes: 'J1', PartNumber: 'B4B-PH-K-S', Footprint: 'PH-4P', ItemNumber: 'CONN-PH-4P-601445', Description: 'JST PH Series 4-Pin Connector 2.0mm Pitch, SWD调试接口', Status: '提交' }
    },
    'V2.0': {
        'U1': { RefDes: 'U1', PartNumber: 'STM32F103RBT6', Footprint: 'LQFP-64', ItemNumber: 'IC-MCU-ARM-100293', Description: 'ARM Cortex-M3 MCU, 128KB Flash, 72MHz, LQFP-64', Status: '归档' },
        'U2': { RefDes: 'U2', PartNumber: 'AMS1117-3.3', Footprint: 'SOT-223', ItemNumber: 'IC-REG-LDO-100456', Description: '1A Low Dropout Voltage Regulator, 3.3V Fixed Output', Status: '归档' },
        'R1': { RefDes: 'R1', PartNumber: 'RC0603FR-0720KL', Footprint: '0603', ItemNumber: 'RES-STD-20K-201939', Description: 'Thick Film Resistor 20KΩ 1% 1/10W 0603 SMD', Status: '归档' },
        'R2': { RefDes: 'R2', PartNumber: 'RC0603FR-074K7L', Footprint: '0603', ItemNumber: 'RES-STD-4K7-201945', Description: 'Thick Film Resistor 4.7KΩ 1% 1/10W 0603 SMD', Status: '提交' },
        'R3': { RefDes: 'R3', PartNumber: 'RC0603FR-07330RL', Footprint: '0603', ItemNumber: 'RES-STD-330R-201952', Description: 'Thick Film Resistor 330Ω 1% 1/10W 0603 SMD, LED限流', Status: '归档' },
        'C1': { RefDes: 'C1', PartNumber: 'CC0603KRX7R9BB104', Footprint: '0603', ItemNumber: 'CAP-MLCC-100N-302156', Description: 'Ceramic Capacitor 100nF 50V X7R 0603 SMD, 去耦电容', Status: '归档' },
        'C2': { RefDes: 'C2', PartNumber: 'CC0805KKX5R8BB106', Footprint: '0805', ItemNumber: 'CAP-MLCC-10U-302178', Description: 'Ceramic Capacitor 10uF 25V X5R 0805 SMD, 滤波电容', Status: '归档' },
        'Y1': { RefDes: 'Y1', PartNumber: 'X49SM8MSD2SC', Footprint: 'HC-49S', ItemNumber: 'XTAL-8M-HC49-401223', Description: 'Crystal Oscillator 8MHz 20pF HC-49S SMD, 系统主时钟', Status: '提交' },
        'D1': { RefDes: 'D1', PartNumber: 'KT-0603R', Footprint: '0603', ItemNumber: 'LED-RED-0603-501334', Description: 'Red LED 0603 SMD, 20mA, 波长 620-625nm, 电源指示灯', Status: '归档' },
        'J1': { RefDes: 'J1', PartNumber: 'B4B-PH-K-S', Footprint: 'PH-4P', ItemNumber: 'CONN-PH-4P-601445', Description: 'JST PH Series 4-Pin Connector 2.0mm Pitch, SWD调试接口', Status: '提交' }
    },
    'V2.1': {
        'U1': { RefDes: 'U1', PartNumber: 'STM32F103RBT6', Footprint: 'LQFP-64', ItemNumber: 'IC-MCU-ARM-100293', Description: 'ARM Cortex-M3 MCU, 128KB Flash, 72MHz, LQFP-64', Status: '归档' },
        'U2': { RefDes: 'U2', PartNumber: 'AMS1117-3.3', Footprint: 'SOT-223', ItemNumber: 'IC-REG-LDO-100456', Description: '1A Low Dropout Voltage Regulator, 3.3V Fixed Output', Status: '归档' },
        'R1': { RefDes: 'R1', PartNumber: 'RC0603FR-0720KL', Footprint: '0603', ItemNumber: 'RES-STD-20K-201939', Description: 'Thick Film Resistor 20KΩ 1% 1/10W 0603 SMD', Status: '归档' },
        'R2': { RefDes: 'R2', PartNumber: 'RC0603FR-0710KL', Footprint: '0603', ItemNumber: 'RES-STD-10K-201938', Description: 'Thick Film Resistor 10KΩ 1% 1/10W 0603 SMD', Status: '提交' },
        'R3': { RefDes: 'R3', PartNumber: 'RC0603FR-07330RL', Footprint: '0603', ItemNumber: 'RES-STD-330R-201952', Description: 'Thick Film Resistor 330Ω 1% 1/10W 0603 SMD, LED限流', Status: '归档' },
        'C1': { RefDes: 'C1', PartNumber: 'CC0603KRX7R9BB104', Footprint: '0603', ItemNumber: 'CAP-MLCC-100N-302156', Description: 'Ceramic Capacitor 100nF 50V X7R 0603 SMD, 去耦电容', Status: '归档' },
        'C2': { RefDes: 'C2', PartNumber: 'CC0805KKX5R8BB106', Footprint: '0805', ItemNumber: 'CAP-MLCC-10U-302178', Description: 'Ceramic Capacitor 10uF 25V X5R 0805 SMD, 滤波电容', Status: '归档' },
        'Y1': { RefDes: 'Y1', PartNumber: 'X49SM8MSD2SC', Footprint: 'HC-49S', ItemNumber: 'XTAL-8M-HC49-401223', Description: 'Crystal Oscillator 8MHz 20pF HC-49S SMD, 系统主时钟', Status: '提交' },
        'D1': { RefDes: 'D1', PartNumber: 'KT-0603R', Footprint: '0603', ItemNumber: 'LED-RED-0603-501334', Description: 'Red LED 0603 SMD, 20mA, 波长 620-625nm, 电源指示灯', Status: '归档' },
        'J1': { RefDes: 'J1', PartNumber: 'B4B-PH-K-S', Footprint: 'PH-4P', ItemNumber: 'CONN-PH-4P-601445', Description: 'JST PH Series 4-Pin Connector 2.0mm Pitch, SWD调试接口', Status: '提交' },
        'C4': { RefDes: 'C4', PartNumber: 'CC0603KRX7R9BB104', Footprint: '0603', ItemNumber: 'CAP-MLCC-100N-302201', Description: 'Ceramic Capacitor 100nF 50V X7R 0603 SMD, J1接口滤波', Status: '提交' }
    }
};

// 当前版本器件数据（动态获取）
function getCurrentComponentData() {
    return versionedComponentData[AppState.currentVersion] || versionedComponentData['V2.1'];
}

// 版本演进差异库（语义：当前版本 相较于 对比版本 的变化）
const versionDiffLibrary = {
    'V2.0-vs-V1.0': {
        'U2': { type: 'added', desc: '新增 LDO 稳压芯片' },
        'R1': { type: 'modified', desc: '阻值变更', oldVal: '10K', newVal: '20K', attr: 'PartNumber' },
        'C3': { type: 'deleted', desc: '移除冗余退耦电容' },
        'D1': { type: 'moved', desc: '位置微调避让结构件', oldVal: '(X: 120, Y: 300)', newVal: '(X: 150, Y: 300)', attr: 'Location' }
    },
    'V2.1-vs-V2.0': {
        'C4': { type: 'added', desc: '优化接口电源质量' },
        'R2': { type: 'modified', desc: '调整匹配电阻', oldVal: '4.7K', newVal: '10K', attr: 'PartNumber' },
        'Y1': { type: 'moved', desc: '缩短时钟走线长度', oldVal: '(X: 620, Y: 290)', newVal: '(X: 600, Y: 290)', attr: 'Location' }
    },
    'V2.1-vs-V1.0': {
        'U2': { type: 'added', desc: '新增 LDO 稳压芯片' },
        'C4': { type: 'added', desc: '优化接口电源质量' },
        'R1': { type: 'modified', desc: '阻值变更', oldVal: '10K', newVal: '20K', attr: 'PartNumber' },
        'R2': { type: 'modified', desc: '调整匹配电阻', oldVal: '4.7K', newVal: '10K', attr: 'PartNumber' },
        'C3': { type: 'deleted', desc: '移除冗余退耦电容' },
        'D1': { type: 'moved', desc: '位置微调避让结构件', oldVal: '(X: 120, Y: 300)', newVal: '(X: 150, Y: 300)', attr: 'Location' },
        'Y1': { type: 'moved', desc: '缩短时钟走线长度', oldVal: '(X: 620, Y: 290)', newVal: '(X: 600, Y: 290)', attr: 'Location' }
    }
};

// 当前激活的版本差异数据
let mockDiffData = {};

// 计算版本差异（当前版本 相较于 对比版本）
function calculateVersionDiff(currentVersion, compareVersion) {
    const key = `${currentVersion}-vs-${compareVersion}`;
    if (versionDiffLibrary[key]) {
        mockDiffData = { ...versionDiffLibrary[key] };
        return true;
    }
    // 如果没有预定义，返回空差异
    mockDiffData = {};
    return false;
}

// 批注数据存储
let annotations = [];

// 预置批注数据（按版本隔离，每个版本内 ID 独立从 1 开始）
const presetAnnotations = [
    {
        id: 1,
        text: '建议增加散热过孔，目前高负载下温升过快',
        time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }),
        author: '张三',
        viewType: 'pcb',
        targetRef: 'U1',
        centerX: 430,
        centerY: 360,
        status: 'open',
        version: 'V2.1'
    },
    {
        id: 1,
        text: '阻值与最新 BOM 不符，请确认是 330R 还是 1K',
        time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }),
        author: '李四',
        viewType: 'schematic',
        targetRef: 'R3',
        centerX: 780,
        centerY: 320,
        status: 'resolved',
        version: 'V2.0'
    },
    {
        id: 2,
        text: 'J1 接口丝印字号太小，生产可能模糊',
        time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }),
        author: '王五',
        viewType: 'pcb',
        targetRef: 'J1',
        centerX: 125,
        centerY: 640,
        status: 'open',
        version: 'V2.1'
    }
];

// 获取指定版本的下一个批注 ID（版本内独立计数）
function getNextAnnotationId(version) {
    // 过滤出该版本的所有批注
    const versionAnnotations = annotations.filter(a => a.version === version);
    // 找到最大 ID，如果没有则返回 1
    if (versionAnnotations.length === 0) {
        return 1;
    }
    const maxId = Math.max(...versionAnnotations.map(a => a.id));
    return maxId + 1;
}

// 初始化预置批注（只在应用启动时执行一次）
function initPresetAnnotations() {
    if (annotations.length === 0) {
        annotations = [...presetAnnotations];
    }
}

// 画布变换状态
let canvasState = {
    scale: 1,
    translateX: 0,
    translateY: 0
};

// 工具模式
const ToolMode = {
    SELECT: 'SELECT',
    PAN: 'PAN',
    ANNOTATE: 'ANNOTATE'
};
let currentToolMode = ToolMode.SELECT;

// 当前视图类型和Tab
let currentDrawingType = 'schematic';
let currentTab = 'tree';

// 剥离 Proxy，采用最稳定的直接赋值
let mockComponentData = { ...versionedComponentData[AppState.currentVersion] };
