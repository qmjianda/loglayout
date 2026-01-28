# LogLayer Pro - 项目规则与描述

## 项目概述

**LogLayer Pro** 是一个专业级的日志分析工具，采用创新的图层处理系统，灵感来源于 VS Code 和 Photoshop。该项目旨在为用户提供强大、高效、直观的大型日志文件分析能力。

### 核心定位
- **目标用户**: 开发者、运维工程师、系统管理员
- **核心价值**: 通过图层化处理方式，实现对海量日志文件的高性能分析和可视化
- **技术特色**: 基于 React + TypeScript 的现代化 Web 应用，采用虚拟滚动和流式处理技术

## 核心架构理念

### 1. 图层处理系统 (Layer-Based Processing)
项目的核心创新在于将 Photoshop 的图层概念应用到日志处理中：

- **图层类型** (`LayerType`):
  - `FILTER`: 内容过滤图层 - 根据正则表达式或文本匹配过滤日志行
  - `HIGHLIGHT`: 高亮图层 - 为匹配的内容添加彩色高亮标记
  - `RANGE`: 行号范围图层 - 按行号范围过滤日志
  - `TIME_RANGE`: 时间范围图层 - 按时间戳过滤日志
  - `LEVEL`: 日志等级图层 - 按日志级别（ERROR, WARN, INFO等）过滤
  - `TRANSFORM`: 内容转换图层 - 使用正则表达式替换日志内容
  - `FOLDER`: 文件夹图层 - 用于组织和分组其他图层

- **图层管道** (Layer Pipeline):
  - 图层按顺序依次处理日志数据
  - 支持图层嵌套（通过 `groupId` 实现父子关系）
  - 每个图层可独立启用/禁用
  - 支持拖拽重排图层顺序

### 2. 高性能处理策略

#### 流式文件加载
- 使用 `ReadableStream` API 逐块读取大文件
- 避免一次性加载整个文件到内存
- 实时显示加载进度

#### 异步分块处理
- 将日志处理任务分解为多个小块（chunk）
- 使用 `setTimeout` 让出主线程，保持 UI 响应
- 支持任务取消和中断

#### 虚拟滚动 (Virtual Scrolling)
- 只渲染可见区域的日志行
- 使用固定行高（20px）计算可见范围
- 缓冲区机制（buffer: 25行）提升滚动体验

#### 智能对象化
- 仅在需要时将字符串转换为 `LogLine` 对象
- `FILTER` 和 `RANGE` 类型保持字符串格式
- `HIGHLIGHT` 和 `TRANSFORM` 类型才转换为对象

### 3. 数据流架构

```
原始日志文件 (Raw File)
    ↓ (流式读取)
原始日志行数组 (rawLogs: string[])
    ↓ (图层管道处理)
处理后的日志 (processedLogs: Array<LogLine | string>)
    ↓ (虚拟滚动渲染)
可见日志行 (visibleLines)
```

### 4. 状态管理策略

#### 核心状态
- `rawLogs`: 原始日志数据（不可变）
- `processedLogs`: 处理后的日志数据
- `layers`: 图层配置数组
- `layerStats`: 每个图层的统计信息（匹配数量、分布图）

#### 历史记录系统
- 使用 `past` 和 `future` 数组实现撤销/重做
- 最大历史记录数: 100
- 快捷键: Ctrl+Z (撤销), Ctrl+Y/Ctrl+Shift+Z (重做)

#### 防抖优化
- 根据日志大小动态调整防抖时间:
  - > 5,000,000 行: 1500ms
  - > 1,000,000 行: 800ms
  - 其他: 250ms

### 5. UI/UX 设计原则

#### VS Code 风格
- 深色主题 (`#1e1e1e` 背景)
- 侧边栏布局（Explorer, Search, Layers, Presets, Help）
- 状态栏显示文件信息和处理状态
- 自定义滚动条样式

#### 交互特性
- **拖拽排序**: 图层支持拖拽重新排序和分组
- **内联编辑**: 双击图层名称即可编辑
- **快捷键支持**:
  - `Ctrl+F`: 打开查找面板
  - `Ctrl+G`: 跳转到指定行
  - `Esc`: 关闭查找/跳转面板
- **点击切换**: 单击列表项头部（文件或图层）可切换展开/折叠状态

#### 可视化反馈
- **进度条**: 文件加载和图层处理进度
- **分布图**: 右侧迷你地图显示匹配项分布
- **高亮显示**: 搜索结果和跳转目标行高亮
- **统计信息**: 实时显示每个图层的匹配数量

## 技术栈

### 前端框架
- **React 19.2.3**: UI 框架
- **TypeScript 5.8.2**: 类型安全
- **Vite 6.2.0**: 构建工具

### 样式方案
- **Tailwind CSS**: 通过 CDN 引入
- **自定义 CSS**: VS Code 风格滚动条和动画

### 核心依赖
- `@google/genai`: AI 功能集成（预留）

## 项目结构

```
loglayer/
├── App.tsx                 # 主应用组件，多文件管理和状态管理
├── types.ts                # TypeScript 类型定义
├── index.tsx               # 应用入口
├── index.html              # HTML 模板
├── components/             # React 组件
│   ├── Sidebar.tsx         # 侧边栏导航（简化版：工作区/搜索/帮助）
│   ├── UnifiedPanel.tsx    # 📌 整合面板（文件管理+图层管理+预设）
│   ├── LogViewer.tsx       # 日志查看器（虚拟滚动）
│   ├── LayersPanel.tsx     # 图层管理面板
│   ├── SearchPanel.tsx     # 搜索面板
│   ├── ExplorerPanel.tsx   # ⚠️ 已整合到 UnifiedPanel
│   ├── PresetPanel.tsx     # ⚠️ 已整合到 UnifiedPanel
│   ├── HelpPanel.tsx       # 帮助文档
│   ├── StatusBar.tsx       # 状态栏
│   ├── EditorFindWidget.tsx      # 查找小部件
│   ├── EditorGoToLineWidget.tsx  # 跳转行小部件
│   └── layer-configs/      # 各图层类型的配置组件
│       ├── FilterConfig.tsx
│       ├── HighlightConfig.tsx
│       ├── RangeConfig.tsx
│       ├── TimeRangeConfig.tsx
│       ├── LevelConfig.tsx
│       ├── TransformConfig.tsx
│       └── ColorPicker.tsx
├── processors/             # 图层处理器
│   ├── index.ts            # 处理器注册和调度
│   ├── filterProcessor.ts
│   ├── highlightProcessor.ts
│   ├── rangeProcessor.ts
│   ├── timeRangeProcessor.ts
│   ├── levelProcessor.ts
│   └── transformProcessor.ts
└── package.json
```

### 多文件支持架构 (2026-01-28 新增)

```
文件管理数据流:
┌─────────────────┐
│   文件输入      │  <- 单文件 / 文件夹选择
└────────┬────────┘
         ▼
┌─────────────────┐
│  processFile()  │  <- 流式读取每个文件
└────────┬────────┘
         ▼
┌─────────────────┐
│  files: FileData[]  │  <- 存储所有已加载文件
└────────┬────────┘
         ▼
┌─────────────────┐
│  activeFileId   │  <- 当前活动文件
└────────┬────────┘
         ▼
┌─────────────────┐
│  rawLogs        │  <- 活动文件的日志行
└─────────────────┘
```

## 开发规范

### 1. 代码风格
- 使用函数式组件和 React Hooks
- 优先使用 `useCallback` 和 `useMemo` 优化性能
- 保持组件职责单一
- 使用 TypeScript 严格模式

### 2. 开发工作流规则 (2026-01-28 新增)
1. **文档同步更新**: 
   - 每次完成功能修改或重构后，必须检查并更新 `.agent/rules.md` 和相关 `skills/` 文档。
   - 保持文档与代码实现的实时一致。
2. **自动化浏览器测试**:
   - 在完成主要功能开发或修复后，必须使用 `browser_subagent` 自动打开浏览器进行端到端测试。
   - 验证点必须包括：
     - 核心功能完整性（如文件加载、图层操作）
     - UI/UX 交互规则（如悬停、点击、布局响应）
     - 视觉一致性

### 3. 性能优化原则
- **避免不必要的重渲染**: 使用 React.memo 包装纯组件
- **大数据处理**: 必须使用分块处理和异步操作
- **状态更新**: 使用函数式更新避免闭包陷阱
- **计算缓存**: 使用 `useMemo` 缓存昂贵的计算结果

#### ⚡ 性能优化最佳实践 (2026-01-28 更新)

**✅ DO（必须遵循）**:
1. **使用 for 循环替代 map/filter**
   ```typescript
   // ❌ 不好：创建不必要的新数组
   const result = lines.map(line => line);
   
   // ✅ 好：预分配数组，只修改需要的元素
   const result = new Array(lines.length);
   for (let i = 0; i < lines.length; i++) {
     result[i] = lines[i];
   }
   ```

2. **避免对象展开运算符**
   ```typescript
   // ❌ 不好：每次都创建新对象
   return { ...line, highlights: newHighlights };
   
   // ✅ 好：显式创建对象
   return {
     index: line.index,
     content: line.content,
     highlights: newHighlights,
     isMarked: line.isMarked
   };
   ```

3. **复用未修改的对象**
   ```typescript
   // ❌ 不好：即使没有变化也创建新对象
   return lines.map(line => ({ ...line }));
   
   // ✅ 好：只对修改的行创建新对象
   if (needsChange) {
     result[i] = { /* 新对象 */ };
   } else {
     result[i] = line; // 直接复用
   }
   ```

4. **重置全局正则表达式状态**
   ```typescript
   // ❌ 不好：全局正则会保留 lastIndex
   const re = new RegExp(pattern, 'g');
   lines.forEach(line => re.test(line)); // 可能出错
   
   // ✅ 好：每次使用前重置
   const re = new RegExp(pattern, 'g');
   for (let i = 0; i < lines.length; i++) {
     re.lastIndex = 0;
     re.test(lines[i]);
   }
   ```

5. **预分配数组**
   ```typescript
   // ❌ 不好：动态扩容
   const result = [];
   for (let i = 0; i < 1000000; i++) {
     result.push(data[i]);
   }
   
   // ✅ 好：预分配大小
   const result = new Array(1000000);
   for (let i = 0; i < 1000000; i++) {
     result[i] = data[i];
   }
   ```

6. **优化批处理大小**
   ```typescript
   // ❌ 不好：批次太小，频繁中断
   const batchSize = 1000;
   
   // ✅ 好：使用更大的批次
   const batchSize = 500000;
   ```

**❌ DON'T（禁止）**:
1. ❌ 不要对未修改的元素使用 map 返回新对象
2. ❌ 不要过度使用对象展开运算符 `{...obj}`
3. ❌ 不要进行不必要的类型转换（如字符串→对象）
4. ❌ 不要在循环内重复计算常量
5. ❌ 不要忘记重置全局正则表达式的状态
6. ❌ 不要频繁让出主线程（除非真的需要）

**性能提升预期**:
- 处理速度提升: **40-60%**
- 内存占用减少: **30-50%**
- UI 响应性: 显著改善

详见: `.agent/performance-optimization-report.md`

### 3. 处理器开发规范
每个处理器必须实现 `LogProcessor` 接口:

```typescript
type LogProcessor = (
  lines: Array<LogLine | string>, 
  layer: LogLayer, 
  chunkSize: number
) => { 
  processedLines: Array<LogLine | string>; 
  stats: LayerStats;
};
```

**要求**:
- 必须返回处理后的日志行和统计信息
- 统计信息包含 `count`（匹配总数）和 `distribution`（20段分布）
- 必须处理异常情况（如正则表达式错误）
- 保持高性能，避免不必要的对象创建

### 4. 组件开发规范
- 所有配置组件必须接收 `layer` 和 `onUpdate` props
- 使用受控组件模式
- 提供清晰的用户反馈（错误提示、验证）
- 支持键盘导航和快捷键

## 功能特性

### 已实现功能
✅ 大文件流式加载（支持 GB 级日志）
✅ 7 种图层类型（过滤、高亮、范围、时间、等级、转换、文件夹）
✅ 图层拖拽排序和分组
✅ 撤销/重做系统
✅ 全局搜索（支持正则、大小写、全词匹配）
✅ 快速跳转到指定行
✅ 预设管理（保存和加载图层配置）
✅ 虚拟滚动（支持百万行日志）
✅ 实时统计和分布可视化
✅ VS Code 风格 UI

### 预留扩展
- AI 辅助分析（已集成 `@google/genai`）
- 导出功能
- 多文件对比
- 自定义主题

## 项目目标与约束

### 核心目标
1. **性能第一**: 必须流畅处理 10M+ 行日志文件
2. **用户体验**: 提供直观、专业的操作界面
3. **灵活性**: 通过图层组合实现复杂的日志分析需求
4. **可扩展性**: 易于添加新的图层类型和功能

### 设计约束
1. **不使用后端**: 纯前端应用，所有处理在浏览器中完成
2. **内存管理**: 必须考虑大文件的内存占用
3. **响应性**: UI 必须保持流畅，不能阻塞主线程
4. **兼容性**: 支持现代浏览器（Chrome, Edge, Firefox）

## 修改指导原则

### 添加新图层类型时
1. 在 `types.ts` 中添加新的 `LayerType` 枚举值
2. 在 `processors/` 中创建对应的处理器
3. 在 `components/layer-configs/` 中创建配置组件
4. 在 `processors/index.ts` 中注册处理器
5. 在 `App.tsx` 的 `addLayer` 函数中添加默认配置
6. 更新 `LayersPanel.tsx` 添加创建按钮

### 优化性能时
1. 使用 Chrome DevTools Performance 分析瓶颈
2. 检查是否有不必要的重渲染
3. 考虑增加分块大小或调整防抖时间
4. 使用 Web Worker 处理计算密集型任务（未来）

### 修改 UI 时
1. 保持 VS Code 风格一致性
2. 使用现有的颜色变量和间距
3. 确保深色主题下的可读性
4. 测试不同屏幕尺寸下的表现

## 数据持久化

### LocalStorage 使用
- `loglayer_presets`: 存储用户的图层预设配置
- 默认预设 ID: `system-default-preset`

### 数据格式
```typescript
interface LayerPreset {
  id: string;
  name: string;
  layers: LogLayer[];
}
```

## 关键算法

### 图层处理流程
1. 过滤启用的图层（排除禁用和父级禁用的图层）
2. 按顺序遍历每个图层
3. 根据图层类型选择对应的处理器
4. 处理器接收上一个图层的输出作为输入
5. 收集每个图层的统计信息
6. 返回最终处理结果

### 搜索匹配导航
1. 构建正则表达式（支持配置选项）
2. 从当前位置向前/向后搜索
3. 找到匹配项后滚动到对应行
4. 支持循环搜索（到达末尾后从头开始）

## 未来规划
- [ ] 支持日志文件拖拽上传
- [ ] 导出过滤后的日志
- [ ] 图层配置模板市场
- [ ] AI 智能日志分析和异常检测
- [ ] 多文件对比视图
- [ ] 性能监控和优化建议
- [ ] 插件系统

---

**重要提示**: 在进行任何修改时，请始终牢记项目的核心目标是提供高性能、专业级的日志分析体验。任何改动都应该考虑对性能、用户体验和代码可维护性的影响。
