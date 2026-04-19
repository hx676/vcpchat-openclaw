// modules/ipc/creditHandlers.js
const { ipcMain, dialog, BrowserWindow, shell } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const fileManager = require('../fileManager');
const { resolveVcpApiKey } = require('../utils/vcpKeyResolver');

let ipcHandlersRegistered = false;

const DEFAULT_FIELDS = {
    companyName: '',
    unifiedSocialCreditCode: '',
    legalRepresentative: '',
    legalRepresentativeIdCard: '',
    legalRepresentativeBirthDate: '',
    legalRepresentativeAge: '',
    registeredAddress: '',
    establishedDate: '',
    registeredCapital: '',
    businessScope: '',
    industry: '',
    loanAmount: '',
    loanPurpose: '',
    loanTerm: '',
    guaranteeMethod: '',
    totalAssets: '',
    totalLiabilities: '',
    revenue: '',
    netProfit: '',
    financialSummary: '',
    cashflowSummary: '',
    contractsSummary: '',
    collateralSummary: '',
    externalRiskSummary: '',
    manualCreditPlan: '',
    manualInvestigationOpinion: '',
    manualRiskMitigation: '',
};

const DEFAULT_EXTERNAL = {
    businessStatus: '',
    judicialRisk: '',
    dishonestDebtor: '',
    enforcementInfo: '',
    administrativePenalty: '',
    creditSummary: '',
    relatedCompanies: '',
    publicOpinion: '',
    notes: '',
};

const MATERIAL_LABELS = {
    business_license: '营业执照/主体证明',
    financial_statement: '财务报表',
    bank_statement: '银行流水',
    contract_invoice: '合同/发票',
    collateral: '担保/抵押资料',
    external_query: '外部查询资料',
    image_document: '图片/扫描件',
    other: '其他材料',
};

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

Object.assign(DEFAULT_FIELDS, {
    primaryGuaranteeMethod: '',
    hasCoBorrower: '',
    hasGuarantor: '',
    guarantorInfo: '',
    collateralValuation: '',
    ltvRatio: '',
    ownershipStatus: '',
    mortgageInfo: '',
    pledgeInfo: '',
    pledgeValuation: '',
    pledgeRate: '',
    comboGuaranteeItems: '',
});

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

const FIELD_STATUS_LABELS = {
    pending: '待确认',
    confirmed: '已确认',
    conflict: '有冲突',
    manual_required: '需人工补录',
};

function nowIso() {
    return new Date().toISOString();
}

function id(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function safeName(name) {
    const parsed = path.parse(String(name || 'file'));
    const base = parsed.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'file';
    const ext = parsed.ext.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 12);
    return `${base}${ext}`;
}

function slash(value) {
    return String(value || '').replace(/\\/g, '/');
}

function text(value) {
    return String(value || '').trim();
}

function truncate(value, max = 12000) {
    const s = String(value || '');
    return s.length > max ? `${s.slice(0, max)}\n\n[内容已截断，完整文本保存在抽取文件中]` : s;
}

function stripCodexModelPrefix(model) {
    const value = String(model || '').trim();
    if (!value.toLowerCase().startsWith('openai-codex/')) return value;
    return value.slice('openai-codex/'.length).trim();
}

function shouldRetryWithStrippedCodexModel(status, rawBody, model) {
    if (status !== 400) return false;
    const current = String(model || '').trim();
    if (!current.toLowerCase().startsWith('openai-codex/')) return false;
    return String(rawBody || '').toLowerCase().includes('not supported when using codex with a chatgpt account');
}

function amountToNumber(value) {
    const s = String(value || '').replace(/[,，\s]/g, '');
    const match = s.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    if (!Number.isFinite(n)) return null;
    if (/亿/.test(s)) return n * 100000000;
    if (/万/.test(s)) return n * 10000;
    return n;
}

function hasRisk(value) {
    const s = text(value);
    return Boolean(s && !/^(无|暂无|没有|否|正常|未发现|未见异常|0|无记录|不涉及)$/i.test(s));
}

function snippetAroundKeyword(source, keywordPattern, maxLength = 180) {
    const s = String(source || '').replace(/\r/g, '\n').replace(/\s+/g, ' ');
    const match = s.match(keywordPattern);
    if (!match) return '';
    const index = Math.max(0, match.index || 0);
    return truncate(s.slice(Math.max(0, index - 45), Math.min(s.length, index + maxLength)), maxLength);
}

function inferRiskItem(compact, keywordPattern, nonePattern, fallbackRiskLabel) {
    const snippet = snippetAroundKeyword(compact, keywordPattern);
    if (!snippet) return '';
    if (nonePattern.test(snippet)) return '无记录';
    return snippet || fallbackRiskLabel;
}

function inferExternalData(rawText) {
    const compact = String(rawText || '').replace(/\r/g, '\n').replace(/\s+/g, ' ');
    const external = {};
    const businessStatus = firstMatch(compact, [
        /(?:工商状态|经营状态|登记状态|企业状态)\s*[:：]?\s*(存续|在业|开业|正常|经营异常|列入经营异常|注销|吊销|迁出)/,
        /状态\s*[:：]?\s*(存续|在业|开业|正常|经营异常|列入经营异常|注销|吊销|迁出)/,
    ]);
    if (businessStatus) external.businessStatus = businessStatus;

    const judicialRisk = inferRiskItem(
        compact,
        /(司法|诉讼|裁判文书|开庭公告|案件)/,
        /(无|暂无|未发现|未查询到|0\s*条|0\s*项|没有).{0,20}(司法|诉讼|案件|裁判|开庭)?/,
        '存在司法风险记录'
    );
    if (judicialRisk) external.judicialRisk = judicialRisk;

    const dishonestDebtor = inferRiskItem(
        compact,
        /(失信|失信被执行|老赖)/,
        /(无|暂无|未发现|未查询到|0\s*条|0\s*项|没有).{0,20}(失信)?/,
        '存在失信被执行记录'
    );
    if (dishonestDebtor) external.dishonestDebtor = dishonestDebtor;

    const enforcementInfo = inferRiskItem(
        compact,
        /(被执行|执行标的|执行信息|执行案件)/,
        /(无|暂无|未发现|未查询到|0\s*条|0\s*项|没有).{0,20}(被执行|执行)?/,
        '存在被执行信息'
    );
    if (enforcementInfo) external.enforcementInfo = enforcementInfo;

    const administrativePenalty = inferRiskItem(
        compact,
        /(行政处罚|处罚决定|市场监管处罚)/,
        /(无|暂无|未发现|未查询到|0\s*条|0\s*项|没有).{0,20}(行政处罚|处罚)?/,
        '存在行政处罚信息'
    );
    if (administrativePenalty) external.administrativePenalty = administrativePenalty;

    const creditSummary = inferRiskItem(
        compact,
        /(征信|逾期|不良|关注类|欠息|贷款余额|信用报告)/,
        /(无|暂无|未发现|未见|没有).{0,20}(逾期|不良|欠息)?/,
        '征信存在关注项，需人工核验'
    );
    if (creditSummary) external.creditSummary = creditSummary;

    const publicOpinion = inferRiskItem(
        compact,
        /(舆情|负面|投诉|曝光|风险提示)/,
        /(无|暂无|未发现|未见).{0,20}(负面|舆情|投诉)?/,
        '存在负面舆情或投诉信息'
    );
    if (publicOpinion) external.publicOpinion = publicOpinion;

    return external;
}

function firstMatch(source, patterns) {
    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    return '';
}

function isValidDateParts(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (year < 1900 || year > 2100) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeChineseIdCard(value) {
    return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function isValidChineseIdCard(idCard) {
    const id = normalizeChineseIdCard(idCard);
    if (/^[1-9]\d{14}$/.test(id)) {
        const year = Number(`19${id.slice(6, 8)}`);
        const month = Number(id.slice(8, 10));
        const day = Number(id.slice(10, 12));
        return isValidDateParts(year, month, day);
    }
    if (!/^[1-9]\d{16}[0-9X]$/.test(id)) return false;

    const year = Number(id.slice(6, 10));
    const month = Number(id.slice(10, 12));
    const day = Number(id.slice(12, 14));
    if (!isValidDateParts(year, month, day)) return false;

    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkMap = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
    const sum = id
        .slice(0, 17)
        .split('')
        .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    return checkMap[sum % 11] === id[17];
}

function birthDateFromChineseIdCard(idCard) {
    const id = normalizeChineseIdCard(idCard);
    if (!isValidChineseIdCard(id)) return '';

    if (id.length === 15) {
        const y = Number(`19${id.slice(6, 8)}`);
        const m = Number(id.slice(8, 10));
        const d = Number(id.slice(10, 12));
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    return `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
}

function ageFromBirthDate(dateText) {
    const raw = String(dateText || '').trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidDateParts(year, month, day)) return null;

    const now = new Date();
    let age = now.getFullYear() - year;
    const passedBirthday = (now.getMonth() + 1 > month) || ((now.getMonth() + 1 === month) && now.getDate() >= day);
    if (!passedBirthday) age -= 1;
    if (age < 0 || age > 120) return null;
    return age;
}

function extractChineseIdCard(source) {
    const textBody = String(source || '').replace(/\s+/g, '');
    const patterns = [
        /(?:法定代表人|法人代表|负责人|身份证号|公民身份号码|证件号码).{0,12}?([1-9]\d{16}[0-9Xx])/,
        /身份证(?:号码|号)?[:：]?\s*([1-9]\d{16}[0-9Xx])/i,
        /(?:法定代表人|法人代表|负责人|身份证号|公民身份号码|证件号码).{0,12}?([1-9]\d{14})/,
        /身份证(?:号码|号)?[:：]?\s*([1-9]\d{14})/i,
    ];
    for (const pattern of patterns) {
        const matched = firstMatch(textBody, [pattern]);
        if (!matched) continue;
        const normalized = normalizeChineseIdCard(matched);
        if (isValidChineseIdCard(normalized)) return normalized;
    }
    return '';
}

function inferMime(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
        case '.txt':
        case '.md':
            return 'text/plain';
        case '.csv':
            return 'text/csv';
        case '.json':
            return 'application/json';
        case '.pdf':
            return 'application/pdf';
        case '.docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case '.xls':
            return 'application/vnd.ms-excel';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.webp':
            return 'image/webp';
        case '.bmp':
            return 'image/bmp';
        default:
            return 'application/octet-stream';
    }
}

function inferMaterialType(fileName, content = '') {
    const hay = `${fileName || ''}\n${content || ''}`.toLowerCase();
    if (/营业执照|统一社会信用代码|主体资格|business\s*license/.test(hay)) return 'business_license';
    if (/资产负债表|利润表|现金流量表|财务报表|审计报告|financial|balance\s*sheet/.test(hay)) return 'financial_statement';
    if (/银行流水|账户流水|交易明细|对账单|bank\s*statement/.test(hay)) return 'bank_statement';
    if (/合同|订单|发票|采购|销售|invoice|contract/.test(hay)) return 'contract_invoice';
    if (/抵押|质押|担保|保证|房产|不动产|设备|collateral|mortgage|guarantee/.test(hay)) return 'collateral';
    if (/征信|工商|司法|企查查|天眼查|执行|失信|行政处罚|external|credit\s*report/.test(hay)) return 'external_query';
    if (/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(fileName || '')) return 'image_document';
    return 'other';
}

function resolveMaterialType(material, parsedText = '') {
    if (material?.manualMaterialType && MATERIAL_LABELS[material.materialType]) {
        return material.materialType;
    }
    const inferred = inferMaterialType(material?.originalName, parsedText);
    if (inferred && inferred !== 'other') return inferred;
    return material?.materialType || 'other';
}

function inferFields(rawText, materialType) {
    const compact = String(rawText || '').replace(/\r/g, '\n').replace(/\s+/g, ' ');
    const fields = {};
    const code = firstMatch(compact, [
        /统一社会信用代码\s*[:：]?\s*([0-9A-Z]{18})/i,
        /社会信用代码\s*[:：]?\s*([0-9A-Z]{18})/i,
        /\b([0-9A-Z]{18})\b/i,
    ]);
    if (code) fields.unifiedSocialCreditCode = code.toUpperCase();

    const company = firstMatch(compact, [
        /(?:名称|企业名称|公司名称|借款人|客户名称)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{4,60})/,
        /([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{4,60}(?:有限公司|有限责任公司|股份有限公司|集团有限公司|合作社))/,
    ]);
    if (company) fields.companyName = company.replace(/住所|类型|法定代表人.*$/g, '').trim();

    const legalRep = firstMatch(compact, [
        /法定代表人\s*[:：]?\s*([\u4e00-\u9fa5·]{2,8})/,
        /法人代表\s*[:：]?\s*([\u4e00-\u9fa5·]{2,8})/,
        /负责人\s*[:：]?\s*([\u4e00-\u9fa5·]{2,8})/,
    ]);
    if (legalRep) fields.legalRepresentative = legalRep;

    const legalRepIdCard = extractChineseIdCard(compact);
    if (legalRepIdCard) {
        fields.legalRepresentativeIdCard = legalRepIdCard;
        const derivedBirthDate = birthDateFromChineseIdCard(legalRepIdCard);
        if (derivedBirthDate) {
            fields.legalRepresentativeBirthDate = derivedBirthDate;
            const derivedAge = ageFromBirthDate(derivedBirthDate);
            if (Number.isInteger(derivedAge)) fields.legalRepresentativeAge = String(derivedAge);
        }
    }

    if (!fields.legalRepresentativeBirthDate) {
        const legalRepBirthDate = firstMatch(compact, [
            /(?:法定代表人|法人代表|负责人).{0,20}?(?:出生日期|生日)\s*[:：]?\s*([0-9]{4}[年\-/.][0-9]{1,2}[月\-/.][0-9]{1,2}日?)/,
            /(?:出生日期|生日)\s*[:：]?\s*([0-9]{4}[年\-/.][0-9]{1,2}[月\-/.][0-9]{1,2}日?)/,
        ]);
        if (legalRepBirthDate) {
            fields.legalRepresentativeBirthDate = legalRepBirthDate;
            const derivedAge = ageFromBirthDate(legalRepBirthDate);
            if (Number.isInteger(derivedAge)) fields.legalRepresentativeAge = String(derivedAge);
        }
    }

    if (!fields.legalRepresentativeAge) {
        const legalRepAge = firstMatch(compact, [
            /(?:法定代表人|法人代表|负责人).{0,20}?(?:年龄)\s*[:：]?\s*([1-9][0-9]?)/,
            /年龄\s*[:：]?\s*([1-9][0-9]?)/,
        ]);
        if (legalRepAge) fields.legalRepresentativeAge = legalRepAge;
    }

    const registeredAddress = firstMatch(compact, [
        /(?:住所|注册地址|经营场所)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9（）()·\-号室路街镇乡村区县市省]{6,90})/,
    ]);
    if (registeredAddress) fields.registeredAddress = registeredAddress;

    const establishedDate = firstMatch(compact, [
        /(?:成立日期|成立时间|注册日期)\s*[:：]?\s*([0-9]{4}[年\-/.][0-9]{1,2}[月\-/.][0-9]{1,2}日?)/,
    ]);
    if (establishedDate) fields.establishedDate = establishedDate;

    const registeredCapital = firstMatch(compact, [
        /(?:注册资本|注册资金)\s*[:：]?\s*([0-9,.，]+(?:万|万元|亿|亿元|元|人民币)?)/,
    ]);
    if (registeredCapital) fields.registeredCapital = registeredCapital;

    const businessScope = firstMatch(compact, [
        /经营范围\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9、，,；;。.\s]{10,220})/,
    ]);
    if (businessScope) fields.businessScope = businessScope.replace(/\s+/g, ' ');

    const industry = firstMatch(compact, [
        /所属行业\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9、，,]{2,40})/,
        /行业\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9、，,]{2,40})/,
    ]);
    if (industry) fields.industry = industry;

    const loanAmount = firstMatch(compact, [
        /(?:贷款|授信|融资)(?:金额|额度)?\s*[:：]?\s*([0-9,.，]+(?:万|万元|亿|亿元|元)?)/,
        /金额\s*[:：]?\s*([0-9,.，]+(?:万|万元|亿|亿元|元)?)/,
    ]);
    if (loanAmount) fields.loanAmount = loanAmount;

    const loanPurpose = firstMatch(compact, [
        /(?:贷款|授信|融资)?用途\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9、，,；;。.\s]{2,80})/,
        /用于\s*([\u4e00-\u9fa5A-Za-z0-9、，,；;。.\s]{2,80})/,
    ]);
    if (loanPurpose) fields.loanPurpose = loanPurpose.replace(/\s+/g, ' ');

    const loanTerm = firstMatch(compact, [
        /(?:贷款|授信|融资)?期限\s*[:：]?\s*([0-9一二三四五六七八九十]+(?:年|个月|月|天))/,
        /期限为\s*([0-9一二三四五六七八九十]+(?:年|个月|月|天))/,
    ]);
    if (loanTerm) fields.loanTerm = loanTerm;

    const guarantee = firstMatch(compact, [/担保方式\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9、，,]{2,60})/]);
    if (guarantee) fields.guaranteeMethod = guarantee;

    const totalAssets = firstMatch(compact, [/资产总额\s*[:：]?\s*([0-9,.，]+(?:万|万元|亿|亿元|元)?)/]);
    const totalLiabilities = firstMatch(compact, [/负债总额\s*[:：]?\s*([0-9,.，]+(?:万|万元|亿|亿元|元)?)/]);
    const revenue = firstMatch(compact, [/(?:营业收入|主营业务收入|销售收入)\s*[:：]?\s*([0-9,.，]+(?:万|万元|亿|亿元|元)?)/]);
    const profit = firstMatch(compact, [/(?:净利润|利润总额)\s*[:：]?\s*([0-9,.，]+(?:万|万元|亿|亿元|元)?)/]);
    if (totalAssets) fields.totalAssets = totalAssets;
    if (totalLiabilities) fields.totalLiabilities = totalLiabilities;
    if (revenue) fields.revenue = revenue;
    if (profit) fields.netProfit = profit;
    if (totalAssets || totalLiabilities || revenue || profit) {
        fields.financialMetrics = { totalAssets, totalLiabilities, revenue, profit };
        fields.financialSummary = [
            totalAssets && `资产总额 ${totalAssets}`,
            totalLiabilities && `负债总额 ${totalLiabilities}`,
            revenue && `营业收入 ${revenue}`,
            profit && `利润 ${profit}`,
        ].filter(Boolean).join('；');
    }
    if (materialType === 'bank_statement') fields.cashflowSummary = truncate(compact, 220);
    if (materialType === 'contract_invoice') fields.contractsSummary = truncate(compact, 220);
    if (materialType === 'collateral') fields.collateralSummary = truncate(compact, 220);
    if (materialType === 'external_query') fields.externalRiskSummary = truncate(compact, 220);
    return fields;
}

function mergeFields(current, detected) {
    const merged = { ...DEFAULT_FIELDS, ...(current || {}) };
    for (const key of Object.keys(DEFAULT_FIELDS)) {
        if (!text(merged[key]) && text(detected?.[key])) merged[key] = detected[key];
    }
    return merged;
}

function normalizeFieldEvidence(caseData) {
    const existing = caseData?.fieldEvidence && typeof caseData.fieldEvidence === 'object'
        ? caseData.fieldEvidence
        : {};
    const normalized = { ...existing };
    for (const [fieldName, value] of Object.entries(caseData?.fields || {})) {
        if (!text(value) || normalized[fieldName]) continue;
        normalized[fieldName] = {
            id: id('field'),
            fieldName,
            label: FIELD_META[fieldName]?.label || fieldName,
            group: FIELD_META[fieldName]?.group || '其他',
            value,
            status: 'confirmed',
            confidence: 1,
            method: 'manual',
            sources: [],
            evidenceText: '人工录入/历史字段',
            updatedAt: nowIso(),
        };
    }
    return normalized;
}

function evidenceSnippet(rawText, value) {
    const source = String(rawText || '').replace(/\r/g, '\n');
    const needle = text(value);
    if (!needle) return truncate(source, 300);
    const index = source.indexOf(needle);
    if (index === -1) return truncate(source, 300);
    return source.slice(Math.max(0, index - 90), Math.min(source.length, index + needle.length + 180)).trim();
}

function confidenceFor(fieldName, materialType, parser) {
    if (parser === 'legacy-xls-placeholder' || parser === 'unsupported') return 0.2;
    if (['companyName', 'unifiedSocialCreditCode', 'legalRepresentative', 'legalRepresentativeIdCard', 'legalRepresentativeBirthDate', 'legalRepresentativeAge'].includes(fieldName) && materialType === 'business_license') return 0.92;
    if (['totalAssets', 'totalLiabilities', 'revenue', 'netProfit'].includes(fieldName) && materialType === 'financial_statement') return 0.86;
    if (parser === 'tesseract.js') return 0.72;
    return 0.78;
}

function buildFieldEvidence(structuredFields, context) {
    const entries = [];
    for (const [fieldName, value] of Object.entries(structuredFields || {})) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_FIELDS, fieldName) || !text(value)) continue;
        entries.push({
            id: id('field'),
            fieldName,
            label: FIELD_META[fieldName]?.label || fieldName,
            group: FIELD_META[fieldName]?.group || '其他',
            value,
            status: 'pending',
            confidence: confidenceFor(fieldName, context.materialType, context.parser),
            method: context.parser || 'extractor',
            evidenceText: evidenceSnippet(context.rawText, value),
            sources: [{
                materialId: context.materialId,
                materialName: context.materialName,
                materialType: context.materialType,
                materialTypeLabel: MATERIAL_LABELS[context.materialType] || MATERIAL_LABELS.other,
                parser: context.parser || 'extractor',
            }],
            createdAt: nowIso(),
            updatedAt: nowIso(),
        });
    }
    return entries;
}

function mergeFieldEvidence(existingEvidence, newEntries) {
    const next = { ...(existingEvidence || {}) };
    for (const entry of newEntries) {
        const current = next[entry.fieldName];
        if (!current) {
            next[entry.fieldName] = entry;
            continue;
        }

        const currentSources = Array.isArray(current.sources) ? current.sources : [];
        if (!text(current.value)) {
            next[entry.fieldName] = {
                ...current,
                ...entry,
                id: current.id || entry.id,
                conflicts: current.conflicts || [],
                status: 'pending',
                updatedAt: nowIso(),
            };
            continue;
        }
        const isSameValue = text(current.value) === text(entry.value);
        const mergedSources = [
            ...currentSources,
            ...entry.sources.filter(source => !currentSources.some(item => item.materialId === source.materialId)),
        ];

        if (isSameValue) {
            next[entry.fieldName] = {
                ...current,
                confidence: Math.max(Number(current.confidence || 0), Number(entry.confidence || 0)),
                sources: mergedSources,
                evidenceText: current.evidenceText || entry.evidenceText,
                updatedAt: nowIso(),
            };
            continue;
        }

        const conflicts = Array.isArray(current.conflicts) ? current.conflicts : [];
        const entrySourceIds = (entry.sources || []).map(source => source.materialId).filter(Boolean);
        const hasSameConflict = conflicts.some(conflict => {
            if (text(conflict.value) !== text(entry.value)) return false;
            const conflictSourceIds = (conflict.sources || []).map(source => source.materialId).filter(Boolean);
            if (!entrySourceIds.length || !conflictSourceIds.length) return true;
            return entrySourceIds.some(sourceId => conflictSourceIds.includes(sourceId));
        });
        if (!hasSameConflict) {
            conflicts.push({
                value: entry.value,
                confidence: entry.confidence,
                evidenceText: entry.evidenceText,
                sources: entry.sources,
                createdAt: nowIso(),
            });
        }
        next[entry.fieldName] = {
            ...current,
            status: current.status === 'confirmed' ? 'conflict' : 'conflict',
            sources: mergedSources,
            conflicts,
            updatedAt: nowIso(),
        };
    }
    return next;
}

function removeMaterialEvidence(fieldEvidence, materialId) {
    if (!materialId) return fieldEvidence || {};
    const next = {};
    for (const [fieldName, entry] of Object.entries(fieldEvidence || {})) {
        const sources = Array.isArray(entry.sources) ? entry.sources : [];
        const conflicts = Array.isArray(entry.conflicts) ? entry.conflicts : [];
        const hadPrimarySource = sources.some(source => source.materialId === materialId);
        const remainingSources = sources.filter(source => source.materialId !== materialId);
        const remainingConflicts = conflicts.filter(conflict => {
            const conflictSources = Array.isArray(conflict.sources) ? conflict.sources : [];
            return !conflictSources.some(source => source.materialId === materialId);
        });

        if (hadPrimarySource && !remainingSources.length && entry.status !== 'confirmed') {
            const promoted = remainingConflicts[0];
            if (promoted) {
                next[fieldName] = {
                    ...entry,
                    value: promoted.value,
                    confidence: promoted.confidence,
                    evidenceText: promoted.evidenceText,
                    sources: promoted.sources || [],
                    conflicts: remainingConflicts.slice(1),
                    status: remainingConflicts.length > 1 ? 'conflict' : 'pending',
                    updatedAt: nowIso(),
                };
                continue;
            }
            continue;
        }

        next[fieldName] = {
            ...entry,
            sources: remainingSources,
            conflicts: remainingConflicts,
            status: entry.status === 'conflict' && !remainingConflicts.length && entry.status !== 'confirmed'
                ? 'pending'
                : entry.status,
            updatedAt: hadPrimarySource || conflicts.length !== remainingConflicts.length ? nowIso() : entry.updatedAt,
        };
    }
    return next;
}

function getFieldProgress(fieldEvidence) {
    const entries = Object.values(fieldEvidence || {});
    return {
        total: entries.length,
        confirmed: entries.filter(item => item.status === 'confirmed').length,
        pending: entries.filter(item => item.status === 'pending').length,
        conflict: entries.filter(item => item.status === 'conflict').length,
        manualRequired: entries.filter(item => item.status === 'manual_required').length,
    };
}

function getPendingFieldList(fieldEvidence) {
    return Object.values(fieldEvidence || {})
        .filter(item => item.status !== 'confirmed')
        .map(item => `${item.label || item.fieldName}（${FIELD_STATUS_LABELS[item.status] || item.status || '待处理'}）`);
}

function markFieldsAsManualConfirmed(fieldEvidence, fields) {
    const next = { ...(fieldEvidence || {}) };
    for (const [fieldName, value] of Object.entries(fields || {})) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_FIELDS, fieldName)) continue;
        if (!text(value)) {
            // 表单会提交所有字段。空值只代表“用户清空已确认字段”，不能覆盖 OCR 待确认/冲突证据。
            if (next[fieldName]?.status === 'confirmed' && text(next[fieldName]?.value)) {
                next[fieldName] = {
                    ...next[fieldName],
                    value: '',
                    status: 'manual_required',
                    confidence: 0,
                    method: 'manual',
                    evidenceText: '人工清空，需补录或重新确认。',
                    updatedAt: nowIso(),
                };
            }
            continue;
        }
        next[fieldName] = {
            ...(next[fieldName] || {}),
            id: next[fieldName]?.id || id('field'),
            fieldName,
            label: FIELD_META[fieldName]?.label || fieldName,
            group: FIELD_META[fieldName]?.group || '其他',
            value,
            status: 'confirmed',
            confidence: 1,
            method: next[fieldName]?.method || 'manual',
            sources: next[fieldName]?.sources || [],
            evidenceText: next[fieldName]?.evidenceText || '人工补录/人工确认字段。',
            updatedAt: nowIso(),
        };
    }
    return next;
}

function applyConfirmedFieldGate(caseData) {
    const fieldEvidence = normalizeFieldEvidence(caseData);
    const fields = { ...DEFAULT_FIELDS, ...(caseData.fields || {}) };
    for (const fieldName of Object.keys(DEFAULT_FIELDS)) {
        const evidence = fieldEvidence[fieldName];
        if (!evidence) continue;
        fields[fieldName] = evidence.status === 'confirmed' ? text(evidence.value) : '';
    }
    return { ...caseData, fields, fieldEvidence };
}

async function readJson(filePath, fallback) {
    try {
        if (await fs.pathExists(filePath)) return await fs.readJson(filePath);
    } catch (error) {
        console.error(`[Credit] Failed to read JSON ${filePath}:`, error);
    }
    return fallback;
}

async function writeJson(filePath, value) {
    await fs.ensureDir(path.dirname(filePath));
    const tempPath = `${filePath}.tmp`;
    await fs.writeJson(tempPath, value, { spaces: 2 });
    await fs.move(tempPath, filePath, { overwrite: true });
}

function createStore({ USER_DATA_DIR, APP_DATA_ROOT_IN_PROJECT, SETTINGS_FILE }) {
    const creditDir = path.join(USER_DATA_DIR, 'credit_cases');
    const projectRoot = path.dirname(APP_DATA_ROOT_IN_PROJECT);
    const indexPath = () => path.join(creditDir, 'cases.json');
    const caseDir = (caseId) => path.join(creditDir, caseId);
    const casePath = (caseId) => path.join(caseDir(caseId), 'case.json');
    const materialIndexPath = (caseId) => path.join(caseDir(caseId), 'materials.json');
    const externalPath = (caseId) => path.join(caseDir(caseId), 'external_queries.json');
    const rulePath = (caseId) => path.join(caseDir(caseId), 'rule_results.json');
    const auditPath = (caseId) => path.join(caseDir(caseId), 'audit_log.json');
    const assistantChatPath = (caseId) => path.join(caseDir(caseId), 'assistant_chat.json');
    const materialDir = (caseId) => path.join(caseDir(caseId), 'materials');
    const extractDir = (caseId) => path.join(caseDir(caseId), 'extracts');
    const reportDir = (caseId) => path.join(caseDir(caseId), 'reports');

    async function ensureStore() {
        await fs.ensureDir(creditDir);
        if (!await fs.pathExists(indexPath())) await writeJson(indexPath(), []);
    }

    async function listCases() {
        await ensureStore();
        const list = await readJson(indexPath(), []);
        return Array.isArray(list) ? list : [];
    }

    async function saveIndexItem(caseData) {
        const list = (await listCases()).filter(item => item.id !== caseData.id);
        const fieldProgress = getFieldProgress(caseData.fieldEvidence || {});
        list.unshift({
            id: caseData.id,
            name: caseData.name || caseData.fields?.companyName || '企业授信案件',
            status: caseData.status || 'draft',
            caseType: caseData.caseType || 'enterprise_credit',
            companyName: caseData.fields?.companyName || '',
            loanAmount: caseData.fields?.loanAmount || '',
            fieldProgress,
            activeReportId: caseData.activeReportId || null,
            createdAt: caseData.createdAt,
            updatedAt: caseData.updatedAt || nowIso(),
        });
        list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        await writeJson(indexPath(), list);
    }

    async function getCase(caseId) {
        const caseData = await readJson(casePath(caseId), null);
        if (!caseData) throw new Error(`案件不存在: ${caseId}`);
        const normalized = { ...caseData, fields: { ...DEFAULT_FIELDS, ...(caseData.fields || {}) } };
        return applyConfirmedFieldGate(normalized);
    }

    async function saveCase(caseData) {
        const gated = applyConfirmedFieldGate({
            ...caseData,
            fields: { ...DEFAULT_FIELDS, ...(caseData.fields || {}) },
        });
        const saved = {
            ...gated,
            updatedAt: nowIso(),
        };
        await writeJson(casePath(saved.id), saved);
        await saveIndexItem(saved);
        return saved;
    }

    async function audit(caseId, action, details = {}) {
        const list = await readJson(auditPath(caseId), []);
        const next = Array.isArray(list) ? list : [];
        next.unshift({ id: id('audit'), action, details, createdAt: nowIso() });
        await writeJson(auditPath(caseId), next.slice(0, 500));
    }

    async function getAssistantChat(caseId) {
        const list = await readJson(assistantChatPath(caseId), []);
        return Array.isArray(list) ? list : [];
    }

    async function appendAssistantChat(caseId, messages = []) {
        const current = await getAssistantChat(caseId);
        const normalized = (Array.isArray(messages) ? messages : [messages])
            .filter(item => item && text(item.content))
            .map(item => ({
                id: item.id || id('chat'),
                role: ['user', 'assistant', 'system'].includes(item.role) ? item.role : 'assistant',
                content: text(item.content),
                meta: item.meta || {},
                createdAt: item.createdAt || nowIso(),
            }));
        const next = [...current, ...normalized].slice(-200);
        await writeJson(assistantChatPath(caseId), next);
        return next;
    }

    async function getBundle(caseId) {
        const caseData = await getCase(caseId);
        const materials = await readJson(materialIndexPath(caseId), []);
        const externalData = { ...DEFAULT_EXTERNAL, ...(await readJson(externalPath(caseId), DEFAULT_EXTERNAL)) };
        const ruleResults = await readJson(rulePath(caseId), { generatedAt: null, rules: [], stats: { total: 0, high: 0, medium: 0, low: 0 } });
        const auditLog = await readJson(auditPath(caseId), []);
        const extracts = {};
        if (await fs.pathExists(extractDir(caseId))) {
            for (const file of (await fs.readdir(extractDir(caseId))).filter(item => item.endsWith('.json'))) {
                const extract = await readJson(path.join(extractDir(caseId), file), null);
                if (extract?.materialId) extracts[extract.materialId] = extract;
            }
        }
        const reports = [];
        if (await fs.pathExists(reportDir(caseId))) {
            for (const file of (await fs.readdir(reportDir(caseId))).filter(item => item.endsWith('.json'))) {
                const report = await readJson(path.join(reportDir(caseId), file), null);
                if (report) reports.push(report);
            }
        }
        reports.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
        return {
            case: caseData,
            materials,
            extracts,
            externalData,
            ruleResults,
            reports,
            auditLog,
            fieldProgress: getFieldProgress(caseData.fieldEvidence),
            pendingFields: getPendingFieldList(caseData.fieldEvidence),
        };
    }

    async function saveMaterials(caseId, materials) {
        await writeJson(materialIndexPath(caseId), materials);
        const caseData = await getCase(caseId);
        caseData.materialIds = materials.map(item => item.id);
        await saveCase(caseData);
    }

    async function extractTextFromFile(filePath, mimeType) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.json') {
            return { text: await fs.readFile(filePath, 'utf8'), parser: 'json-text', warnings: [] };
        }
        if (ext === '.xls') {
            return {
                text: '',
                parser: 'legacy-xls-placeholder',
                warnings: ['旧版 .xls 暂不支持自动解析，请另存为 .xlsx 或 CSV 后上传，或在抽取结果中手动补录。'],
            };
        }
        if (ext === '.pdf' || mimeType === 'application/pdf') {
            try {
                const pdf = require('pdf-parse');
                const data = await pdf(await fs.readFile(filePath));
                const extracted = data?.text || '';
                if (extracted.trim().length > 20) {
                    return { text: extracted, parser: 'pdf-parse', warnings: [] };
                }
            } catch (error) {
                console.warn('[Credit] pdf-parse failed, falling back to fileManager:', error.message);
            }
        }
        if (ext === '.xlsx' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            const rows = [];
            workbook.eachSheet((sheet) => {
                rows.push(`# ${sheet.name}`);
                sheet.eachRow((row) => {
                    rows.push(row.values.slice(1).map((value) => {
                        if (value === null || value === undefined) return '';
                        if (typeof value === 'object') return value.text || value.result || JSON.stringify(value);
                        return String(value);
                    }).join('\t'));
                });
            });
            return { text: rows.join('\n'), parser: 'exceljs', warnings: [] };
        }
        if (mimeType.startsWith('image/')) {
            try {
                const tesseract = require('tesseract.js');
                const result = await tesseract.recognize(filePath, 'chi_sim+eng');
                return { text: result?.data?.text || '', parser: 'tesseract.js', warnings: [] };
            } catch (error) {
                return { text: '', parser: 'image-placeholder', warnings: [`图片 OCR 暂未完成：${error.message}`] };
            }
        }
        const result = await fileManager.getTextContent(filePath, mimeType);
        if (result?.text) return { text: result.text, parser: 'fileManager', warnings: [] };
        if (Array.isArray(result?.imageFrames) && result.imageFrames.length) {
            return { text: '', parser: 'pdf-image-conversion', warnings: [`扫描 PDF 已转为 ${result.imageFrames.length} 页图片，请用 OCR/VLM 或人工校对补充文本。`] };
        }
        return { text: '', parser: 'unsupported', warnings: ['当前格式未能自动提取文本，可手动补录。'] };
    }

    function shouldTreatAssistantTextAsMaterial(message, fields) {
        if (Object.keys(fields || {}).length) return true;
        if (String(message || '').length > 120) return true;
        return /(营业执照|统一社会信用代码|法定代表人|身份证|证件|财报|资产负债表|利润表|银行流水|合同|发票|抵押|担保|工商|司法|征信|行政处罚|贷款|授信|OCR|截图)/i.test(message || '');
    }

    function assistantProgressReply(bundle, intro = '') {
        const progress = getFieldProgress(bundle.case.fieldEvidence);
        const pending = getPendingFieldList(bundle.case.fieldEvidence);
        const materials = bundle.materials || [];
        const materialTypes = new Set(materials.map(item => item.materialType));
        const missingMaterials = [
            !materialTypes.has('business_license') && '营业执照/主体证明',
            !materialTypes.has('financial_statement') && '财报/审计报告',
            !materialTypes.has('bank_statement') && '银行流水',
            !materialTypes.has('contract_invoice') && '合同/发票/订单',
            !materialTypes.has('collateral') && '担保/抵押材料',
            !materialTypes.has('external_query') && '工商/司法/征信查询截图',
        ].filter(Boolean);
        return [
            intro,
            `当前案件已有 ${materials.length} 份材料，字段核验进度：已确认 ${progress.confirmed || 0}，待确认 ${progress.pending || 0}，冲突 ${progress.conflict || 0}，需人工补录 ${progress.manualRequired || 0}。`,
            pending.length ? `待处理字段：${pending.slice(0, 8).join('、')}${pending.length > 8 ? ' 等。' : '。'}` : '暂时没有待处理字段。',
            missingMaterials.length ? `建议继续补充：${missingMaterials.join('、')}。` : '核心材料类型已经比较完整，可以开始核验字段、运行规则并生成报告。',
        ].filter(Boolean).join('\n\n');
    }

    async function createAssistantTextMaterial(caseId, message, structuredFields, materialType) {
        const materialId = id('chatmat');
        const originalName = `AI对话文本_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        await fs.ensureDir(materialDir(caseId));
        const targetPath = path.join(materialDir(caseId), `${materialId}_${safeName(originalName)}`);
        await fs.writeFile(targetPath, message, 'utf8');
        const stat = await fs.stat(targetPath);
        const materials = await readJson(materialIndexPath(caseId), []);
        const material = {
            id: materialId,
            originalName,
            storedFileName: path.basename(targetPath),
            relativePath: slash(path.relative(caseDir(caseId), targetPath)),
            sourcePath: targetPath,
            mimeType: 'text/plain',
            size: stat.size,
            materialType,
            materialTypeLabel: MATERIAL_LABELS[materialType] || MATERIAL_LABELS.other,
            extractStatus: Object.keys(structuredFields || {}).length ? 'parsed' : 'manual_required',
            parser: 'assistant-text',
            warningCount: Object.keys(structuredFields || {}).length ? 0 : 1,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        materials.push(material);
        await writeJson(materialIndexPath(caseId), materials);

        const extract = {
            id: id('extract'),
            caseId,
            materialId,
            materialName: material.originalName,
            materialType,
            materialTypeLabel: material.materialTypeLabel,
            status: material.extractStatus,
            parser: 'assistant-text',
            extractedText: message,
            textPreview: truncate(message, 600),
            structuredFields,
            warnings: Object.keys(structuredFields || {}).length ? [] : ['对话文本已保存为材料，但未识别到明确授信字段，请在抽取结果中人工校对。'],
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        await writeJson(path.join(extractDir(caseId), `${materialId}.json`), extract);

        const caseData = await getCase(caseId);
        const entries = buildFieldEvidence(structuredFields, {
            materialId,
            materialName: material.originalName,
            materialType,
            parser: 'assistant-text',
            rawText: message,
        });
        caseData.fieldEvidence = mergeFieldEvidence(caseData.fieldEvidence, entries);
        await saveCase(caseData);
        await audit(caseId, 'assistant_text_material', { materialId, fieldCount: entries.length });
        return { material, extract, entries };
    }

    async function handleAssistantMessage(caseId, message) {
        const cleanMessage = text(message);
        if (!cleanMessage) throw new Error('消息不能为空');
        await appendAssistantChat(caseId, { role: 'user', content: cleanMessage });

        const materialType = inferMaterialType('AI对话文本.txt', cleanMessage);
        const structuredFields = inferFields(cleanMessage, materialType);
        let intro = '';
        if (shouldTreatAssistantTextAsMaterial(cleanMessage, structuredFields)) {
            const result = await createAssistantTextMaterial(caseId, cleanMessage, structuredFields, materialType);
            if (result.entries.length) {
                const fields = result.entries.map(item => `${item.label || item.fieldName}：${item.value}`).join('；');
                intro = `已把这段内容保存为“${result.material.originalName}”，并识别出 ${result.entries.length} 个字段，已放入字段核验台待确认：${fields}。`;
            } else {
                intro = `已把这段内容保存为“${result.material.originalName}”，但没有识别到明确字段。你可以在“抽取结果校对”里补录结构化字段。`;
            }
        } else {
            intro = '我看了一下当前案件状态，可以先按下面这个清单推进。';
        }

        const bundle = await getBundle(caseId);
        const assistantContent = assistantProgressReply(bundle, intro);
        const chat = await appendAssistantChat(caseId, { role: 'assistant', content: assistantContent });
        return { chat, bundle, reply: assistantContent };
    }

    async function extractMaterial(caseId, materialId) {
        const materials = await readJson(materialIndexPath(caseId), []);
        const index = materials.findIndex(item => item.id === materialId);
        if (index === -1) throw new Error('材料不存在');
        materials[index] = { ...materials[index], extractStatus: 'running', updatedAt: nowIso() };
        await writeJson(materialIndexPath(caseId), materials);
        const material = materials[index];
        try {
            const filePath = path.join(caseDir(caseId), material.relativePath);
            const parsed = await extractTextFromFile(filePath, material.mimeType || inferMime(filePath));
            const materialType = resolveMaterialType(material, parsed.text);
            const structuredFields = inferFields(parsed.text, materialType);
            const externalPatch = materialType === 'external_query' ? inferExternalData(parsed.text) : {};
            const externalKeys = Object.keys(externalPatch).filter(key => text(externalPatch[key]));
            if (externalKeys.length) await mergeExternalDataFromMaterial(caseId, externalPatch);
            const extract = {
                id: id('extract'),
                caseId,
                materialId,
                materialName: material.originalName,
                materialType,
                materialTypeLabel: MATERIAL_LABELS[materialType] || MATERIAL_LABELS.other,
                status: parsed.text ? 'parsed' : 'manual_required',
                parser: parsed.parser,
                extractedText: parsed.text,
                textPreview: truncate(parsed.text, 600),
                structuredFields,
                warnings: [
                    ...(parsed.warnings || []),
                    ...(externalKeys.length ? [`已从外部查询材料自动归类：${externalKeys.join('、')}，请在“外部核验材料”区复核。`] : []),
                ],
                createdAt: nowIso(),
                updatedAt: nowIso(),
            };
            await writeJson(path.join(extractDir(caseId), `${materialId}.json`), extract);
            const refreshed = await readJson(materialIndexPath(caseId), []);
            const refreshedIndex = refreshed.findIndex(item => item.id === materialId);
            if (refreshedIndex !== -1) {
                refreshed[refreshedIndex] = {
                    ...refreshed[refreshedIndex],
                    materialType,
                    materialTypeLabel: extract.materialTypeLabel,
                    extractStatus: extract.status,
                    parser: parsed.parser,
                    warningCount: extract.warnings.length,
                    updatedAt: nowIso(),
                };
                await writeJson(materialIndexPath(caseId), refreshed);
            }
            const caseData = await getCase(caseId);
            const fieldEvidence = buildFieldEvidence(structuredFields, {
                materialId,
                materialName: material.originalName,
                materialType,
                parser: parsed.parser,
                rawText: parsed.text,
            });
            caseData.fieldEvidence = mergeFieldEvidence(removeMaterialEvidence(caseData.fieldEvidence, materialId), fieldEvidence);
            await saveCase(caseData);
            await audit(caseId, 'extract_material', { materialId, status: extract.status, fieldCount: fieldEvidence.length });
            return extract;
        } catch (error) {
            const failed = await readJson(materialIndexPath(caseId), []);
            const failedIndex = failed.findIndex(item => item.id === materialId);
            if (failedIndex !== -1) {
                failed[failedIndex] = { ...failed[failedIndex], extractStatus: 'failed', error: error.message, updatedAt: nowIso() };
                await writeJson(materialIndexPath(caseId), failed);
            }
            await audit(caseId, 'extract_material_failed', { materialId, error: error.message });
            throw error;
        }
    }

    async function updateMaterialType(caseId, materialId, materialType, options = {}) {
        if (!MATERIAL_LABELS[materialType]) throw new Error(`不支持的材料分类: ${materialType}`);
        const materials = await readJson(materialIndexPath(caseId), []);
        const index = materials.findIndex(item => item.id === materialId);
        if (index === -1) throw new Error('材料不存在');
        materials[index] = {
            ...materials[index],
            materialType,
            materialTypeLabel: MATERIAL_LABELS[materialType],
            manualMaterialType: true,
            updatedAt: nowIso(),
        };
        await writeJson(materialIndexPath(caseId), materials);

        const extractPath = path.join(extractDir(caseId), `${materialId}.json`);
        const extract = await readJson(extractPath, null);
        if (extract) {
            await writeJson(extractPath, {
                ...extract,
                materialType,
                materialTypeLabel: MATERIAL_LABELS[materialType],
                updatedAt: nowIso(),
            });
        }
        await audit(caseId, 'update_material_type', { materialId, materialType });

        if (options.reextract !== false) {
            return { material: materials[index], extract: await extractMaterial(caseId, materialId) };
        }
        return { material: materials[index], extract };
    }

    async function mergeExternalDataFromMaterial(caseId, patch) {
        const entries = Object.entries(patch || {}).filter(([, value]) => text(value));
        if (!entries.length) return { merged: false, externalData: await readJson(externalPath(caseId), DEFAULT_EXTERNAL) };
        const current = { ...DEFAULT_EXTERNAL, ...(await readJson(externalPath(caseId), DEFAULT_EXTERNAL)) };
        let changed = false;
        for (const [key, value] of entries) {
            if (!Object.prototype.hasOwnProperty.call(DEFAULT_EXTERNAL, key)) continue;
            if (!text(current[key]) || current[key] === '无' || current[key] === '无记录') {
                current[key] = value;
                changed = true;
            }
        }
        if (changed) {
            await writeJson(externalPath(caseId), current);
            await audit(caseId, 'merge_external_from_material', { keys: entries.map(([key]) => key) });
        }
        return { merged: changed, externalData: current };
    }

    async function saveExternal(caseId, data) {
        const externalData = { ...DEFAULT_EXTERNAL, ...(data || {}) };
        await writeJson(externalPath(caseId), externalData);
        const caseData = await getCase(caseId);
        caseData.fields.externalRiskSummary = [
            externalData.businessStatus && `工商状态：${externalData.businessStatus}`,
            hasRisk(externalData.judicialRisk) && `司法风险：${externalData.judicialRisk}`,
            hasRisk(externalData.dishonestDebtor) && `失信记录：${externalData.dishonestDebtor}`,
            hasRisk(externalData.enforcementInfo) && `执行信息：${externalData.enforcementInfo}`,
            hasRisk(externalData.administrativePenalty) && `行政处罚：${externalData.administrativePenalty}`,
        ].filter(Boolean).join('；');
        if (caseData.fields.externalRiskSummary) {
            caseData.fieldEvidence = {
                ...(caseData.fieldEvidence || {}),
                externalRiskSummary: {
                id: id('field'),
                fieldName: 'externalRiskSummary',
                label: FIELD_META.externalRiskSummary.label,
                group: FIELD_META.externalRiskSummary.group,
                value: caseData.fields.externalRiskSummary,
                status: 'confirmed',
                confidence: 1,
                method: 'manual-external',
                sources: [],
                evidenceText: '外部核验材料由用户人工录入或 JSON 导入。',
                createdAt: nowIso(),
                updatedAt: nowIso(),
                },
            };
        }
        await saveCase(caseData);
        await audit(caseId, 'save_external_data');
        return externalData;
    }

    async function runRules(caseId) {
        const bundle = await getBundle(caseId);
        const fields = { ...DEFAULT_FIELDS, ...(bundle.case.fields || {}) };
        const materialTypes = new Set(bundle.materials.map(item => item.materialType));
        const rules = [];
        const add = (severity, category, title, description, evidence, recommendation, source = '系统规则') => {
            rules.push({ id: id('rule'), severity, category, title, description, evidence, recommendation, source });
        };

        if (!fields.companyName) add('high', '资料完整性', '缺少企业名称', '案件基础信息中尚未形成明确企业名称。', '企业名称为空', '补充营业执照或手工录入企业名称。');
        if (!fields.unifiedSocialCreditCode) add('medium', '资料完整性', '缺少统一社会信用代码', '主体识别字段不足，外部核验和关联识别会受影响。', '统一社会信用代码为空', '补充营业执照或主体资格证明。');
        if (!fields.loanAmount) add('medium', '授信要素', '缺少授信金额', '尚未录入或抽取到本次申请授信金额。', '贷款金额为空', '补充申请金额。');
        if (!fields.loanPurpose) add('medium', '授信用途', '缺少贷款用途', '贷款用途不清晰会影响授信合理性判断。', '贷款用途为空', '补充用途说明、合同、订单或发票。');
        if (!materialTypes.has('business_license')) add('high', '资料完整性', '缺少营业执照/主体证明', '未发现营业执照或主体资格材料。', '材料类型未包含营业执照/主体证明', '上传营业执照或等效主体证明。');
        if (!materialTypes.has('financial_statement')) add('medium', '资料完整性', '缺少财务报表', '未发现财务报表或审计报告材料。', '材料类型未包含财务报表', '上传近一年或近三年财务报表。');
        if (!materialTypes.has('bank_statement')) add('low', '经营核验', '未见银行流水材料', '无法通过流水辅助验证经营规模和现金流。', '材料类型未包含银行流水', '上传主要结算账户流水或补充说明。');

        const external = bundle.externalData;
        if (external.businessStatus && !/正常|存续|在业|开业/i.test(external.businessStatus)) add('high', '外部数据', '工商状态异常', '工商状态不是正常经营状态。', `工商状态：${external.businessStatus}`, '人工核验工商状态并确认是否满足准入。', '外部数据');
        if (hasRisk(external.dishonestDebtor)) add('high', '外部数据', '存在失信相关信息', '录入了失信被执行或类似风险描述。', external.dishonestDebtor, '复核失信主体、金额、时间和是否已解除。', '外部数据');
        if (hasRisk(external.enforcementInfo)) add('high', '外部数据', '存在被执行信息', '录入了被执行信息。', external.enforcementInfo, '核查执行标的、案由、当前状态及对偿债能力影响。', '外部数据');
        if (hasRisk(external.judicialRisk)) add('medium', '外部数据', '存在司法风险记录', '录入了司法诉讼或风险事项。', external.judicialRisk, '核查司法事项与主营业务、资产负债、还款能力的关联。', '外部数据');
        if (hasRisk(external.administrativePenalty)) add('medium', '外部数据', '存在行政处罚信息', '录入了行政处罚。', external.administrativePenalty, '确认处罚性质、整改情况和后续经营影响。', '外部数据');

        const legalRepEvidence = bundle.case.fieldEvidence?.legalRepresentative;
        if (legalRepEvidence?.status === 'conflict') {
            const legalReps = [
                legalRepEvidence.value,
                ...(legalRepEvidence.conflicts || []).map(item => item.value),
            ].filter(Boolean);
            add('medium', '一致性校验', '法定代表人信息不一致', '不同材料中抽取到的法定代表人不完全一致。', `抽取结果：${[...new Set(legalReps)].join('、')}`, '以营业执照和最新工商信息为准人工复核。');
        }

        const assets = amountToNumber(fields.totalAssets);
        const liabilities = amountToNumber(fields.totalLiabilities);
        if (assets && liabilities && assets > 0 && liabilities / assets > 0.7) {
            add('medium', '财务指标', '资产负债率偏高', `粗略测算资产负债率约 ${((liabilities / assets) * 100).toFixed(1)}%。`, fields.financialSummary || '财务抽取结果', '结合行业水平、现金流和担保措施进一步分析。');
        }
        if (/抵押|质押/i.test(fields.guaranteeMethod || '') && !fields.collateralSummary && !materialTypes.has('collateral')) add('medium', '担保核验', '抵质押信息不完整', '担保方式涉及抵押/质押，但未见抵押物摘要或材料。', `担保方式：${fields.guaranteeMethod}`, '补充权属证明、评估报告、抵质押登记材料。');
        if (fields.loanPurpose && !materialTypes.has('contract_invoice')) add('low', '用途核验', '贷款用途佐证材料不足', '已填写贷款用途，但未见合同/发票/订单等佐证材料。', `贷款用途：${fields.loanPurpose}`, '上传合同、订单、发票或采购计划。');

        const pendingFields = getPendingFieldList(bundle.case.fieldEvidence);
        if (pendingFields.length) {
            add('low', '字段确认', '存在未确认识别字段', '自动识别字段尚未全部人工确认，未确认字段不会进入报告正文。', pendingFields.slice(0, 8).join('、'), '请在字段核验台确认、修正或标记人工补录。');
        }

        const finalStats = {
            total: rules.length,
            high: rules.filter(rule => rule.severity === 'high').length,
            medium: rules.filter(rule => rule.severity === 'medium').length,
            low: rules.filter(rule => rule.severity === 'low').length,
        };
        const payload = { generatedAt: nowIso(), rules, stats: finalStats };
        await writeJson(rulePath(caseId), payload);
        await audit(caseId, 'run_rules', finalStats);
        return payload;
    }

    function localReport(bundle) {
        const fields = { ...DEFAULT_FIELDS, ...(bundle.case.fields || {}) };
        const rules = Array.isArray(bundle.ruleResults?.rules) ? bundle.ruleResults.rules : [];
        const stats = bundle.ruleResults?.stats || { high: 0, medium: 0, low: 0 };
        const materials = bundle.materials.length
            ? bundle.materials.map(item => `- ${item.originalName}：${item.materialTypeLabel || MATERIAL_LABELS[item.materialType] || '其他'}，解析状态 ${item.extractStatus || 'pending'}`).join('\n')
            : '- 尚未上传材料';
        const ruleText = rules.length
            ? rules.map(rule => `- [${rule.severity.toUpperCase()}] ${rule.title}：${rule.description} 证据：${rule.evidence || '无'} 建议：${rule.recommendation || '人工复核'}`).join('\n')
            : '- 暂未命中风险规则。';
        const external = bundle.externalData;
        const pendingFields = getPendingFieldList(bundle.case.fieldEvidence);
        const pendingText = pendingFields.length
            ? pendingFields.map(item => `- ${item}`).join('\n')
            : '- 暂无未确认字段。';
        return `# 企业授信贷前调查报告初稿

> 本报告由 VCPChat 授信工作台生成，仅作为贷前调查辅助材料。最终授信结论必须由人工复核和审批流程确认。
> 报告正文仅使用已确认字段；未确认 OCR/解析结果列入“待补充清单”。

## 一、客户基本情况

- 企业名称：${fields.companyName || '待补充'}
- 统一社会信用代码：${fields.unifiedSocialCreditCode || '待补充'}
- 法定代表人：${fields.legalRepresentative || '待补充'}
- 法定代表人身份证号：${fields.legalRepresentativeIdCard || '待补充'}
- 法定代表人出生日期：${fields.legalRepresentativeBirthDate || '待补充'}
- 法定代表人年龄：${fields.legalRepresentativeAge || '待补充'}
- 注册地址：${fields.registeredAddress || '待补充'}
- 注册资本：${fields.registeredCapital || '待补充'}
- 成立日期：${fields.establishedDate || '待补充'}
- 所属行业：${fields.industry || '待补充'}

## 二、授信申请要素

- 申请金额：${fields.loanAmount || '待补充'}
- 贷款用途：${fields.loanPurpose || '待补充'}
- 授信期限：${fields.loanTerm || '待补充'}
- 担保方式：${fields.guaranteeMethod || '待补充'}

## 三、资料采集与解析情况

${materials}

## 四、经营与财务分析

- 资产总额：${fields.totalAssets || '待补充'}
- 负债总额：${fields.totalLiabilities || '待补充'}
- 营业收入：${fields.revenue || '待补充'}
- 净利润：${fields.netProfit || '待补充'}

${fields.financialSummary || '尚未形成财务摘要。建议补充资产负债表、利润表、现金流量表或审计报告，并在字段核验台确认。'}

## 五、银行流水与交易核验

${fields.cashflowSummary || '尚未形成银行流水摘要。建议补充主要结算账户流水并核验经营回款。'}

## 六、贷款用途佐证

${fields.contractsSummary || '尚未形成合同/发票/订单摘要。建议补充用途相关佐证材料。'}

## 七、担保与资产核验

${fields.collateralSummary || '尚未形成担保或抵押物摘要。若采用抵质押担保，应补充权属证明、评估和登记材料。'}

## 八、外部数据与风险信息

- 工商状态：${external.businessStatus || '待补充'}
- 司法风险：${external.judicialRisk || '无/待补充'}
- 失信被执行：${external.dishonestDebtor || '无/待补充'}
- 被执行信息：${external.enforcementInfo || '无/待补充'}
- 行政处罚：${external.administrativePenalty || '无/待补充'}
- 征信摘要：${external.creditSummary || '待补充'}
- 关联企业：${external.relatedCompanies || '待补充'}
- 舆情备注：${external.publicOpinion || '待补充'}

## 九、规则命中与风险提示

${ruleText}

## 十、综合调查意见

当前系统识别高风险 ${stats.high || 0} 项、中风险 ${stats.medium || 0} 项、低风险 ${stats.low || 0} 项。建议客户经理结合原始材料、外部核验结果、现场调查情况和行内制度进行人工复核。

- 本次授信方案：${fields.manualCreditPlan || '待人工补录'}
- 最终调查意见：${fields.manualInvestigationOpinion || '待人工补录'}
- 风险缓释措施：${fields.manualRiskMitigation || '待人工补录'}

## 十一、后续补充清单

${pendingText}

- 核对企业主体信息、法定代表人和统一社会信用代码是否与最新工商信息一致。
- 补充缺失的财务、流水、用途和担保资料。
- 对所有高风险和中风险命中项逐项形成调查说明。
- 本报告定稿前应由经办人员、复核人员和审批人员确认。
`;
    }

    function vcpMessages(bundle) {
        const compact = {
            case: {
                ...bundle.case,
                confirmedFields: bundle.case.fields,
                fieldEvidence: bundle.case.fieldEvidence,
            },
            externalData: bundle.externalData,
            materials: bundle.materials,
            ruleResults: bundle.ruleResults,
            pendingFields: getPendingFieldList(bundle.case.fieldEvidence),
            extracts: Object.values(bundle.extracts || {}).map(item => ({
                materialName: item.materialName,
                materialType: item.materialTypeLabel,
                status: item.status,
                structuredFields: item.structuredFields,
                warnings: item.warnings,
                textPreview: truncate(item.extractedText, 1800),
            })),
        };
        return [
            {
                role: 'system',
                content: [
                    '你是银行贷前调查报告辅助撰写助手。',
                    '只能基于 JSON 中 case.confirmedFields 和已确认外部数据撰写企业授信调查报告初稿。',
                    'fieldEvidence 中 status 不是 confirmed 的字段不得写入报告正文，只能列入待补充清单。',
                    '不得编造外部查询结果、征信结论、审批结论或最终授信决定。',
                    '数据缺失时写“待补充”或“需人工复核”。',
                    '输出 Markdown，章节包含客户基本情况、授信申请要素、资料解析、经营财务、流水核验、用途佐证、担保资产、外部风险、规则命中、综合风险提示、后续补充清单。',
                ].join('\n'),
            },
            { role: 'user', content: `请根据以下企业授信贷前调查案件数据生成报告初稿：\n\n${JSON.stringify(compact, null, 2)}` },
        ];
    }

    async function requestVcpReport(bundle) {
        const settings = await readJson(SETTINGS_FILE, {});
        if (!settings.vcpServerUrl) throw new Error('未配置 VCP 服务地址');
        let finalUrl = settings.vcpServerUrl;
        if (settings.enableVcpToolInjection === true) {
            const url = new URL(finalUrl);
            url.pathname = '/v1/chatvcp/completions';
            finalUrl = url.toString();
        }
        const key = resolveVcpApiKey({ projectRoot, vcpUrl: finalUrl, configuredKey: settings.vcpApiKey }).effectiveKey;
        let model = settings.creditReportModel || settings.topicSummaryModel || 'gpt-5.4';
        let response = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key || ''}` },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                stream: false,
                messages: vcpMessages(bundle),
                requestId: id('credit_report'),
            }),
        });
        if (!response.ok) {
            let body = await response.text();
            if (shouldRetryWithStrippedCodexModel(response.status, body, model)) {
                const fallbackModel = stripCodexModelPrefix(model);
                if (fallbackModel && fallbackModel !== model) {
                    model = fallbackModel;
                    response = await fetch(finalUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key || ''}` },
                        body: JSON.stringify({
                            model,
                            temperature: 0.2,
                            stream: false,
                            messages: vcpMessages(bundle),
                            requestId: id('credit_report_retry'),
                        }),
                    });
                    if (!response.ok) body = await response.text();
                }
            }
            if (!response.ok) {
                throw new Error(`VCP 返回 ${response.status}: ${body.slice(0, 300)}`);
            }
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || data?.response || data?.content;
        if (!content) throw new Error('VCP 返回中没有可用报告内容');
        return String(content).trim();
    }

    async function saveReport(caseId, report) {
        const reportId = report.id || id('report');
        const payload = {
            id: reportId,
            caseId,
            title: report.title || '企业授信贷前调查报告初稿',
            content: report.content || '',
            source: report.source || 'manual',
            warning: report.warning || '',
            createdAt: report.createdAt || nowIso(),
            updatedAt: nowIso(),
        };
        await writeJson(path.join(reportDir(caseId), `${reportId}.json`), payload);
        const caseData = await getCase(caseId);
        caseData.activeReportId = reportId;
        await saveCase(caseData);
        await audit(caseId, 'save_report', { reportId, source: payload.source });
        return payload;
    }

    async function generateReport(caseId) {
        let bundle = await getBundle(caseId);
        if (!bundle.ruleResults?.generatedAt) {
            await runRules(caseId);
            bundle = await getBundle(caseId);
        }
        let content;
        let source = 'vcp';
        let warning = '';
        try {
            content = await requestVcpReport(bundle);
        } catch (error) {
            console.warn('[Credit] VCP report generation failed, using local template:', error.message);
            content = localReport(bundle);
            source = 'local-template';
            warning = `VCP/LLM 生成失败，已使用本地模板兜底：${error.message}`;
        }
        return saveReport(caseId, { title: '企业授信贷前调查报告初稿', content, source, warning });
    }

    async function getReport(caseId, reportId) {
        let targetId = reportId;
        if (!targetId) targetId = (await getCase(caseId)).activeReportId;
        if (!targetId) throw new Error('尚未生成报告');
        const report = await readJson(path.join(reportDir(caseId), `${targetId}.json`), null);
        if (!report) throw new Error('报告不存在');
        return report;
    }

    function reportHtml(report) {
        const escaped = String(report.content || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const html = escaped
            .replace(/^# (.*)$/gm, '<h1>$1</h1>')
            .replace(/^## (.*)$/gm, '<h2>$1</h2>')
            .replace(/^### (.*)$/gm, '<h3>$1</h3>')
            .replace(/^\- (.*)$/gm, '<p>• $1</p>')
            .replace(/\n{2,}/g, '</p><p>')
            .replace(/\n/g, '<br>');
        return `<!doctype html><html><head><meta charset="utf-8"><title>${report.title || '授信报告'}</title><style>body{font-family:"Microsoft YaHei","SimSun",sans-serif;line-height:1.7;color:#1f2933}h1{text-align:center;font-size:22pt}h2{font-size:15pt;border-bottom:1px solid #d8dee4;padding-bottom:6px;margin-top:24px}p{font-size:11pt}</style></head><body><p>${html}</p></body></html>`;
    }

    return {
        creditDir,
        ensureStore,
        listCases,
        getCase,
        saveCase,
        getBundle,
        saveMaterials,
        extractMaterial,
        updateMaterialType,
        saveExternal,
        runRules,
        saveReport,
        generateReport,
        getReport,
        reportHtml,
        getAssistantChat,
        appendAssistantChat,
        handleAssistantMessage,
        assistantProgressReply,
        audit,
        caseDir,
        materialDir,
        extractDir,
        materialIndexPath,
        externalPath,
    };
}

function initialize(paths) {
    const { USER_DATA_DIR } = paths;
    const store = createStore(paths);
    if (ipcHandlersRegistered) return;

    ipcMain.handle('credit:list-cases', async () => {
        try {
            return { success: true, cases: await store.listCases(), dataDir: store.creditDir };
        } catch (error) {
            return { success: false, error: error.message, cases: [] };
        }
    });

    ipcMain.handle('credit:create-case', async (event, payload = {}) => {
        try {
            await store.ensureStore();
            const caseId = id('case');
            const root = store.caseDir(caseId);
            await fs.ensureDir(store.materialDir(caseId));
            await fs.ensureDir(store.extractDir(caseId));
            await fs.ensureDir(path.join(root, 'reports'));
            const timestamp = nowIso();
            const caseData = {
                id: caseId,
                caseType: 'enterprise_credit',
                status: 'draft',
                name: payload.name || payload.companyName || '企业授信案件',
                createdAt: timestamp,
                updatedAt: timestamp,
                fields: {
                    ...DEFAULT_FIELDS,
                    companyName: payload.companyName || '',
                    loanAmount: payload.loanAmount || '',
                    loanPurpose: payload.loanPurpose || '',
                },
                materialIds: [],
                activeReportId: null,
            };
            await store.saveCase(caseData);
            await writeJson(store.materialIndexPath(caseId), []);
            await writeJson(store.externalPath(caseId), DEFAULT_EXTERNAL);
            await writeJson(path.join(root, 'rule_results.json'), { generatedAt: null, rules: [], stats: { total: 0, high: 0, medium: 0, low: 0 } });
            await writeJson(path.join(root, 'audit_log.json'), []);
            await writeJson(path.join(root, 'assistant_chat.json'), []);
            await store.audit(caseId, 'create_case', { name: caseData.name });
            return { success: true, case: caseData };
        } catch (error) {
            console.error('[Credit] Create case failed:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:get-case', async (event, caseId) => {
        try {
            return { success: true, bundle: await store.getBundle(caseId) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:update-case', async (event, caseId, patch = {}) => {
        try {
            const current = await store.getCase(caseId);
            const next = {
                ...current,
                ...patch,
                id: current.id,
                fields: { ...DEFAULT_FIELDS, ...(current.fields || {}), ...(patch.fields || {}) },
            };
            if (patch.fields) {
                next.fieldEvidence = markFieldsAsManualConfirmed(current.fieldEvidence, patch.fields);
            }
            const saved = await store.saveCase(next);
            await store.audit(caseId, 'update_case', { keys: Object.keys(patch || {}) });
            return { success: true, case: saved };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:select-materials', async (event, caseId) => {
        try {
            const ownerWindow = BrowserWindow.fromWebContents(event.sender);
            const result = await dialog.showOpenDialog(ownerWindow, {
                title: '选择授信调查材料',
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: '授信材料', extensions: ['pdf', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'md', 'json', 'png', 'jpg', 'jpeg', 'webp', 'bmp'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
            });
            if (result.canceled || result.filePaths.length === 0) return { success: true, canceled: true, materials: [] };

            const materials = await readJson(store.materialIndexPath(caseId), []);
            const added = [];
            await fs.ensureDir(store.materialDir(caseId));
            for (const sourcePath of result.filePaths) {
                const stat = await fs.stat(sourcePath);
                const materialId = id('mat');
                const originalName = path.basename(sourcePath);
                const storedFileName = `${materialId}_${safeName(originalName)}`;
                const targetPath = path.join(store.materialDir(caseId), storedFileName);
                await fs.copy(sourcePath, targetPath, { overwrite: false });
                const materialType = inferMaterialType(originalName);
                const material = {
                    id: materialId,
                    originalName,
                    storedFileName,
                    relativePath: slash(path.relative(store.caseDir(caseId), targetPath)),
                    sourcePath,
                    mimeType: inferMime(targetPath),
                    size: stat.size,
                    materialType,
                    materialTypeLabel: MATERIAL_LABELS[materialType] || MATERIAL_LABELS.other,
                    extractStatus: 'pending',
                    warningCount: 0,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                };
                materials.push(material);
                added.push(material);
            }
            await store.saveMaterials(caseId, materials);
            await store.audit(caseId, 'select_materials', { count: added.length });

            const extracts = [];
            for (const material of added) {
                try {
                    extracts.push(await store.extractMaterial(caseId, material.id));
                } catch (error) {
                    extracts.push({ materialId: material.id, status: 'failed', error: error.message });
                }
            }
            return { success: true, materials: added, extracts };
        } catch (error) {
            console.error('[Credit] Select materials failed:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:extract-material', async (event, caseId, materialId) => {
        try {
            return { success: true, extract: await store.extractMaterial(caseId, materialId) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:update-material-type', async (event, caseId, materialId, materialType) => {
        try {
            const result = await store.updateMaterialType(caseId, materialId, materialType, { reextract: true });
            return { success: true, ...result, bundle: await store.getBundle(caseId) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:save-extract', async (event, caseId, materialId, patch = {}) => {
        try {
            const extractPath = path.join(store.extractDir(caseId), `${materialId}.json`);
            const current = await readJson(extractPath, { id: id('extract'), caseId, materialId, extractedText: '', structuredFields: {}, status: 'manual_required', createdAt: nowIso() });
            const next = {
                ...current,
                ...patch,
                structuredFields: { ...(current.structuredFields || {}), ...(patch.structuredFields || {}) },
                updatedAt: nowIso(),
            };
            await writeJson(extractPath, next);
            const caseData = await store.getCase(caseId);
            caseData.fieldEvidence = mergeFieldEvidence(removeMaterialEvidence(caseData.fieldEvidence, materialId), buildFieldEvidence(next.structuredFields || {}, {
                materialId,
                materialName: next.materialName || '人工校对材料',
                materialType: next.materialType || 'other',
                parser: 'manual-extract-review',
                rawText: next.extractedText || '',
            }));
            await store.saveCase(caseData);
            await store.audit(caseId, 'save_extract', { materialId });
            return { success: true, extract: next };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:save-external-data', async (event, caseId, data) => {
        try {
            return { success: true, externalData: await store.saveExternal(caseId, data) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:update-field-evidence', async (event, caseId, fieldName, patch = {}) => {
        try {
            if (!Object.prototype.hasOwnProperty.call(DEFAULT_FIELDS, fieldName)) {
                throw new Error(`不支持的字段: ${fieldName}`);
            }
            const caseData = await store.getCase(caseId);
            const current = caseData.fieldEvidence?.[fieldName] || {};
            const value = patch.value !== undefined ? patch.value : current.value || caseData.fields?.[fieldName] || '';
            const status = patch.status || current.status || (text(value) ? 'pending' : 'manual_required');
            const nextEntry = {
                ...current,
                id: current.id || id('field'),
                fieldName,
                label: FIELD_META[fieldName]?.label || fieldName,
                group: FIELD_META[fieldName]?.group || '其他',
                value,
                status,
                confidence: patch.confidence !== undefined ? patch.confidence : current.confidence || (status === 'confirmed' ? 1 : 0.5),
                method: patch.method || current.method || 'manual',
                sources: current.sources || [],
                evidenceText: patch.evidenceText || current.evidenceText || (status === 'manual_required' ? '需人工补录。' : '人工确认字段。'),
                updatedAt: nowIso(),
            };
            caseData.fieldEvidence = { ...(caseData.fieldEvidence || {}), [fieldName]: nextEntry };
            if (status === 'confirmed') {
                caseData.fields[fieldName] = value;
            }
            await store.saveCase(caseData);
            await store.audit(caseId, 'update_field_evidence', { fieldName, status });
            return { success: true, case: await store.getCase(caseId) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:get-assistant-chat', async (event, caseId) => {
        try {
            return { success: true, chat: await store.getAssistantChat(caseId) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:append-assistant-chat', async (event, caseId, messages = []) => {
        try {
            return { success: true, chat: await store.appendAssistantChat(caseId, messages) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:assistant-message', async (event, caseId, message) => {
        try {
            const result = await store.handleAssistantMessage(caseId, message);
            return { success: true, ...result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:import-external-json', async (event, caseId) => {
        try {
            const ownerWindow = BrowserWindow.fromWebContents(event.sender);
            const result = await dialog.showOpenDialog(ownerWindow, {
                title: '导入外部数据 JSON',
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (result.canceled || !result.filePaths[0]) return { success: true, canceled: true };
            const imported = await fs.readJson(result.filePaths[0]);
            const externalData = await store.saveExternal(caseId, imported);
            await store.audit(caseId, 'import_external_json', { sourcePath: result.filePaths[0] });
            return { success: true, externalData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:run-rules', async (event, caseId) => {
        try {
            return { success: true, ruleResults: await store.runRules(caseId) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:generate-report', async (event, caseId) => {
        try {
            return { success: true, report: await store.generateReport(caseId) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:save-report', async (event, caseId, report) => {
        try {
            return { success: true, report: await store.saveReport(caseId, report || {}) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:export-report', async (event, caseId, reportId, format = 'markdown') => {
        try {
            const report = await store.getReport(caseId, reportId);
            const ownerWindow = BrowserWindow.fromWebContents(event.sender);
            const isWord = format === 'word';
            const result = await dialog.showSaveDialog(ownerWindow, {
                title: isWord ? '导出 Word 报告' : '导出 Markdown 报告',
                defaultPath: `${safeName(report.title || '企业授信调查报告')}${isWord ? '.doc' : '.md'}`,
                filters: isWord ? [{ name: 'Word HTML Document', extensions: ['doc'] }] : [{ name: 'Markdown', extensions: ['md'] }],
            });
            if (result.canceled || !result.filePath) return { success: true, canceled: true };
            await fs.writeFile(result.filePath, isWord ? store.reportHtml(report) : report.content, 'utf8');
            await store.audit(caseId, 'export_report', { reportId: report.id, format, filePath: result.filePath });
            return { success: true, filePath: result.filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('credit:open-data-folder', async () => {
        try {
            await fs.ensureDir(path.join(USER_DATA_DIR, 'credit_cases'));
            const error = await shell.openPath(path.join(USER_DATA_DIR, 'credit_cases'));
            return { success: !error, error: error || null };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcHandlersRegistered = true;
}

module.exports = {
    initialize,
};
