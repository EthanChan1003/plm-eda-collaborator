// 版本差异数据 - V1.0 到 V2.0 的变更
const mockDiffData = {
    'U2': { type: 'added', desc: '新增 LDO 稳压芯片' },
    'R1': { type: 'modified', desc: '阻值变更', oldVal: '10K', newVal: '20K', attr: 'PartNumber' },
    'C3': { type: 'deleted', desc: '移除冗余退耦电容' },
    'D1': { 
        type: 'moved', 
        desc: '位置微调避让结构件', 
        oldVal: '(X: 120, Y: 300)', 
        newVal: '(X: 150, Y: 300)', 
        attr: 'Location (坐标)' 
    }
};

// 模拟物料数据 - V2.1 完整版 (11个器件)
const mockComponentData = {
    'U1': {
        RefDes: 'U1',
        PartNumber: 'STM32F103RBT6',
        Footprint: 'LQFP-64',
        ItemNumber: 'IC-MCU-ARM-100293',
        Description: 'ARM Cortex-M3 MCU, 128KB Flash, 72MHz, LQFP-64',
        Status: '归档'
    },
    'U2': {
        RefDes: 'U2',
        PartNumber: 'AMS1117-3.3',
        Footprint: 'SOT-223',
        ItemNumber: 'IC-REG-LDO-100456',
        Description: '1A Low Dropout Voltage Regulator, 3.3V Fixed Output',
        Status: '归档'
    },
    'R1': {
        RefDes: 'R1',
        PartNumber: 'RC0603FR-0710KL',
        Footprint: '0603',
        ItemNumber: 'RES-STD-10K-201938',
        Description: 'Thick Film Resistor 10KΩ 1% 1/10W 0603 SMD',
        Status: '归档'
    },
    'R2': {
        RefDes: 'R2',
        PartNumber: 'RC0603FR-074K7L',
        Footprint: '0603',
        ItemNumber: 'RES-STD-4K7-201945',
        Description: 'Thick Film Resistor 4.7KΩ 1% 1/10W 0603 SMD',
        Status: '提交'
    },
    'R3': {
        RefDes: 'R3',
        PartNumber: 'RC0603FR-07330RL',
        Footprint: '0603',
        ItemNumber: 'RES-STD-330R-201952',
        Description: 'Thick Film Resistor 330Ω 1% 1/10W 0603 SMD, LED限流',
        Status: '归档'
    },
    'C1': {
        RefDes: 'C1',
        PartNumber: 'CC0603KRX7R9BB104',
        Footprint: '0603',
        ItemNumber: 'CAP-MLCC-100N-302156',
        Description: 'Ceramic Capacitor 100nF 50V X7R 0603 SMD, 去耦电容',
        Status: '归档'
    },
    'C2': {
        RefDes: 'C2',
        PartNumber: 'CC0805KKX5R8BB106',
        Footprint: '0805',
        ItemNumber: 'CAP-MLCC-10U-302178',
        Description: 'Ceramic Capacitor 10uF 25V X5R 0805 SMD, 滤波电容',
        Status: '归档'
    },
    'C3': {
        RefDes: 'C3',
        PartNumber: 'CC0402JRNPO9BN220',
        Footprint: '0402',
        ItemNumber: 'CAP-MLCC-22P-302189',
        Description: 'Ceramic Capacitor 22pF 50V NP0 0402 SMD, 晶振负载',
        Status: '归档'
    },
    'Y1': {
        RefDes: 'Y1',
        PartNumber: 'X49SM8MSD2SC',
        Footprint: 'HC-49S',
        ItemNumber: 'XTAL-8M-HC49-401223',
        Description: 'Crystal Oscillator 8MHz 20pF HC-49S SMD, 系统主时钟',
        Status: '提交'
    },
    'D1': {
        RefDes: 'D1',
        PartNumber: 'KT-0603R',
        Footprint: '0603',
        ItemNumber: 'LED-RED-0603-501334',
        Description: 'Red LED 0603 SMD, 20mA, 波长 620-625nm, 电源指示灯',
        Status: '归档'
    },
    'J1': {
        RefDes: 'J1',
        PartNumber: 'B4B-PH-K-S',
        Footprint: 'PH-4P',
        ItemNumber: 'CONN-PH-4P-601445',
        Description: 'JST PH Series 4-Pin Connector 2.0mm Pitch, SWD调试接口',
        Status: '提交'
    }
};

// 批注数据存储
let annotations = [];
let annotationCounter = 0;

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
