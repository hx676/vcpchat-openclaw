const api = window.utilityAPI || window.electronAPI;

const state = {
    cases: [],
    bundle: null,
    selectedCaseId: null,
    selectedMaterialId: null,
    selectedReportId: null,
    selectedFieldName: null,
    assistantChat: [],
    dataDir: '',
};

const $ = (id) => document.getElementById(id);
const fieldInputs = () => [...document.querySelectorAll('[data-field]')];
const externalInputs = () => [...document.querySelectorAll('[data-external]')];

const FIELD_META = {
    companyName: { label: '企业名称', group: '主体信息' },
    unifiedSocialCreditCode: { label: '统一社会信用代码', group: '主体信息' },
    legalRepresentative: { label: '法定代表人', group: '主体信息' },
    legalRepresentativeIdCard: { label: '法定代表人身份证号', group: '主体信息' },
    legalRepresentativeBirthDate: { label: '法定代表人出生日期', group: '主体信息' },
    legalRepresentativeAge: { label: '法定代表人年龄', group: '主体信息' },
    registeredAddress: { label: '注册地址', group: '主体信息' },
    establishedDate: { label: '成立日期', group: '主体信息' },
    registeredCapital: { label: '注册资本', group: '主体信息' },
    businessScope: { label: '经营范围', group: '主体信息' },
    industry: { label: '所属行业', group: '主体信息' },
    loanAmount: { label: '申请金额', group: '授信要素' },
    loanPurpose: { label: '贷款用途', group: '授信要素' },
    loanTerm: { label: '授信期限', group: '授信要素' },
    guaranteeMethod: { label: '担保方式', group: '授信要素' },
    totalAssets: { label: '资产总额', group: '财务数据' },
    totalLiabilities: { label: '负债总额', group: '财务数据' },
    revenue: { label: '营业收入', group: '财务数据' },
    netProfit: { label: '净利润', group: '财务数据' },
    financialSummary: { label: '财务摘要', group: '财务数据' },
    cashflowSummary: { label: '流水摘要', group: '流水核验' },
    contractsSummary: { label: '合同/发票摘要', group: '用途佐证' },
    collateralSummary: { label: '担保/抵押摘要', group: '担保资产' },
    externalRiskSummary: { label: '外部风险摘要', group: '外部风险' },
    manualCreditPlan: { label: '本次授信方案', group: '人工补录' },
    manualInvestigationOpinion: { label: '最终调查意见', group: '人工补录' },
    manualRiskMitigation: { label: '风险缓释措施', group: '人工补录' },
};

const STATUS_LABELS = {
    pending: '待确认',
    confirmed: '已确认',
    conflict: '有冲突',
    manual_required: '需人工补录',
};

const MATERIAL_TYPE_OPTIONS = [
    ['business_license', '营业执照/主体证明'],
    ['financial_statement', '财务报表'],
    ['bank_statement', '银行流水'],
    ['contract_invoice', '合同/发票/订单'],
    ['collateral', '担保/抵押资料'],
    ['external_query', '外部查询资料'],
    ['image_document', '图片/扫描件'],
    ['other', '其他材料'],
];

const FIELD_CHOICES = {
    registeredCapital: ['100 万元', '500 万元', '1000 万元', '3000 万元', '5000 万元', '1 亿元'],
    businessScope: [
        '生产、加工、销售相关产品。',
        '批发、零售相关商品及配套服务。',
        '提供技术开发、技术服务、技术咨询。',
        '建筑工程施工及相关配套服务。',
        '普通货物运输、仓储及供应链服务。',
        '以营业执照载明经营范围为准。'
    ],
    industry: ['制造业', '批发零售业', '建筑业', '交通运输业', '住宿餐饮业', '信息技术服务业', '租赁和商务服务业', '农林牧渔业', '居民服务业', '其他'],
    loanAmount: ['50 万元', '100 万元', '300 万元', '500 万元', '1000 万元', '3000 万元', '5000 万元', '1 亿元'],
    loanPurpose: ['补充流动资金', '采购原材料', '支付货款', '订单备货', '设备购置', '项目周转', '置换他行贷款', '支付工资税费', '归还经营性借款'],
    loanTerm: ['3 个月', '6 个月', '12 个月', '24 个月', '36 个月', '60 个月'],
    guaranteeMethod: ['信用', '保证', '抵押', '质押', '保证 + 抵押', '保证 + 质押', '应收账款质押', '存货质押', '保证金质押'],
    totalAssets: ['500 万元', '1000 万元', '3000 万元', '5000 万元', '1 亿元', '3 亿元', '5 亿元'],
    totalLiabilities: ['100 万元', '500 万元', '1000 万元', '3000 万元', '5000 万元', '1 亿元', '3 亿元'],
    revenue: ['500 万元', '1000 万元', '3000 万元', '5000 万元', '1 亿元', '3 亿元', '5 亿元'],
    netProfit: ['亏损', '盈亏平衡', '50 万元', '100 万元', '300 万元', '500 万元', '1000 万元'],
    financialSummary: [
        '财务资料已上传，待结合报表进一步核验。',
        '资产负债结构基本可识别，需复核报表口径和审计情况。',
        '收入与利润需结合纳税、流水和合同交叉验证。',
        '资产负债率需结合行业水平进一步判断。',
        '财务资料不完整，暂不形成确定性判断。'
    ],
    cashflowSummary: [
        '银行流水待补充。',
        '流水与经营规模基本匹配，需人工复核原始明细。',
        '流水波动较大，需说明季节性或大额往来原因。',
        '存在大额关联方往来，需补充交易背景。',
        '回款稳定性需结合主要客户和合同进一步核验。'
    ],
    contractsSummary: [
        '用途佐证材料待补充。',
        '已见合同/订单/发票材料，需核对交易对手和金额。',
        '用途与主营业务相关，需补充付款计划或采购清单。',
        '用途佐证金额与申请金额需进一步匹配。',
        '合同真实性和履约进度需现场或电话核验。'
    ],
    collateralSummary: [
        '暂无抵质押材料。',
        '抵押物材料待核验权属、评估价值和登记状态。',
        '质押物需核验价值稳定性、处置渠道和监管安排。',
        '保证人/抵押物需补充反担保或处置可行性说明。',
        '担保资料不完整，暂不进入最终担保判断。'
    ],
    externalRiskSummary: ['外部核验未见重大异常。', '外部核验存在关注项，需人工补充说明。', '外部核验资料不完整，暂不进入结论判断。'],
    manualCreditPlan: ['授信方案待客户经理补录。', '建议按流动资金贷款方案提交复核，金额和期限以审批确认为准。', '建议先补充材料，暂缓形成授信方案。'],
    manualInvestigationOpinion: ['调查意见待客户经理补录。', '建议进入复核环节，最终结论以审批为准。', '资料不足，建议补充后再形成调查意见。', '存在重大风险关注项，建议审慎推进。'],
    manualRiskMitigation: ['风险缓释措施待补录。', '补充担保/抵押/质押措施，并核验权属和可处置性。', '加强贷后资金用途跟踪和流水监测。', '要求补充交易合同、发票和回款证明。'],
};

const EXTERNAL_CHOICES = {
    businessStatus: ['存续', '在业', '开业', '经营异常', '注销', '吊销', '迁出'],
    judicialRisk: ['无', '存在诉讼记录', '存在重大诉讼', '需补充查询截图'],
    dishonestDebtor: ['无记录', '存在失信记录', '已履行或已解除', '需人工核验'],
    enforcementInfo: ['无记录', '存在被执行记录', '已结案', '需人工核验'],
    administrativePenalty: ['无', '存在行政处罚', '已整改', '需补充查询截图'],
    creditSummary: ['征信资料缺失', '未见重大不良', '存在逾期需核验', '需客户授权查询'],
    relatedCompanies: ['无明显异常关联企业', '存在多家关联企业，需穿透核验', '关联企业资料待补充'],
    publicOpinion: ['未见负面舆情', '存在负面舆情需核验', '舆情资料待补充'],
    notes: ['外部数据来自人工录入。', '外部数据来自查询截图 OCR。', '外部数据来自 JSON 导入。'],
};

const NEW_CASE_CHOICES = {
    newLoanAmount: FIELD_CHOICES.loanAmount,
    newLoanPurpose: FIELD_CHOICES.loanPurpose,
};

const GUARANTEE_METHOD_VALUES = {
    PURE_CREDIT: '纯信用/无担保',
    MORTGAGE: '抵押贷款',
    PLEDGE: '质押贷款',
    GUARANTEE: '保证贷款',
    COMBO: '组合担保',
};

const GUARANTEE_FIELD_GROUPS = {
    pureCredit: ['primaryGuaranteeMethod', 'hasCoBorrower', 'hasGuarantor'],
    mortgage: ['collateralValuation', 'ltvRatio', 'ownershipStatus', 'mortgageInfo'],
    pledge: ['pledgeInfo', 'pledgeValuation', 'pledgeRate'],
    guarantee: ['guarantorInfo'],
};

const GUARANTEE_DYNAMIC_FIELDS = Array.from(new Set([
    ...GUARANTEE_FIELD_GROUPS.pureCredit,
    ...GUARANTEE_FIELD_GROUPS.mortgage,
    ...GUARANTEE_FIELD_GROUPS.pledge,
    ...GUARANTEE_FIELD_GROUPS.guarantee,
    'comboGuaranteeItems',
]));

Object.assign(FIELD_META, {
    guaranteeMethod: { label: '担保方式', group: '授信要素' },
    primaryGuaranteeMethod: { label: '主要担保方式', group: '担保信息' },
    hasCoBorrower: { label: '是否有共同借款人', group: '担保信息' },
    hasGuarantor: { label: '是否有保证人', group: '担保信息' },
    guarantorInfo: { label: '保证人信息', group: '担保信息' },
    collateralValuation: { label: '抵/质押物评估值', group: '担保信息' },
    ltvRatio: { label: 'LTV', group: '担保信息' },
    ownershipStatus: { label: '权属情况', group: '担保信息' },
    mortgageInfo: { label: '抵押物信息', group: '担保信息' },
    pledgeInfo: { label: '质押物信息', group: '担保信息' },
    pledgeValuation: { label: '质押估值', group: '担保信息' },
    pledgeRate: { label: '质押率', group: '担保信息' },
    comboGuaranteeItems: { label: '组合担保项', group: '担保信息' },
});

FIELD_CHOICES.guaranteeMethod = [
    GUARANTEE_METHOD_VALUES.PURE_CREDIT,
    GUARANTEE_METHOD_VALUES.MORTGAGE,
    GUARANTEE_METHOD_VALUES.PLEDGE,
    GUARANTEE_METHOD_VALUES.GUARANTEE,
    GUARANTEE_METHOD_VALUES.COMBO,
];

Object.assign(FIELD_CHOICES, {
    primaryGuaranteeMethod: ['纯信用', '保证', '抵押', '质押', '组合担保'],
    hasCoBorrower: ['否', '是'],
    hasGuarantor: ['否', '是'],
    comboGuaranteeItems: ['抵押', '质押', '保证', '抵押+保证', '质押+保证', '抵押+质押', '抵押+质押+保证'],
    ownershipStatus: ['已确权', '待确权', '共有产权', '存在权属瑕疵'],
    ltvRatio: ['30%', '40%', '50%', '60%', '70%', '80%'],
    pledgeRate: ['20%', '30%', '40%', '50%', '60%', '70%'],
});

function toast(message, type = 'info') {
    const el = $('toast');
    el.textContent = message;
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => el.classList.add('hidden'), 3600);
}

async function unwrap(result, fallbackMessage = '操作失败') {
    const data = await result;
    if (!data || data.success === false) {
        throw new Error(data?.error || fallbackMessage);
    }
    return data;
}

function setBusy(button, busy, text) {
    if (!button) return;
    if (busy) {
        button.dataset.oldText = button.textContent;
        button.textContent = text || '处理中...';
        button.disabled = true;
    } else {
        button.textContent = button.dataset.oldText || button.textContent;
        button.disabled = false;
    }
}

function renderMarkdown(markdown) {
    if (window.marked?.parse) return window.marked.parse(markdown || '');
    return String(markdown || '').replace(/\n/g, '<br>');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function choiceButtonsHtml(kind, key, choices) {
    if (!Array.isArray(choices) || choices.length === 0) return '';
    return `
        <div class="choice-group choice-picker" data-choice-kind="${escapeHtml(kind)}" data-choice-key="${escapeHtml(key)}">
            <div class="choice-menu" hidden>
                ${choices.map(choice => `
                    <button type="button" class="choice-btn" data-choice-value="${escapeHtml(choice)}">${escapeHtml(choice)}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function controlForChoice(kind, key) {
    if (kind === 'field') return fieldInputs().find(input => input.dataset.field === key);
    if (kind === 'external') return externalInputs().find(input => input.dataset.external === key);
    if (kind === 'newCase') return $(key);
    if (kind === 'evidence') return $('fieldEvidenceValueInput');
    return null;
}

function applyChoiceValue(kind, key, value) {
    const control = controlForChoice(kind, key);
    if (!control) return;
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.focus();
    closeChoiceMenus();
    syncChoiceActiveStates();
}

function syncChoiceActiveStates() {
    document.querySelectorAll('.choice-group').forEach(group => {
        const control = controlForChoice(group.dataset.choiceKind, group.dataset.choiceKey);
        const current = (control?.value || '').trim();
        group.querySelectorAll('.choice-btn').forEach(button => {
            const active = current === (button.dataset.choiceValue || '').trim();
            button.classList.toggle('active', active);
        });
    });
}

function closeChoiceMenus(exceptGroup = null) {
    document.querySelectorAll('.choice-group').forEach(group => {
        if (group === exceptGroup) return;
        group.classList.remove('open');
        const menu = group.querySelector('.choice-menu');
        if (menu) menu.hidden = true;
    });
}

function choiceDescriptorForControl(control) {
    if (!control) return null;
    if (control.id === 'fieldEvidenceValueInput' && state.selectedFieldName && FIELD_CHOICES[state.selectedFieldName]) {
        return { kind: 'evidence', key: state.selectedFieldName };
    }
    if (control.dataset?.field && FIELD_CHOICES[control.dataset.field]) {
        return { kind: 'field', key: control.dataset.field };
    }
    if (control.dataset?.external && EXTERNAL_CHOICES[control.dataset.external]) {
        return { kind: 'external', key: control.dataset.external };
    }
    if (control.id && NEW_CASE_CHOICES[control.id]) {
        return { kind: 'newCase', key: control.id };
    }
    return null;
}

function findChoiceGroup(kind, key) {
    return [...document.querySelectorAll('.choice-group')]
        .find(group => group.dataset.choiceKind === kind && group.dataset.choiceKey === key) || null;
}

function openChoiceMenuForControl(control) {
    const descriptor = choiceDescriptorForControl(control);
    if (!descriptor) return false;
    const group = findChoiceGroup(descriptor.kind, descriptor.key);
    const menu = group?.querySelector('.choice-menu');
    if (!group || !menu) return false;
    closeChoiceMenus(group);
    group.classList.add('open');
    menu.hidden = false;
    syncChoiceActiveStates();
    return true;
}

function createLabeledControl({
    labelText,
    tagName = 'input',
    attrName,
    attrValue,
    id,
    className = '',
    placeholder = '',
}) {
    const label = document.createElement('label');
    if (className) label.className = className;
    label.append(document.createTextNode(labelText));

    const control = document.createElement(tagName);
    if (attrName && attrValue) control.setAttribute(attrName, attrValue);
    if (id) control.id = id;
    if (placeholder) control.placeholder = placeholder;
    label.appendChild(control);
    return label;
}

function insertAfterAnchor(container, labelNode, anchorSelector) {
    if (!container || !labelNode) return;
    const anchor = anchorSelector ? container.querySelector(anchorSelector)?.closest('label') : null;
    if (anchor && anchor.parentElement === container) {
        anchor.insertAdjacentElement('afterend', labelNode);
        return;
    }
    container.appendChild(labelNode);
}

function ensureFieldControl(container, config) {
    if (!container || !config?.key) return;
    if (container.querySelector(`[data-field="${config.key}"]`)) return;
    const node = createLabeledControl({
        labelText: config.label,
        tagName: config.tagName || 'input',
        attrName: 'data-field',
        attrValue: config.key,
        className: config.className || '',
        placeholder: config.placeholder || '',
    });
    insertAfterAnchor(container, node, config.after ? `[data-field="${config.after}"]` : null);
}

function ensureExternalControl(container, config) {
    if (!container || !config?.key) return;
    if (container.querySelector(`[data-external="${config.key}"]`)) return;
    const node = createLabeledControl({
        labelText: config.label,
        tagName: config.tagName || 'input',
        attrName: 'data-external',
        attrValue: config.key,
        className: config.className || '',
        placeholder: config.placeholder || '',
    });
    insertAfterAnchor(container, node, config.after ? `[data-external="${config.after}"]` : null);
}

function ensureNewCaseControl(config) {
    if (!config?.id || $(config.id)) return;
    const form = $('newCaseForm');
    if (!form) return;
    const node = createLabeledControl({
        labelText: config.label,
        tagName: config.tagName || 'input',
        id: config.id,
        placeholder: config.placeholder || '',
    });
    const anchor = config.afterId ? `#${config.afterId}` : null;
    insertAfterAnchor(form, node, anchor);
}

function removeBrokenPlaceholderLabels(container) {
    if (!container) return;
    [...container.querySelectorAll('label')].forEach((label) => {
        const hasControl = !!label.querySelector('input, textarea, select');
        if (hasControl) return;
        const text = (label.textContent || '').toLowerCase();
        if (text.includes('input data-') || text.includes('textarea data-')) {
            label.remove();
        }
    });
}

function ensureCreditFormControls() {
    const grids = [...document.querySelectorAll('.form-grid')];
    const fieldGrid = grids.find(grid => grid.querySelector('[data-field]'));
    const externalGrid = grids.find(grid => grid.querySelector('[data-external]'));
    const newCaseForm = $('newCaseForm');

    removeBrokenPlaceholderLabels(fieldGrid);
    removeBrokenPlaceholderLabels(externalGrid);
    removeBrokenPlaceholderLabels(newCaseForm);

    ensureFieldControl(fieldGrid, { key: 'legalRepresentative', label: '法定代表人', after: 'unifiedSocialCreditCode' });
    ensureFieldControl(fieldGrid, { key: 'legalRepresentativeIdCard', label: '法定代表人身份证号', after: 'legalRepresentative', placeholder: '18位身份证号' });
    ensureFieldControl(fieldGrid, { key: 'legalRepresentativeBirthDate', label: '法定代表人出生日期', after: 'legalRepresentativeIdCard', placeholder: 'YYYY-MM-DD' });
    ensureFieldControl(fieldGrid, { key: 'legalRepresentativeAge', label: '法定代表人年龄', after: 'legalRepresentativeBirthDate', placeholder: '自动推导/手动修正' });

    // Some historical templates may lose these nodes due to malformed markup; auto-heal on load.
    ensureFieldControl(fieldGrid, { key: 'industry', label: '所属行业', after: 'registeredCapital' });
    ensureFieldControl(fieldGrid, { key: 'loanPurpose', label: '贷款用途', tagName: 'textarea', className: 'wide', after: 'businessScope' });
    ensureFieldControl(fieldGrid, { key: 'manualInvestigationOpinion', label: '最终调查意见', tagName: 'textarea', className: 'wide', after: 'manualCreditPlan' });

    ensureExternalControl(externalGrid, { key: 'businessStatus', label: '工商状态', after: 'administrativePenalty' });
    ensureExternalControl(externalGrid, { key: 'dishonestDebtor', label: '失信被执行', after: 'businessStatus' });
    ensureExternalControl(externalGrid, { key: 'enforcementInfo', label: '被执行信息', after: 'dishonestDebtor' });

    ensureNewCaseControl({
        id: 'newLoanPurpose',
        label: '贷款用途',
        tagName: 'textarea',
        placeholder: '例如采购原材料、补充流动资金',
        afterId: 'newLoanAmount',
    });
}

function ensureChoiceControls() {
    fieldInputs().forEach(input => {
        const key = input.dataset.field;
        const choices = FIELD_CHOICES[key];
        if (!choices || input.parentElement?.querySelector(`.choice-group[data-choice-kind="field"][data-choice-key="${key}"]`)) return;
        input.insertAdjacentHTML('afterend', choiceButtonsHtml('field', key, choices));
    });

    externalInputs().forEach(input => {
        const key = input.dataset.external;
        const choices = EXTERNAL_CHOICES[key];
        if (!choices || input.parentElement?.querySelector(`.choice-group[data-choice-kind="external"][data-choice-key="${key}"]`)) return;
        input.insertAdjacentHTML('afterend', choiceButtonsHtml('external', key, choices));
    });

    Object.entries(NEW_CASE_CHOICES).forEach(([id, choices]) => {
        const input = $(id);
        if (!input || input.parentElement?.querySelector(`.choice-group[data-choice-kind="newCase"][data-choice-key="${id}"]`)) return;
        input.insertAdjacentHTML('afterend', choiceButtonsHtml('newCase', id, choices));
    });
}

function setupCreditFormControls() {
    ensureCreditFormControls();
    const grids = [...document.querySelectorAll('.form-grid')];
    const fieldGrid = grids.find(grid => grid.querySelector('[data-field]'));
    if (!fieldGrid) return;

    ensureFieldControl(fieldGrid, { key: 'guaranteeMethod', label: '担保方式', after: 'loanTerm', placeholder: '例如：纯信用/无担保' });
    ensureFieldControl(fieldGrid, { key: 'primaryGuaranteeMethod', label: '主要担保方式', after: 'guaranteeMethod', placeholder: '例如：纯信用、保证、抵押' });
    ensureFieldControl(fieldGrid, { key: 'hasCoBorrower', label: '是否有共同借款人', after: 'primaryGuaranteeMethod' });
    ensureFieldControl(fieldGrid, { key: 'hasGuarantor', label: '是否有保证人', after: 'hasCoBorrower' });
    ensureFieldControl(fieldGrid, { key: 'guarantorInfo', label: '保证人信息', tagName: 'textarea', className: 'wide', after: 'hasGuarantor', placeholder: '填写保证人主体、关系、担保能力说明' });
    ensureFieldControl(fieldGrid, { key: 'comboGuaranteeItems', label: '组合担保项', after: 'hasGuarantor', placeholder: '例如：抵押+保证' });
    ensureFieldControl(fieldGrid, { key: 'collateralValuation', label: '抵/质押物评估值', after: 'comboGuaranteeItems', placeholder: '例如：500万元' });
    ensureFieldControl(fieldGrid, { key: 'ltvRatio', label: 'LTV', after: 'collateralValuation', placeholder: '例如：60%' });
    ensureFieldControl(fieldGrid, { key: 'ownershipStatus', label: '权属情况', after: 'ltvRatio' });
    ensureFieldControl(fieldGrid, { key: 'mortgageInfo', label: '抵押物信息', tagName: 'textarea', className: 'wide', after: 'ownershipStatus', placeholder: '填写抵押物类型、位置、权证、处置性等' });
    ensureFieldControl(fieldGrid, { key: 'pledgeInfo', label: '质押物信息', tagName: 'textarea', className: 'wide', after: 'mortgageInfo', placeholder: '填写质押物类型、监管、变现路径等' });
    ensureFieldControl(fieldGrid, { key: 'pledgeValuation', label: '质押估值', after: 'pledgeInfo', placeholder: '例如：300万元' });
    ensureFieldControl(fieldGrid, { key: 'pledgeRate', label: '质押率', after: 'pledgeValuation', placeholder: '例如：50%' });
}

function normalizeGuaranteeMethod(value) {
    const normalized = String(value || '').replace(/\s+/g, '');
    if (!normalized) return '';
    if (normalized.includes('纯信用') || normalized.includes('无担保') || normalized === '信用') return 'pure_credit';
    const hasMortgage = normalized.includes('抵押');
    const hasPledge = normalized.includes('质押');
    const hasGuarantee = normalized.includes('保证');
    if (normalized.includes('组合') || normalized.includes('+') || normalized.includes('＋') || normalized.includes('、')) return 'combo';
    if (normalized.includes('/') && ((hasMortgage && hasGuarantee) || (hasMortgage && hasPledge) || (hasPledge && hasGuarantee))) return 'combo';
    if (normalized.includes('抵押')) return 'mortgage';
    if (normalized.includes('质押')) return 'pledge';
    if (normalized.includes('保证')) return 'guarantee';
    return '';
}

function parseComboFlags(value) {
    const textValue = String(value || '');
    return {
        mortgage: /抵押/.test(textValue),
        pledge: /质押/.test(textValue),
        guarantee: /保证/.test(textValue),
    };
}

function setFieldLabelVisibility(fieldName, visible) {
    const input = fieldInputs().find(item => item.dataset.field === fieldName);
    const label = input?.closest('label');
    if (!label) return;
    label.classList.toggle('hidden', !visible);
}

function updateGuaranteeFieldVisibility() {
    const guaranteeMethod = fieldInputs().find(item => item.dataset.field === 'guaranteeMethod')?.value || '';
    const comboItems = fieldInputs().find(item => item.dataset.field === 'comboGuaranteeItems')?.value || '';
    const method = normalizeGuaranteeMethod(guaranteeMethod);
    const visible = new Set();

    if (method === 'pure_credit') {
        GUARANTEE_FIELD_GROUPS.pureCredit.forEach((field) => visible.add(field));
    } else if (method === 'mortgage') {
        GUARANTEE_FIELD_GROUPS.mortgage.forEach((field) => visible.add(field));
    } else if (method === 'pledge') {
        GUARANTEE_FIELD_GROUPS.pledge.forEach((field) => visible.add(field));
    } else if (method === 'guarantee') {
        GUARANTEE_FIELD_GROUPS.guarantee.forEach((field) => visible.add(field));
    } else if (method === 'combo') {
        visible.add('comboGuaranteeItems');
        const flags = parseComboFlags(comboItems || guaranteeMethod);
        if (flags.mortgage) GUARANTEE_FIELD_GROUPS.mortgage.forEach((field) => visible.add(field));
        if (flags.pledge) GUARANTEE_FIELD_GROUPS.pledge.forEach((field) => visible.add(field));
        if (flags.guarantee) GUARANTEE_FIELD_GROUPS.guarantee.forEach((field) => visible.add(field));
    }

    GUARANTEE_DYNAMIC_FIELDS.forEach((fieldName) => {
        setFieldLabelVisibility(fieldName, visible.has(fieldName));
    });
}

function currentReport() {
    const reports = state.bundle?.reports || [];
    return reports.find(item => item.id === state.selectedReportId)
        || reports.find(item => item.id === state.bundle?.case?.activeReportId)
        || reports[0]
        || null;
}

async function loadCases() {
    const result = await unwrap(api.creditListCases(), '无法加载案件列表');
    state.cases = result.cases || [];
    state.dataDir = result.dataDir || '';
    $('dataDir').textContent = state.dataDir ? `本地数据：${state.dataDir}` : '';
    renderCaseList();
    if (state.selectedCaseId && state.cases.some(item => item.id === state.selectedCaseId)) {
        await selectCase(state.selectedCaseId);
    } else if (state.cases[0]) {
        await selectCase(state.cases[0].id);
    } else {
        state.bundle = null;
        renderWorkspace();
    }
}

async function loadAssistantChat(caseId) {
    if (!caseId || !api.creditGetAssistantChat) {
        state.assistantChat = [];
        return;
    }
    const result = await unwrap(api.creditGetAssistantChat(caseId), '无法加载助手对话');
    state.assistantChat = result.chat || [];
}

function renderCaseList() {
    const keyword = $('caseSearch').value.trim().toLowerCase();
    const list = state.cases.filter(item => {
        const hay = `${item.name || ''} ${item.companyName || ''} ${item.loanAmount || ''} ${item.status || ''}`.toLowerCase();
        return !keyword || hay.includes(keyword);
    });
    $('caseList').innerHTML = list.map(item => {
        const progress = item.fieldProgress || {};
        return `
            <div class="case-card ${item.id === state.selectedCaseId ? 'active' : ''}" data-case-id="${item.id}">
                <strong>${item.name || item.companyName || '企业授信案件'}</strong>
                <span>${item.companyName || '企业名称待补充'}</span>
                <span>${item.loanAmount || '金额待补充'} · ${item.status || 'draft'}</span>
                <span>字段：已确认 ${progress.confirmed || 0} / 待处理 ${(progress.pending || 0) + (progress.conflict || 0) + (progress.manualRequired || 0)}</span>
            </div>
        `;
    }).join('') || '<div class="muted-box">暂无案件</div>';
}

async function selectCase(caseId) {
    state.selectedCaseId = caseId;
    const result = await unwrap(api.creditGetCase(caseId), '无法加载案件');
    state.bundle = result.bundle;
    state.selectedMaterialId = state.bundle.materials[0]?.id || null;
    state.selectedReportId = state.bundle.case.activeReportId || state.bundle.reports[0]?.id || null;
    state.selectedFieldName = pickInitialFieldName();
    await loadAssistantChat(caseId);
    renderCaseList();
    renderWorkspace();
}

function pickInitialFieldName() {
    const evidence = state.bundle?.case?.fieldEvidence || {};
    return Object.keys(evidence)[0] || null;
}

function fieldMeta(fieldName) {
    return FIELD_META[fieldName] || { label: fieldName, group: '其他' };
}

function normalizedEvidenceEntries() {
    const evidence = state.bundle?.case?.fieldEvidence || {};
    const groupOrder = ['主体信息', '授信要素', '财务数据', '流水核验', '用途佐证', '担保资产', '外部风险', '人工补录', '其他'];
    const statusOrder = { conflict: 0, pending: 1, manual_required: 2, confirmed: 3 };
    return Object.values(evidence)
        .filter(Boolean)
        .map(item => {
            const meta = fieldMeta(item.fieldName);
            return {
                ...item,
                label: item.label || meta.label,
                group: item.group || meta.group,
                status: item.status || 'manual_required',
            };
        })
        .sort((a, b) => {
            const groupIndex = (group) => {
                const index = groupOrder.indexOf(group);
                return index === -1 ? groupOrder.length : index;
            };
            const groupDiff = groupIndex(a.group) - groupIndex(b.group);
            if (groupDiff !== 0) return groupDiff;
            const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
            if (statusDiff !== 0) return statusDiff;
            return String(a.label).localeCompare(String(b.label), 'zh-Hans-CN');
        });
}

function statusClass(status) {
    return `status-${status || 'manual_required'}`;
}

function statusLabel(status) {
    return STATUS_LABELS[status] || status || '需人工补录';
}

function confidenceLabel(confidence) {
    const value = Number(confidence);
    if (!Number.isFinite(value)) return '置信度待评估';
    return `置信度 ${Math.round(value * 100)}%`;
}

function materialTypeOptionsHtml(selectedType) {
    return MATERIAL_TYPE_OPTIONS.map(([value, label]) => `
        <option value="${escapeHtml(value)}" ${value === selectedType ? 'selected' : ''}>${escapeHtml(label)}</option>
    `).join('');
}

function renderRecognitionSummary() {
    const materials = state.bundle.materials || [];
    const total = materials.length;
    const processed = materials.filter(item => ['parsed', 'manual_reviewed', 'manual_required'].includes(item.extractStatus)).length;
    const failed = materials.filter(item => item.extractStatus === 'failed').length;
    const progress = state.bundle.fieldProgress || {};
    const entries = normalizedEvidenceEntries();
    const missing = entries.filter(item => item.status !== 'confirmed');

    $('materialProgressSummary').textContent = failed
        ? `${processed} / ${total}，失败 ${failed}`
        : `${processed} / ${total}`;
    const requiredMaterialTypes = MATERIAL_TYPE_OPTIONS
        .filter(([value]) => !['image_document', 'other'].includes(value));
    const presentTypes = new Set(materials.map(item => item.materialType).filter(Boolean));
    const presentLabels = requiredMaterialTypes
        .filter(([value]) => presentTypes.has(value))
        .map(([, label]) => label.replace('/主体证明', '').replace('/订单', ''));
    const missingLabels = requiredMaterialTypes
        .filter(([value]) => !presentTypes.has(value))
        .map(([, label]) => label.replace('/主体证明', '').replace('/订单', ''));
    $('materialCategorySummary').textContent = materials.length
        ? `已归类：${presentLabels.join('、') || '暂无核心分类'}。缺少：${missingLabels.join('、') || '核心材料分类已覆盖'}。`
        : '请先上传营业执照、财报、流水、合同/发票、担保材料和外部查询截图。';
    $('fieldProgressSummary').textContent = `${progress.confirmed || 0} 已确认 / ${progress.total || entries.length || 0} 已识别`;
    $('missingFieldCount').textContent = missing.length;
    $('missingFieldList').textContent = missing.length
        ? `${missing.slice(0, 6).map(item => `${item.label}（${statusLabel(item.status)}）`).join('、')}${missing.length > 6 ? ` 等 ${missing.length} 项` : ''}`
        : '暂无待补充字段。';
}

function renderAssistantChat() {
    const log = $('assistantChatLog');
    if (!log) return;
    const hasCase = Boolean(state.bundle?.case);
    $('assistantUploadBtn').disabled = !hasCase;
    $('assistantSendBtn').disabled = !hasCase;
    $('assistantInput').disabled = !hasCase;
    if (!hasCase) {
        log.innerHTML = `
            <div class="assistant-message assistant">
                <small>AI 材料助手</small>
                先在左侧新建或选择一个授信案件。选中案件后，你就可以在这里上传图片/文件，或粘贴 OCR 文本让我识别。
            </div>
        `;
        return;
    }
    const messages = state.assistantChat || [];
    if (!messages.length) {
        log.innerHTML = `
            <div class="assistant-message assistant">
                <small>AI 材料助手</small>
                可以直接点“发送文件/图片”上传营业执照、财报、流水、合同、抵押物或查询截图；也可以把 OCR 文本粘贴到输入框。我会把识别结果放进字段核验台，等你确认后再同步到主字段。
            </div>
        `;
        return;
    }
    log.innerHTML = messages.map(item => `
        <div class="assistant-message ${item.role === 'user' ? 'user' : 'assistant'}">
            <small>${item.role === 'user' ? '你' : 'AI 材料助手'} · ${new Date(item.createdAt || Date.now()).toLocaleString()}</small>
            ${escapeHtml(item.content || '')}
        </div>
    `).join('');
    log.scrollTop = log.scrollHeight;
}

function renderFieldBoard() {
    const entries = normalizedEvidenceEntries();
    if (!entries.length) {
        state.selectedFieldName = null;
        $('fieldBoard').innerHTML = '<div class="muted-box">上传营业执照、财报、流水、合同、抵押物或外部查询截图后，这里会自动生成待确认字段。</div>';
        return;
    }
    if (!state.selectedFieldName || !entries.some(item => item.fieldName === state.selectedFieldName)) {
        state.selectedFieldName = entries[0].fieldName;
    }

    let currentGroup = '';
    const html = [];
    for (const item of entries) {
        if (item.group !== currentGroup) {
            currentGroup = item.group;
            html.push(`<div class="field-group-title">${escapeHtml(currentGroup)}</div>`);
        }
        const sourceNames = (item.sources || []).map(source => source.materialName).filter(Boolean);
        html.push(`
            <div class="field-card ${item.fieldName === state.selectedFieldName ? 'active' : ''}" data-field-name="${escapeHtml(item.fieldName)}">
                <div class="field-card-head">
                    <div>
                        <strong>${escapeHtml(item.label)}</strong>
                        <div class="meta-line">
                            <span>${confidenceLabel(item.confidence)}</span>
                            <span>${escapeHtml(item.method || 'extractor')}</span>
                            ${sourceNames.length ? `<span>${escapeHtml(sourceNames[0])}${sourceNames.length > 1 ? ` 等 ${sourceNames.length} 份` : ''}</span>` : '<span>人工/历史字段</span>'}
                        </div>
                    </div>
                    <span class="chip ${statusClass(item.status)}">${statusLabel(item.status)}</span>
                </div>
                <div class="field-value">${escapeHtml(item.value || '待识别/待补录')}</div>
                ${(item.conflicts || []).length ? `<div class="meta-line"><span class="chip status-conflict">冲突 ${item.conflicts.length}</span></div>` : ''}
            </div>
        `);
    }
    $('fieldBoard').innerHTML = html.join('');
}

function renderEvidencePanel() {
    const evidence = state.bundle?.case?.fieldEvidence || {};
    const item = state.selectedFieldName ? evidence[state.selectedFieldName] : null;
    if (!item) {
        $('evidenceStatus').textContent = '未选择字段';
        $('evidenceStatus').className = 'chip';
        $('evidencePanel').innerHTML = '<div class="muted-box">点击字段卡片后，可查看来源材料、OCR 文本片段、置信度和冲突值。</div>';
        return;
    }

    const meta = fieldMeta(item.fieldName);
    const status = item.status || 'manual_required';
    $('evidenceStatus').textContent = statusLabel(status);
    $('evidenceStatus').className = `chip ${statusClass(status)}`;
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const conflicts = Array.isArray(item.conflicts) ? item.conflicts : [];

    $('evidencePanel').innerHTML = `
        <label>${escapeHtml(item.label || meta.label)}
            <textarea id="fieldEvidenceValueInput" placeholder="修正字段值后点击“确认选中字段”">${escapeHtml(item.value || '')}</textarea>
            ${choiceButtonsHtml('evidence', item.fieldName, FIELD_CHOICES[item.fieldName])}
        </label>
        <div class="meta-line">
            <span class="chip ${statusClass(status)}">${statusLabel(status)}</span>
            <span>${confidenceLabel(item.confidence)}</span>
            <span>识别方式：${escapeHtml(item.method || 'extractor')}</span>
            <span>字段模块：${escapeHtml(item.group || meta.group)}</span>
        </div>
        <div class="evidence-source">
            <strong>来源材料</strong>
            ${sources.length ? sources.map(source => `
                <div class="meta-line">
                    <span class="chip">${escapeHtml(source.materialTypeLabel || source.materialType || '材料')}</span>
                    <span>${escapeHtml(source.materialName || '未知材料')}</span>
                    <span>${escapeHtml(source.parser || item.method || '')}</span>
                </div>
            `).join('') : '<p>人工录入或历史字段，无材料来源。</p>'}
        </div>
        <div class="evidence-source">
            <strong>证据文本</strong>
            <div class="evidence-snippet">${escapeHtml(item.evidenceText || '暂无证据文本。')}</div>
        </div>
        ${conflicts.length ? `
            <div class="evidence-source">
                <strong>冲突值</strong>
                ${conflicts.map(conflict => `
                    <div class="evidence-snippet">
                        <div><strong>${escapeHtml(conflict.value || '')}</strong> · ${confidenceLabel(conflict.confidence)}</div>
                        <div>${escapeHtml(conflict.evidenceText || '')}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
        <div class="muted-box">确认后，该字段会写入“确认后的主字段”，并进入规则筛查和报告正文；未确认字段只会进入报告的待补充清单。</div>
    `;
    syncChoiceActiveStates();
}

function renderWorkspace() {
    const hasCase = Boolean(state.bundle?.case);
    $('emptyState').classList.toggle('hidden', hasCase);
    $('caseWorkspace').classList.toggle('hidden', !hasCase);
    const actionButtons = ['importMaterialsBtn', 'runRulesBtn', 'generateReportBtn', 'exportMarkdownBtn', 'exportWordBtn'];
    actionButtons.forEach(id => $(id).disabled = !hasCase);
    if (!hasCase) {
        state.assistantChat = [];
        renderAssistantChat();
        return;
    }

    const caseData = state.bundle.case;
    $('caseNameInput').value = caseData.name || '';
    $('caseStatusInput').value = caseData.status || 'draft';
    fieldInputs().forEach(input => {
        input.value = caseData.fields?.[input.dataset.field] || '';
    });
    externalInputs().forEach(input => {
        input.value = state.bundle.externalData?.[input.dataset.external] || '';
    });
    $('materialCount').textContent = state.bundle.materials.length;
    const progress = state.bundle.fieldProgress || {};
    $('fieldConfirmedCount').textContent = progress.confirmed || 0;
    $('fieldPendingCount').textContent = progress.pending || 0;
    $('fieldConflictCount').textContent = progress.conflict || 0;
    $('ruleHighCount').textContent = state.bundle.ruleResults?.stats?.high || 0;
    $('reportCount').textContent = state.bundle.reports.length;
    renderRecognitionSummary();
    renderAssistantChat();
    renderFieldBoard();
    renderEvidencePanel();
    renderMaterials();
    renderExtractEditor();
    renderRules();
    renderReports();
    updateGuaranteeFieldVisibility();
    syncChoiceActiveStates();
}

function renderMaterials() {
    const materials = state.bundle.materials || [];
    $('materialList').innerHTML = materials.map(item => `
        <div class="material-item ${item.id === state.selectedMaterialId ? 'active' : ''}" data-material-id="${item.id}">
            <strong>${item.originalName}</strong>
            <label class="material-type-control">
                材料分类
                <select data-material-type-id="${escapeHtml(item.id)}">
                    ${materialTypeOptionsHtml(item.materialType || 'other')}
                </select>
            </label>
            <div class="meta-line">
                <span class="chip">${item.materialTypeLabel || '其他材料'}${item.manualMaterialType ? ' · 人工' : ''}</span>
                <span>解析：${item.extractStatus || 'pending'}</span>
                ${item.parser ? `<span>解析器：${escapeHtml(item.parser)}</span>` : ''}
                <span>${Math.round((item.size || 0) / 1024)} KB</span>
                ${item.warningCount ? `<span>${item.warningCount} 条提醒</span>` : ''}
            </div>
        </div>
    `).join('') || '<div class="muted-box">尚未上传材料。点击顶部“上传并解析材料”。</div>';
}

function renderExtractEditor() {
    const materialId = state.selectedMaterialId;
    const extract = materialId ? state.bundle.extracts?.[materialId] : null;
    $('extractEmpty').classList.toggle('hidden', Boolean(extract));
    $('extractEditor').classList.toggle('hidden', !extract);
    if (!extract) return;
    $('extractTextEditor').value = extract.extractedText || '';
    $('extractStructuredEditor').value = JSON.stringify(extract.structuredFields || {}, null, 2);
    $('extractWarnings').innerHTML = (extract.warnings || []).map(item => `<div>${item}</div>`).join('');
    $('extractWarnings').classList.toggle('hidden', !(extract.warnings || []).length);
}

function severityClass(severity) {
    if (severity === 'high') return 'sev-high';
    if (severity === 'medium') return 'sev-medium';
    return 'sev-low';
}

function renderRules() {
    const results = state.bundle.ruleResults || {};
    const stats = results.stats || {};
    $('ruleStats').textContent = results.generatedAt
        ? `共 ${stats.total || 0} 项 · 高 ${stats.high || 0} · 中 ${stats.medium || 0} · 低 ${stats.low || 0}`
        : '未运行';
    $('ruleList').innerHTML = (results.rules || []).map(rule => `
        <div class="rule-item">
            <div class="meta-line">
                <span class="chip ${severityClass(rule.severity)}">${rule.severity}</span>
                <span>${rule.category}</span>
                <span>${rule.source || '系统规则'}</span>
            </div>
            <h3>${rule.title}</h3>
            <p>${rule.description}</p>
            <p><strong>证据：</strong>${rule.evidence || '无'}</p>
            <p><strong>建议：</strong>${rule.recommendation || '人工复核'}</p>
        </div>
    `).join('') || '<div class="muted-box">尚未运行规则。</div>';
}

function renderReports() {
    const reports = state.bundle.reports || [];
    $('reportSelect').innerHTML = reports.map(item => `<option value="${item.id}">${item.title || '报告'} · ${new Date(item.updatedAt || item.createdAt).toLocaleString()}</option>`).join('');
    const report = currentReport();
    if (report) {
        state.selectedReportId = report.id;
        $('reportSelect').value = report.id;
        $('reportEditor').value = report.content || '';
        $('reportPreview').innerHTML = renderMarkdown(report.content || '');
        $('reportWarning').textContent = report.warning || '';
        $('reportWarning').classList.toggle('hidden', !report.warning);
    } else {
        $('reportEditor').value = '';
        $('reportPreview').innerHTML = '<div class="muted-box">暂无报告。点击“生成报告”。</div>';
        $('reportWarning').classList.add('hidden');
    }
}

function collectFields() {
    const fields = {};
    fieldInputs().forEach(input => {
        fields[input.dataset.field] = input.value.trim();
    });
    return fields;
}

function collectExternal() {
    const data = {};
    externalInputs().forEach(input => {
        data[input.dataset.external] = input.value.trim();
    });
    return data;
}

async function refreshCurrentCase() {
    if (!state.selectedCaseId) return;
    const previousMaterialId = state.selectedMaterialId;
    const previousReportId = state.selectedReportId;
    const previousFieldName = state.selectedFieldName;
    const result = await unwrap(api.creditGetCase(state.selectedCaseId), '无法刷新案件');
    state.bundle = result.bundle;
    state.selectedMaterialId = state.bundle.materials.some(item => item.id === previousMaterialId)
        ? previousMaterialId
        : state.bundle.materials[0]?.id || null;
    state.selectedReportId = state.bundle.reports.some(item => item.id === previousReportId)
        ? previousReportId
        : state.bundle.case.activeReportId || state.bundle.reports[0]?.id || null;
    state.selectedFieldName = state.bundle.case.fieldEvidence?.[previousFieldName]
        ? previousFieldName
        : pickInitialFieldName();
    await loadAssistantChat(state.selectedCaseId);
    renderWorkspace();
    const listResult = await unwrap(api.creditListCases(), '无法刷新案件列表');
    state.cases = listResult.cases || [];
    state.dataDir = listResult.dataDir || state.dataDir;
    $('dataDir').textContent = state.dataDir ? `本地数据：${state.dataDir}` : '';
    renderCaseList();
}

async function saveCase() {
    if (!state.selectedCaseId) return;
    const result = await unwrap(api.creditUpdateCase(state.selectedCaseId, {
        name: $('caseNameInput').value.trim() || '企业授信案件',
        status: $('caseStatusInput').value,
        fields: collectFields(),
    }), '保存案件失败');
    state.bundle.case = result.case;
    toast('案件已保存');
    await refreshCurrentCase();
}

async function saveExternal() {
    if (!state.selectedCaseId) return;
    const result = await unwrap(api.creditSaveExternalData(state.selectedCaseId, collectExternal()), '保存外部数据失败');
    state.bundle.externalData = result.externalData;
    toast('外部数据已保存');
    await refreshCurrentCase();
}

async function saveExtract() {
    if (!state.selectedCaseId || !state.selectedMaterialId) return;
    let structuredFields;
    try {
        structuredFields = JSON.parse($('extractStructuredEditor').value || '{}');
    } catch (error) {
        toast(`结构化字段 JSON 格式错误：${error.message}`, 'error');
        return;
    }
    await unwrap(api.creditSaveExtract(state.selectedCaseId, state.selectedMaterialId, {
        extractedText: $('extractTextEditor').value,
        structuredFields,
        status: 'manual_reviewed',
    }), '保存抽取结果失败');
    toast('抽取校对已保存');
    await refreshCurrentCase();
}

function assistantUploadReply(result) {
    const materials = result.materials || [];
    const extracts = result.extracts || [];
    const fieldCount = extracts.reduce((sum, item) => sum + Object.keys(item.structuredFields || {}).length, 0);
    const failed = extracts.filter(item => item.status === 'failed').length;
    const materialNames = materials.map(item => item.originalName).slice(0, 6).join('、');
    const progress = state.bundle?.fieldProgress || {};
    return [
        `已收到 ${materials.length} 个文件/图片：${materialNames || '材料'}`,
        `解析后识别出 ${fieldCount} 个结构化字段，已放入字段核验台。${failed ? `其中 ${failed} 个材料解析失败，需要人工补录或重跑。` : ''}`,
        `当前字段状态：已确认 ${progress.confirmed || 0}，待确认 ${progress.pending || 0}，冲突 ${progress.conflict || 0}，需人工补录 ${progress.manualRequired || 0}。`,
        '下一步建议：先点字段卡片看证据文本，确认无误后点击“确认选中字段”。',
    ].filter(Boolean).join('\n\n');
}

async function appendAssistantMessages(messages) {
    if (!state.selectedCaseId || !api.creditAppendAssistantChat) return;
    const result = await unwrap(api.creditAppendAssistantChat(state.selectedCaseId, messages), '保存助手对话失败');
    state.assistantChat = result.chat || [];
    renderAssistantChat();
}

async function sendAssistantMessage() {
    if (!state.selectedCaseId) return;
    const input = $('assistantInput');
    const message = input.value.trim();
    if (!message) {
        toast('先输入一段材料文本或问题', 'error');
        return;
    }
    const btn = $('assistantSendBtn');
    setBusy(btn, true, '识别中...');
    try {
        const previousMaterialCount = state.bundle?.materials?.length || 0;
        const result = await unwrap(api.creditSendAssistantMessage(state.selectedCaseId, message), '助手处理失败');
        input.value = '';
        state.bundle = result.bundle || state.bundle;
        state.assistantChat = result.chat || state.assistantChat;
        state.selectedMaterialId = state.bundle.materials.length > previousMaterialCount
            ? state.bundle.materials[state.bundle.materials.length - 1].id
            : state.selectedMaterialId;
        state.selectedFieldName = state.bundle.case.fieldEvidence?.[state.selectedFieldName]
            ? state.selectedFieldName
            : pickInitialFieldName();
        renderWorkspace();
        const listResult = await unwrap(api.creditListCases(), '无法刷新案件列表');
        state.cases = listResult.cases || [];
        renderCaseList();
        toast('助手已完成识别');
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(btn, false);
    }
}

async function updateSelectedFieldEvidence(status) {
    if (!state.selectedCaseId || !state.selectedFieldName) {
        toast('请先在字段核验台选择一个字段', 'error');
        return;
    }
    const input = $('fieldEvidenceValueInput');
    const evidence = state.bundle.case.fieldEvidence?.[state.selectedFieldName] || {};
    const value = (input?.value ?? evidence.value ?? '').trim();
    if (status === 'confirmed' && !value) {
        toast('确认字段前请先填写字段值', 'error');
        return;
    }

    const button = status === 'confirmed' ? $('confirmSelectedFieldBtn') : $('markManualFieldBtn');
    setBusy(button, true, status === 'confirmed' ? '确认中...' : '标记中...');
    try {
        await unwrap(api.creditUpdateFieldEvidence(state.selectedCaseId, state.selectedFieldName, {
            status,
            value,
            method: status === 'confirmed' ? 'human-confirmed' : 'manual-required',
        }), '更新字段状态失败');
        toast(status === 'confirmed' ? '字段已确认，可进入规则和报告' : '字段已标记为需人工补录');
        await refreshCurrentCase();
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

async function createCase(event) {
    event.preventDefault();
    const payload = {
        name: $('newCaseName').value.trim(),
        companyName: $('newCompanyName').value.trim(),
        loanAmount: $('newLoanAmount').value.trim(),
        loanPurpose: $('newLoanPurpose').value.trim(),
    };
    const result = await unwrap(api.creditCreateCase(payload), '创建案件失败');
    $('newCaseModal').classList.add('hidden');
    $('newCaseForm').reset();
    toast('案件已创建');
    await loadCases();
    await selectCase(result.case.id);
}

async function selectMaterials(event) {
    if (!state.selectedCaseId) return;
    const btn = event?.currentTarget || $('importMaterialsBtn');
    const fromAssistant = btn.id === 'assistantUploadBtn';
    setBusy(btn, true, '解析中...');
    try {
        const result = await unwrap(api.creditSelectMaterials(state.selectedCaseId), '上传材料失败');
        if (!result.canceled) {
            toast(`已上传 ${result.materials?.length || 0} 个材料`);
            if (fromAssistant) {
                await appendAssistantMessages({
                    role: 'user',
                    content: `发送了 ${result.materials?.length || 0} 个文件/图片用于识别。`,
                    meta: { action: 'upload_materials' },
                });
            }
            await refreshCurrentCase();
            if (result.materials?.[0]) {
                state.selectedMaterialId = result.materials[0].id;
                renderMaterials();
                renderExtractEditor();
            }
            if (fromAssistant) {
                await appendAssistantMessages({
                    role: 'assistant',
                    content: assistantUploadReply(result),
                    meta: { action: 'upload_materials_result' },
                });
            }
        }
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(btn, false);
    }
}

async function reextractMaterial() {
    if (!state.selectedCaseId || !state.selectedMaterialId) return;
    const btn = $('reextractMaterialBtn');
    setBusy(btn, true, '解析中...');
    try {
        await unwrap(api.creditExtractMaterial(state.selectedCaseId, state.selectedMaterialId), '重跑解析失败');
        toast('材料已重新解析');
        await refreshCurrentCase();
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(btn, false);
    }
}

async function updateMaterialType(materialId, materialType) {
    if (!state.selectedCaseId || !materialId || !materialType) return;
    if (!api.creditUpdateMaterialType) {
        toast('当前客户端缺少材料分类更新接口，请重启应用后再试', 'error');
        return;
    }
    const previousMaterialId = state.selectedMaterialId;
    try {
        const result = await unwrap(api.creditUpdateMaterialType(state.selectedCaseId, materialId, materialType), '更新材料分类失败');
        state.bundle = result.bundle || state.bundle;
        state.selectedMaterialId = materialId || previousMaterialId;
        state.selectedFieldName = state.bundle.case.fieldEvidence?.[state.selectedFieldName]
            ? state.selectedFieldName
            : pickInitialFieldName();
        renderWorkspace();
        const listResult = await unwrap(api.creditListCases(), '无法刷新案件列表');
        state.cases = listResult.cases || [];
        renderCaseList();
        toast('材料分类已更新，并已按新分类重跑解析');
    } catch (error) {
        toast(error.message, 'error');
        await refreshCurrentCase();
    }
}

async function runRules() {
    if (!state.selectedCaseId) return;
    const btn = $('runRulesBtn');
    setBusy(btn, true, '规则运行中...');
    try {
        const result = await unwrap(api.creditRunRules(state.selectedCaseId), '运行规则失败');
        state.bundle.ruleResults = result.ruleResults;
        renderRules();
        toast('规则运行完成');
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(btn, false);
    }
}

async function generateReport() {
    if (!state.selectedCaseId) return;
    const btn = $('generateReportBtn');
    setBusy(btn, true, '生成中...');
    try {
        const result = await unwrap(api.creditGenerateReport(state.selectedCaseId), '生成报告失败');
        state.selectedReportId = result.report.id;
        toast(result.report.warning ? '已生成模板兜底报告' : 'AI 报告已生成');
        await refreshCurrentCase();
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(btn, false);
    }
}

async function saveReport() {
    if (!state.selectedCaseId) return;
    const report = currentReport();
    const result = await unwrap(api.creditSaveReport(state.selectedCaseId, {
        id: report?.id,
        title: report?.title || '企业授信贷前调查报告初稿',
        content: $('reportEditor').value,
        source: report?.source || 'manual',
        warning: report?.warning || '',
        createdAt: report?.createdAt,
    }), '保存报告失败');
    state.selectedReportId = result.report.id;
    toast('报告已保存');
    await refreshCurrentCase();
}

async function exportReport(format) {
    if (!state.selectedCaseId) return;
    try {
        const result = await unwrap(api.creditExportReport(state.selectedCaseId, state.selectedReportId, format), '导出失败');
        if (!result.canceled) toast(`已导出：${result.filePath}`);
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function importExternalJson() {
    if (!state.selectedCaseId) return;
    try {
        const result = await unwrap(api.creditImportExternalJson(state.selectedCaseId), '导入外部数据失败');
        if (!result.canceled) toast('外部数据 JSON 已导入');
        await refreshCurrentCase();
    } catch (error) {
        toast(error.message, 'error');
    }
}

function openNewCaseModal() {
    $('newCaseModal').classList.remove('hidden');
    $('newCaseName').focus();
}

function bindEvents() {
    setupCreditFormControls();
    ensureChoiceControls();
    updateGuaranteeFieldVisibility();
    $('minimizeBtn').addEventListener('click', () => api.minimizeWindow?.());
    $('maximizeBtn').addEventListener('click', () => api.maximizeWindow?.());
    $('closeBtn').addEventListener('click', () => api.closeWindow?.());
    $('newCaseBtn').addEventListener('click', openNewCaseModal);
    $('emptyNewCaseBtn').addEventListener('click', openNewCaseModal);
    $('cancelNewCaseBtn').addEventListener('click', () => $('newCaseModal').classList.add('hidden'));
    $('newCaseModal').addEventListener('click', (event) => {
        if (event.target === $('newCaseModal')) $('newCaseModal').classList.add('hidden');
    });
    $('newCaseForm').addEventListener('submit', createCase);
    $('refreshCasesBtn').addEventListener('click', () => loadCases().catch(error => toast(error.message, 'error')));
    $('caseSearch').addEventListener('input', renderCaseList);
    document.addEventListener('input', (event) => {
        const field = event.target?.dataset?.field;
        if (!field) return;
        if (field === 'guaranteeMethod' || field === 'comboGuaranteeItems') {
            updateGuaranteeFieldVisibility();
        }
    });
    document.addEventListener('click', (event) => {
        const button = event.target.closest('.choice-btn[data-choice-value]');
        if (button) {
            const group = button.closest('.choice-group');
            if (!group) return;
            event.preventDefault();
            applyChoiceValue(group.dataset.choiceKind, group.dataset.choiceKey, button.dataset.choiceValue || '');
            return;
        }

        const control = event.target.closest('input, textarea');
        if (openChoiceMenuForControl(control)) return;

        closeChoiceMenus();
    });
    document.addEventListener('focusin', (event) => {
        if (event.target.matches?.('input, textarea')) {
            openChoiceMenuForControl(event.target);
        }
    });
    $('caseList').addEventListener('click', (event) => {
        const card = event.target.closest('[data-case-id]');
        if (card) selectCase(card.dataset.caseId).catch(error => toast(error.message, 'error'));
    });
    $('materialList').addEventListener('click', (event) => {
        if (event.target.closest('[data-material-type-id]')) return;
        const item = event.target.closest('[data-material-id]');
        if (!item) return;
        state.selectedMaterialId = item.dataset.materialId;
        renderMaterials();
        renderExtractEditor();
    });
    $('materialList').addEventListener('change', (event) => {
        const select = event.target.closest('[data-material-type-id]');
        if (!select) return;
        updateMaterialType(select.dataset.materialTypeId, select.value).catch(error => toast(error.message, 'error'));
    });
    $('fieldBoard').addEventListener('click', (event) => {
        const card = event.target.closest('[data-field-name]');
        if (!card) return;
        state.selectedFieldName = card.dataset.fieldName;
        renderFieldBoard();
        renderEvidencePanel();
    });
    $('saveCaseBtn').addEventListener('click', () => saveCase().catch(error => toast(error.message, 'error')));
    $('caseNameInput').addEventListener('change', () => saveCase().catch(error => toast(error.message, 'error')));
    $('caseStatusInput').addEventListener('change', () => saveCase().catch(error => toast(error.message, 'error')));
    $('saveExternalBtn').addEventListener('click', () => saveExternal().catch(error => toast(error.message, 'error')));
    $('saveExtractBtn').addEventListener('click', () => saveExtract().catch(error => toast(error.message, 'error')));
    $('importMaterialsBtn').addEventListener('click', selectMaterials);
    $('quickUploadBtn').addEventListener('click', selectMaterials);
    $('assistantUploadBtn').addEventListener('click', selectMaterials);
    $('assistantSendBtn').addEventListener('click', () => sendAssistantMessage().catch(error => toast(error.message, 'error')));
    $('assistantInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            sendAssistantMessage().catch(error => toast(error.message, 'error'));
        }
    });
    $('confirmSelectedFieldBtn').addEventListener('click', () => updateSelectedFieldEvidence('confirmed'));
    $('markManualFieldBtn').addEventListener('click', () => updateSelectedFieldEvidence('manual_required'));
    $('reextractMaterialBtn').addEventListener('click', reextractMaterial);
    $('runRulesBtn').addEventListener('click', runRules);
    $('generateReportBtn').addEventListener('click', generateReport);
    $('saveReportBtn').addEventListener('click', () => saveReport().catch(error => toast(error.message, 'error')));
    $('exportMarkdownBtn').addEventListener('click', () => exportReport('markdown'));
    $('exportWordBtn').addEventListener('click', () => exportReport('word'));
    $('importExternalJsonBtn').addEventListener('click', importExternalJson);
    $('openDataFolderBtn').addEventListener('click', async () => {
        try {
            await unwrap(api.creditOpenDataFolder(), '打开数据目录失败');
        } catch (error) {
            toast(error.message, 'error');
        }
    });
    $('reportEditor').addEventListener('input', () => {
        $('reportPreview').innerHTML = renderMarkdown($('reportEditor').value);
    });
    $('reportSelect').addEventListener('change', () => {
        state.selectedReportId = $('reportSelect').value;
        renderReports();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    try {
        const settings = await api.loadSettings?.();
        if (settings?.currentThemeMode === 'light') document.body.classList.add('light-theme');
        api.onThemeUpdated?.((theme) => document.body.classList.toggle('light-theme', theme === 'light'));
    } catch (error) {
        console.warn('[Credit] Theme init skipped:', error);
    }
    try {
        await loadCases();
    } catch (error) {
        toast(error.message, 'error');
    }
});
