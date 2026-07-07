(function (global) {
  const EXAM_RULE = {
    totalScore: 100,
    durationSeconds: 120 * 60,
    sections: [
      { type: "单选", count: 50, points: 1 },
      { type: "多选", count: 15, points: 2 },
      { type: "判断", count: 20, points: 1 }
    ]
  };

  function matchesSource(question, source) {
    if (source === "技师新增") return question.scope === "技师新增";
    return (question.levels || []).includes(source);
  }

  function sourceLabel(source) {
    if (source === "技师新增") return "技师新增";
    return `${source}题库`;
  }

  function sameAnswer(selected, answer) {
    const selectedSet = new Set(selected);
    if (selectedSet.size !== answer.length) return false;
    return answer.every((item) => selectedSet.has(item));
  }

  function scoreQuestion(question, selected) {
    const selectedList = Array.from(selected || []);
    const answer = question.answer || [];
    const rule = EXAM_RULE.sections.find((section) => section.type === question.type);
    if (!rule) return 0;
    if (sameAnswer(selectedList, answer)) return rule.points;
    if (question.type !== "多选" || !selectedList.length) return 0;

    const answerSet = new Set(answer);
    const hasWrongPick = selectedList.some((item) => !answerSet.has(item));
    if (hasWrongPick) return 0;
    return 1;
  }

  function shuffle(items) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function buildExamPaper(questions, source) {
    const sections = EXAM_RULE.sections.map((section) => {
      const pool = questions.filter((question) => question.type === section.type && matchesSource(question, source));
      if (pool.length < section.count) {
        throw new Error(`${sourceLabel(source)}${section.type}题不足，需要 ${section.count} 题，当前 ${pool.length} 题`);
      }
      return shuffle(pool).slice(0, section.count);
    });
    return sections.flat();
  }

  function summarizeExam(paper, answers) {
    const summary = {
      total: 0,
      max: EXAM_RULE.totalScore,
      answered: 0,
      byType: {}
    };

    EXAM_RULE.sections.forEach((section) => {
      summary.byType[section.type] = { score: 0, max: section.count * section.points, count: section.count };
    });

    paper.forEach((question) => {
      const selected = answers[question.id] || [];
      const score = scoreQuestion(question, selected);
      if (selected.length) summary.answered += 1;
      summary.total += score;
      if (summary.byType[question.type]) summary.byType[question.type].score += score;
    });

    return summary;
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }

  function analyzeExamHistory(history) {
    const records = Array.isArray(history) ? history : [];
    if (!records.length) {
      return {
        count: 0,
        average: 0,
        best: 0,
        worst: 0,
        weakType: "",
        byType: {}
      };
    }

    const scores = records.map((item) => Number(item.score || 0));
    const byType = {};
    EXAM_RULE.sections.forEach((section) => {
      byType[section.type] = { score: 0, max: 0, percent: 0 };
    });

    records.forEach((record) => {
      Object.entries(record.byType || {}).forEach(([type, value]) => {
        if (!byType[type]) byType[type] = { score: 0, max: 0, percent: 0 };
        byType[type].score += Number(value.score || 0);
        byType[type].max += Number(value.max || 0);
      });
    });

    Object.values(byType).forEach((item) => {
      item.percent = item.max ? Math.round(item.score / item.max * 100) : 0;
    });

    const weakEntry = Object.entries(byType)
      .filter(([, item]) => item.max > 0)
      .sort((a, b) => a[1].percent - b[1].percent)[0];

    return {
      count: records.length,
      average: Math.round(scores.reduce((sum, score) => sum + score, 0) / records.length),
      best: Math.max(...scores),
      worst: Math.min(...scores),
      weakType: weakEntry ? weakEntry[0] : "",
      byType
    };
  }

  const api = {
    EXAM_RULE,
    matchesSource,
    sourceLabel,
    sameAnswer,
    scoreQuestion,
    buildExamPaper,
    summarizeExam,
    formatDuration,
    analyzeExamHistory
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PowerQuizCore = api;
})(typeof window !== "undefined" ? window : globalThis);
