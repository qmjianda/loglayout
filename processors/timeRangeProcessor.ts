
import { LogProcessor, LogLine, LayerStats } from '../types';

export const timeRangeProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { startTime, endTime, timeFormat } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  if (!startTime && !endTime) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  // 1. 智能时间解析器：支持数字(0.000217)和日期字符串
  const parseVal = (s: string | undefined): number => {
    if (!s) return NaN;
    const trimmed = s.trim();
    // 如果是纯数字（可选小数点），直接转为 float
    if (/^-?\d*(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    // 否则尝试解析为日期
    const d = new Date(trimmed).getTime();
    return d;
  };

  const startThreshold = startTime ? parseVal(startTime) : -Infinity;
  const endThreshold = endTime ? parseVal(endTime) : Infinity;

  // 2. 正则表达式准备
  let timeRegex: RegExp;
  try {
    // 默认正则支持 ISO 或 [ 0.123] 格式
    timeRegex = timeFormat ? new RegExp(timeFormat) : /(?:\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)|(?:\d+\.\d+)/;
  } catch (e) {
    timeRegex = /\d+\.\d+/;
  }

  // 优化：使用 for 循环替代 filter
  const processedLines: Array<LogLine | string> = [];
  const total = lines.length;

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const content = typeof line === 'string' ? line : line.content;

    timeRegex.lastIndex = 0;
    const match = content.match(timeRegex);
    if (!match) continue;

    // 提取时间字符串：优先取第一个捕获组，否则取全文
    const rawTimeStr = match[1] || match[0];
    if (!rawTimeStr) continue;

    // 清洗：移除常见的日志包裹符如 [ ]
    const cleanedStr = rawTimeStr.replace(/[\[\]]/g, '').trim();

    // 解析当前行的时间/值
    let currentVal: number;
    if (/^-?\d*(\.\d+)?$/.test(cleanedStr)) {
      currentVal = parseFloat(cleanedStr);
    } else {
      // 针对日期格式进行标准化 (空格转 T)
      const isoReady = cleanedStr.replace(/^(\d{4}-\d{2}-\d{2})\s/, '$1T');
      currentVal = new Date(isoReady).getTime();
    }

    if (isNaN(currentVal)) continue;

    const isMatch = currentVal >= startThreshold && currentVal <= endThreshold;
    if (isMatch) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
      processedLines.push(line);
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};
