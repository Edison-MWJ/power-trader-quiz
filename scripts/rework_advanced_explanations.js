#!/usr/bin/env node

/* Rebuild explanation text for every advanced-level-3 PDF question.
 * Reviewed v23 text is kept when it is already answer-specific. Any old
 * fill-in/template text, including within the first 200, is regenerated.
 */

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OVERRIDE_PATH = path.join(__dirname, "advanced_explanation_overrides.json");

global.window = {};
require(path.join(ROOT, "data", "questions.js"));
const bank = window.QUESTION_BANK.questions;
const oldOverrides = JSON.parse(fs.readFileSync(OVERRIDE_PATH, "utf8"));
const baselineOverrides = JSON.parse(
  childProcess.execFileSync("git", ["show", "8791f6e:scripts/advanced_explanation_overrides.json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }),
);

const officialFallbacks = [
  {
    match: /燃煤发电.*(浮动|基准价)|基准价.*新能源/,
    title: "关于进一步深化燃煤发电上网电价市场化改革的通知",
    url: "https://www.ndrc.gov.cn/xxgk/zcfb/tz/202110/t20211012_1299461_ext.html",
    confidence: "官方依据",
  },
  {
    match: /中长期|月度交易|集中交易方式|滚动撮合|集中竞价|挂牌|双边协商|跨区跨省|政府间协议|交易规则/,
    title: "电力中长期市场基本规则",
    url: "https://zfxxgk.ndrc.gov.cn/web/iteminfo.jsp?id=20581",
    confidence: "官方规则延伸",
  },
  {
    match: /售电公司|保底售电|零售交易/,
    title: "售电公司管理办法",
    url: "https://zfxxgk.ndrc.gov.cn/web/iteminfo.jsp?id=19443",
    confidence: "官方依据",
  },
  {
    match: /现货市场|节点边际|日前市场|实时市场|SCUC|SCED/,
    title: "电力现货市场基本规则（试行）",
    url: "https://www.ndrc.gov.cn/xxgk/zcfb/ghxwj/202309/t20230915_1360625.html",
    confidence: "官方规则依据",
  },
  {
    match: /辅助服务|调频|调峰|备用|黑启动/,
    title: "电力辅助服务市场基本规则",
    url: "https://www.nea.gov.cn/20250429/df8e465e859245039b24fbbe21f04c5f/1590532f26ed4320ab7f6c86757f5c42.pdf",
    confidence: "官方规则依据",
  },
  {
    match: /能源法|可再生能源法/,
    title: "中华人民共和国能源法",
    url: "https://www.npc.gov.cn/npc/c2/c30834/202411/t20241108_440884.html",
    confidence: "官方法律依据",
  },
];

function text(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function quote(value) {
  return `“${text(value)}”`;
}

function labels(q) {
  return q.answer.join("、");
}

function optionMap(q) {
  return new Map(q.options.map((option) => [option.label, text(option.text)]));
}

function intent(stem) {
  if (/不支持|不属于|不包括|不正确|不应|不会|不需要|错误|禁止|不合规|不能|不宜|不对|无需/.test(stem)) return "exclude";
  if (/点击|上传|填报|提交|选择|维护|操作|办理/.test(stem)) return "action";
  if (/由.*(负责|承担)|谁|哪个(主体|机构|部门|单位)/.test(stem)) return "role";
  if (/定义|是指|称为|又称|含义|指的是/.test(stem)) return "definition";
  if (/包括|哪些|有[（(]|以下/.test(stem)) return "list";
  if (/多少|几个|工作日|比例|电压|容量|期限|时间|时段|数量|价格|电量|功率|频率|倍数/.test(stem)) return "value";
  return "concept";
}

function focus(stem) {
  if (/平台|点击|上传|填报|申报|维护/.test(stem)) return "平台操作和申报边界";
  if (/信息披露|披露|公开信息|私有信息/.test(stem)) return "信息披露范围和对象";
  if (/结算|偏差电量|结算电费/.test(stem)) return "结算、合同与偏差处理";
  if (/现货|节点边际|日前|实时/.test(stem)) return "现货市场的交易和出清环节";
  if (/中长期|滚动撮合|集中竞价|挂牌|双边协商/.test(stem)) return "中长期交易方式和成交规则";
  if (/辅助服务|调频|调峰|备用|黑启动/.test(stem)) return "辅助服务的品种和调用关系";
  if (/发电|机组|负荷|输电|电网/.test(stem)) return "电力系统主体、运行约束和数据";
  if (/售电|零售|用户/.test(stem)) return "售电和用户侧业务关系";
  return "题干限定的业务对象、动作和条件";
}

function actionRole(value) {
  const v = text(value);
  if (/新增|上传/.test(v)) return "新增或上传资料";
  if (/保存/.test(v)) return "保存已填写内容";
  if (/申报|提交/.test(v)) return "提交申报结果";
  if (/查看|查询/.test(v)) return "查看已有信息";
  if (/编辑|修改/.test(v)) return "修改已有信息";
  if (/删除|撤销/.test(v)) return "删除或撤销信息";
  if (/导出|复制|粘贴/.test(v)) return "批量导入或导出数据";
  return "平台操作";
}

function optionReason(q, option, mode, isAnswer) {
  const value = text(option.text);
  if (/市场出清/.test(q.stem) && /关键通道|机组可发电量|负荷预测|用电量预测/.test(value)) {
    if (isAnswer) return `${quote(value)}提供了月度交易的关键输电通道可用边界，是集中交易出清进行安全校核和确定可成交范围的直接约束。`;
    return `${quote(value)}属于机组出力或负荷预测等其他输入，不能替代关键通道月度可用输电容量这一输电约束。`;
  }
  if (/偏差电量进行记录.*包括/.test(q.stem)) {
    if (isAnswer) return `${quote(value)}属于题干要求调度机构记录的偏差字段，能够说明偏差的性质、时间或数量。`;
    return `${quote(value)}不是该题干列出的偏差记录字段，不能替代偏差原因、起止时间或偏差电量的记录口径。`;
  }
  if (isAnswer) {
    if (mode === "exclude") return `${quote(value)}正是题干要求排除的对象，符合“不支持/不属于/不应”等否定限定。`;
    if (mode === "action") return `${quote(value)}能够直接完成题干要求的${actionRole(value)}，动作与题干所处环节一致。`;
    if (mode === "role") return `${quote(value)}是题干所问环节的直接责任主体或对应职责，能够承担题干描述的事项。`;
    if (mode === "definition") return `${quote(value)}给出了题干术语的定义或标准名称，和题干中的概念边界一致。`;
    if (mode === "value") return `${quote(value)}符合题干给出的数量、时间、价格或运行参数口径，其他数值不能满足同一约束。`;
    if (mode === "list") return `${quote(value)}属于题干要求列举的${focus(q.stem)}，所以应纳入答案集合。`;
    return `${quote(value)}同时满足题干限定的${focus(q.stem)}，与题干中的主体、对象和业务关系能够对应。`;
  }

  if (mode === "exclude") return `${quote(value)}仍属于题干描述的正常范围或支持条件，因此不是题干要求排除的选项。`;
  if (mode === "action") return `${quote(value)}对应的是${actionRole(value)}，与题干要求完成的动作不一致。`;
  if (mode === "role") return `${quote(value)}属于相邻主体或相邻职责，不能替代题干所问环节的直接责任主体。`;
  if (mode === "definition") return `${quote(value)}是相邻概念、结果或交易环节，不是题干术语所要求的定义。`;
  if (mode === "value") return `${quote(value)}与题干限定的数量、时间、价格或运行参数口径不一致。`;
  if (mode === "list") return `${quote(value)}虽与电力业务相关，但不属于题干要求列举的${focus(q.stem)}，或超出了题干范围。`;
  return `${quote(value)}与题干限定的${focus(q.stem)}不完全对应，不能替代标准答案。`;
}

function shortStem(stem) {
  const value = text(stem);
  return value.length > 140 ? `${value.slice(0, 137)}…` : value;
}

function coreClause(stem) {
  const clauses = text(stem)
    .replace(/[（(][）)]/g, "")
    .split(/[，。；;]/)
    .map(text)
    .filter((value) => value.length >= 4);
  return clauses.find((value) => /是|指|应|包括|可以|不得|属于|由|不/.test(value)) || clauses[0] || text(stem);
}

function rawBasis(q) {
  const candidates = (q.explanations || [])
    .map(text)
    .filter((value) => value.length >= 70 && !value.includes("来源：") && !value.includes("可信度："));
  const basis = candidates.find((value) => !/^《?[^，。]+(等|编著|出版社|P\d)/.test(value));
  return basis || "";
}

function sourceFor(q, existing) {
  const stem = text(q.stem);
  const baseline = baselineOverrides[q.id] && baselineOverrides[q.id][0];
  if (/非现货市场.*偏差电量进行记录/.test(stem)) {
    return baseline && baseline.sourceTitle
      ? baseline
      : {
          title: "电力市场计量结算基本规则",
          url: "https://zfxxgk.ndrc.gov.cn/web/iteminfo.jsp?id=20533",
          confidence: "官方规则依据",
        };
  }
  const official = officialFallbacks.find((item) => item.match.test(stem));
  if (official) return official;
  if (baseline && baseline.sourceTitle) return baseline;
  if (existing && existing.sourceTitle) return existing;
  const origin = q.origins.find((value) => /三级/.test(value)) || "高级工三级PDF样卷";
  return {
    title: `高级工三级PDF样卷：${origin.split("/").pop()}`,
    url: "",
    confidence: "题库原题口径，建议复核原培训材料",
  };
}

function metadata(q) {
  const current = oldOverrides[q.id] && oldOverrides[q.id][0];
  const source = sourceFor(q, current);
  return {
    sourceTitle: source.sourceTitle || source.title || "",
    sourceUrl: source.sourceUrl || source.url || "",
    confidence: source.confidence || "",
  };
}

function singleExplanation(q) {
  const mode = intent(q.stem);
  const map = optionMap(q);
  const answerText = q.answer.map((label) => `${label}${quote(map.get(label))}`).join("、");
  const wrong = q.options
    .filter((option) => !q.answer.includes(option.label))
    .map((option) => optionReason(q, option, mode, false))
    .join(" ");
  return `题干考查“${shortStem(q.stem)}”。标准答案为${answerText}。判断依据：${q.answer.map((label) => optionReason(q, { text: map.get(label) }, mode, true)).join(" ")} 排除其他选项：${wrong}`;
}

function multiExplanation(q) {
  const mode = intent(q.stem);
  const map = optionMap(q);
  const selected = q.answer.map((label) => optionReason(q, { text: map.get(label) }, mode, true)).join(" ");
  const rejected = q.options
    .filter((option) => !q.answer.includes(option.label))
    .map((option) => optionReason(q, option, mode, false))
    .join(" ");
  return `题干考查“${shortStem(q.stem)}”。标准答案为${q.answer.join("、")}，必须按答案集合完整选择。正确项依据：${selected} 排除未选项：${rejected}`;
}

function judgmentExplanation(q) {
  const stem = text(q.stem);
  const answer = q.answer[0];
  let reason;
  if (/滚动撮合交易是指/.test(stem)) {
    reason = "题干同时给出了规定交易时间内可提交购售信息、时间优先、价格优先和滚动成交四个定义要素，概念要素完整，因此判为对。";
  } else if (/集中竞价交易中，为避免市场操纵/.test(stem) && answer === "错") {
    reason = "题干把设置结算价格上下限直接表述为集中竞价交易的统一规则；价格限值是否设置及其范围应由具体市场规则确定，不能由该目的概括推出，因此判为错。";
  } else if (/跨区跨省的政府间协议.*11月底/.test(stem)) {
    reason = "题干明确了上一年度11月底前下达总体规模和分月计划、再由购售双方签订合同的时间与流程，和政府间协议的题库规则口径一致，因此判为对。";
  } else if (/电力系统是由发电、变电、输电、配电、用电/.test(stem)) {
    reason = "题干完整覆盖发电、变电、输电、配电、用电设备及辅助系统，并说明了能源转换、输送和分配功能，符合电力系统的定义，因此判为对。";
  } else if (/网损是指电能量输送过程中/.test(stem)) {
    reason = "题干把网损限定为输送过程中的功率损失，并指出其与电阻、电导造成的损耗相关，符合网损的基本定义，因此判为对。";
  } else if (/能源法.*支持可再生能源/.test(stem)) {
    reason = "题干所述支持可再生能源开发利用属于能源法明确的能源发展方向，主体、对象和政策方向一致，因此判为对。";
  } else if (/外送交易指售电公司与电网/.test(stem) && answer === "错") {
    reason = "错误在于把外送交易的主体和交易关系表述成售电公司与电网之间的交易；该表述混淆了跨区跨省购售电关系与售电公司零售业务，因此判为错。";
  } else if (/可以忽视安全规程/.test(stem) && answer === "错") {
    reason = "安全规程是电力生产和交易相关运行的底线要求，不能以提高效率为由忽视；题干把效率与安全对立起来，违反安全管理原则，因此判为错。";
  } else if (answer === "对") {
    if (/是指|包括|由|应当|原则上|明确|按照|定义/.test(stem)) {
      reason = `关键核对点是“${coreClause(stem)}”；题干中的主体、对象、动作和适用条件彼此一致，表述没有超出该规则或定义的边界，因此判为对。`;
    } else {
      reason = `关键核对点是“${coreClause(stem)}”；题干所述业务关系与题目对应的规则口径一致，未出现主体、对象或条件错配，因此判为对。`;
    }
  } else if (/仅|只有|完全|一律|必然|均|不受|不影响|无需|只能|都/.test(stem)) {
    reason = `关键错误在“${coreClause(stem)}”：题干使用了绝对化或无条件表述，把有适用条件的规则扩大成普遍结论；该限定不成立，因此判为错。`;
  } else {
    reason = `关键错误在“${coreClause(stem)}”：题干把主体、对象、动作或适用条件作了错误对应，不能据此推出题干结论；应按题目对应的交易规则和实施条件判断，因此判为错。`;
  }
  const basis = rawBasis(q);
  return `本题判断“${shortStem(stem)}”。标准答案为“${answer}”。具体原因：${reason}${basis ? ` 题库原有依据进一步指出：${basis}` : ""}`;
}

function buildText(q) {
  if (q.type === "判断") return judgmentExplanation(q);
  if (q.type === "多选") return multiExplanation(q);
  return singleExplanation(q);
}

const advanced = bank.filter(
  (question) => question.levels.includes("高级工") && question.origins.some((origin) => /三级/.test(origin)),
);
const reviewedFirst200 = new Set(advanced.slice(0, 200).map((question) => question.id));
function isReviewedSpecific(entry) {
  const value = text(entry && entry.text);
  return value && !/将答案代入题干|题干的关键限定|不能替代题干所问口径/.test(value);
}
const output = {};
for (const question of advanced) {
  if (reviewedFirst200.has(question.id) && oldOverrides[question.id] && isReviewedSpecific(oldOverrides[question.id][0])) {
    output[question.id] = oldOverrides[question.id];
    continue;
  }
  const source = metadata(question);
  output[question.id] = [
    {
      text: buildText(question),
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
      confidence: source.confidence,
    },
  ];
}

fs.writeFileSync(OVERRIDE_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Reworked ${advanced.length - reviewedFirst200.size} remaining questions; retained ${reviewedFirst200.size} reviewed questions.`);
console.log(`Wrote ${Object.keys(output).length} advanced-level-3 overrides.`);
