# 气象降尺度平台 - 领域模型

## 1. 核心实体模型

### 1.1 实体关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Domain Model                              │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│     User     │
├──────────────┤
│ id           │
│ username     │
│ role         │◄─── Researcher / Policy Maker / Agriculture User
└──────┬───────┘
       │ creates
       │ 1
       │
       │ *
       ▼
┌─────────────────────┐
│  Downscaling Task   │
├─────────────────────┤
│ id                  │
│ name                │
│ user_id             │
│ status              │◄─── Running / Completed / Failed
│ created_at          │
│ completed_at        │
├─────────────────────┤
│ - task_config       │◄─── 组合：任务配置
│ - task_result       │◄─── 组合：任务结果
└─────────┬───────────┘
          │
          │ contains
          ├─────────────────────────┬─────────────────────┐
          │                         │                     │
          ▼                         ▼                     ▼
┌───────────────────┐    ┌───────────────────┐   ┌──────────────┐
│   Task Config     │    │   Task Result     │   │  Result      │
├───────────────────┤    ├───────────────────┤   │  Analysis    │
│ data_source       │    │ original_data     │   ├──────────────┤
│ variable          │    │ downscaled_data   │   │ map_layers   │
│ spatial_region    │    │ observation_data  │   │ metrics      │
│ time_range        │    │ status            │   │ time_series  │
│ method            │    │ generated_at      │   │ spatial_stats│
│ resolution        │    └───────────────────┘   │ export_data  │
└───────┬───────────┘                            └──────────────┘
        │
        │ references
        ├────────┬────────┬─────────┬──────────┬──────────┐
        │        │        │         │          │          │
        ▼        ▼        ▼         ▼          ▼          ▼
   ┌────────┐ ┌───────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌────────┐
   │  Data  │ │ Met.  │ │Spatial│ │ Time  │ │Method │ │ Target │
   │ Source │ │Variable│ │Region │ │ Range │ │       │ │Resolu- │
   └────────┘ └───────┘ └───────┘ └───────┘ └────────┘ │tion    │
                                                        └────────┘
```

---

### 1.2 实体详细定义

#### User（用户）
```
User {
  id: UUID
  username: String
  role: UserRole  // Researcher | PolicyMaker | AgricultureUser
  created_at: DateTime
}
```

**职责**：
- 身份识别和访问控制
- 决定可用的参数权限和结果展示内容

**关系**：
- 一个用户创建多个降尺度任务
- 角色切换通过重新登录不同账号实现

---

#### Downscaling Task（降尺度任务）
```
DownscalingTask {
  id: UUID
  name: String
  user_id: UUID (FK -> User)
  status: TaskStatus  // Running | Completed | Failed
  created_at: DateTime
  completed_at: DateTime?
  
  // 组合对象
  config: TaskConfig
  result: TaskResult?
}
```

**职责**：
- 聚合根（Aggregate Root）：管理任务的完整生命周期
- 封装任务配置和结果
- 跟踪任务状态变化

**关系**：
- 属于一个用户
- 包含一个任务配置
- 生成一个任务结果（完成后）

**业务规则**：
- 任务一旦创建，配置不可修改
- 任务完成后状态不可回退
- Demo中任务提交后2-3秒自动完成

---

#### Task Config（任务配置）
```
TaskConfig {
  data_source: DataSource      // ECMWF | GFS | Fusion
  variable: MetVariable        // Temperature | Wind | Pressure | Precipitation
  spatial_region: SpatialRegion
  time_range: TimeRange
  method: DownscalingMethod    // Deterministic | Probabilistic | Recommended
  target_resolution: Resolution // 1km | 3km | 5km
  
  // 高级参数（仅研究人员可见）
  advanced_params: AdvancedParams?
}
```

**职责**：
- 值对象（Value Object）：封装任务的输入参数
- 参数验证和默认值设置

**关系**：
- 被任务包含
- 引用多个值对象（SpatialRegion、TimeRange等）

**业务规则**：
- 研究人员可配置所有参数
- 决策者和农业用户的方法参数使用默认值
- 空间范围支持任意选择（Mock数据）

---

#### Spatial Region（空间区域）
```
SpatialRegion {
  north_lat: Float   // 北纬度
  south_lat: Float   // 南纬度
  east_lon: Float    // 东经度
  west_lon: Float    // 西经度
  
  // 计算属性
  area_km2(): Float
  center_point(): (Float, Float)
}
```

**职责**：
- 值对象：定义地理边界框
- 提供区域计算能力

**业务规则**：
- 纬度范围：-90 到 90
- 经度范围：-180 到 180
- 北纬度必须大于南纬度
- 东经度必须大于西经度（不跨越180度经线）

---

#### Time Range（时间范围）
```
TimeRange {
  mode: TimeMode          // Historical | Forecast
  start_time: DateTime
  end_time: DateTime
  
  // 计算属性
  duration(): Duration
  granularity(): TimeGranularity  // Hour | Day
}
```

**职责**：
- 值对象：定义时间跨度
- 根据模式确定时间粒度

**业务规则**：
- **历史模式**：2020-2024年，按日选择，结束时间 > 开始时间
- **预测模式**：未来7天，按小时选择，开始时间 >= 当前时间
- 时间范围不能为空

---

#### Task Result（任务结果）
```
TaskResult {
  task_id: UUID (FK -> Task)
  original_data: GridData
  downscaled_data: GridData
  observation_data: StationData
  
  generated_at: DateTime
  data_size_mb: Float
}
```

**职责**：
- 实体：存储降尺度计算的输出数据
- 提供三方数据（原始、降尺度、观测）

**关系**：
- 属于一个任务
- 被结果分析使用

**业务规则**：
- Demo中使用预计算结果，秒级返回
- 数据包含完整的时空范围栅格
- 观测数据为台站点位数据

---

#### Result Analysis（结果分析）
```
ResultAnalysis {
  task_id: UUID (FK -> Task)
  
  // 地图对比
  map_comparison: MapComparison {
    layout_mode: LayoutMode  // Grid2x2 | Row1x4 | SingleLarge
    color_scheme: ColorScheme
    view_mode: ObservationViewMode  // Station | Interpolated
  }
  
  // 精度评估
  accuracy_metrics: AccuracyMetrics {
    overall: OverallMetrics   // RMSE, MAE, R²
    distribution: DistributionMetrics  // bias, std, quantiles
    spatial: SpatialMetrics   // spatial correlation, power spectrum
    extreme_events: ExtremeMetrics  // capture rate, accuracy
  }
  
  // 时间序列
  time_series: TimeSeries {
    selected_point: GeoPoint
    original_series: Float[]
    downscaled_series: Float[]
    observation_series: Float[]
  }
  
  // 空间分析
  spatial_analysis: SpatialAnalysis {
    correlation_map: GridData
    power_spectrum: SpectrumData
    terrain_impact: TerrainImpact
    error_distribution: GridData
  }
  
  // 数据导出
  export_config: ExportConfig
}
```

**职责**：
- 服务/视图模型：组织多维度分析结果
- 根据用户角色调整展示内容

**关系**：
- 基于任务结果计算
- 为不同角色提供差异化视图

**业务规则**：
- 研究人员：展示所有技术指标
- 决策者：突出极端事件和置信区间
- 农业用户：突出农业相关阈值

---

### 1.3 值对象清单

#### Data Source（数据源）
```
enum DataSource {
  ECMWF    // 欧洲中期，精度高
  GFS      // 美国全球，更新快
  Fusion   // 多源融合，推荐
}
```

#### Meteorological Variable（气象变量）
```
enum MetVariable {
  Temperature      // T2M - 2米气温
  Wind            // U10/V10 - 10米风速风向
  Pressure        // MSL - 海平面气压
  Precipitation   // TP - 总降水
}
```

#### Downscaling Method（降尺度方法）
```
enum DownscalingMethod {
  Deterministic   // EDSR超分，速度快，结果稳定
  Probabilistic   // 扩散模型，细节丰富，表达不确定性
  Recommended     // 智能选择，默认
}
```

#### Target Resolution（目标分辨率）
```
enum Resolution {
  HighPrecision   // 1km - 高精度模式
  Standard        // 3km - 标准模式
  Fast            // 5km - 快速模式
}
```

#### User Role（用户角色）
```
enum UserRole {
  Researcher         // 研究人员 - 完整参数权限
  PolicyMaker        // 决策者 - 中等参数权限
  AgricultureUser    // 农业用户 - 中等参数权限
}
```

#### Task Status（任务状态）
```
enum TaskStatus {
  Running      // 运行中（Demo中为2-3秒模拟）
  Completed    // 已完成
  Failed       // 失败（Demo中罕见）
}
```

#### Time Mode（时间模式）
```
enum TimeMode {
  Historical   // 历史分析模式
  Forecast     // 预测模式
}
```

---

## 2. 关键业务流程

### 2.1 任务创建流程

```
[用户] -> Dashboard -> "创建新任务"
  |
  v
[任务配置页面]
  |
  ├─ 选择数据源（ECMWF / GFS / Fusion）
  |    └─ 根据用户角色显示说明文案
  |
  ├─ 选择变量（Temperature / Wind / Pressure / Precipitation）
  |
  ├─ 定义空间范围
  |    ├─ 地图交互框选 (主要方式)
  |    ├─ 表单输入经纬度
  |    └─ 地点搜索
  |    └─ 实时预览：右侧地图显示选中区域
  |
  ├─ 选择时间模式和范围
  |    ├─ Historical: 2020-2024, 按日
  |    └─ Forecast: 未来7天, 按小时
  |
  ├─ 配置降尺度参数
  |    ├─ 方法选择（根据角色权限）
  |    |    ├─ 研究人员：可选全部
  |    |    └─ 决策者/农业用户：使用默认推荐
  |    └─ 目标分辨率（1km / 3km / 5km）
  |
  └─ 提交任务
       |
       v
     [任务处理]
       ├─ 显示加载动画（2-3秒）
       ├─ 进度提示：
       |    "正在加载数据..."
       |    "执行降尺度..."
       |    "生成结果..."
       └─ 返回预计算结果
       |
       v
     [结果页面]
       └─ 默认显示"地图对比"Tab
```

**业务规则**：
1. 参数验证：空间范围合法性、时间范围有效性
2. 角色权限：研究人员完整参数，决策者简化参数
3. 实时预览：配置过程中右侧地图同步显示
4. 模拟处理：Demo中使用预计算结果，2-3秒返回
5. 自动跳转：完成后自动进入结果页面

---

### 2.2 结果查看流程

```
[任务完成] -> [结果页面]
  |
  ├─ Tab 1: 地图对比
  |    ├─ 2×2网格：原始 | 降尺度 | 观测 | 差异
  |    ├─ 布局切换：Grid / Row / Single
  |    ├─ 联动交互：同步缩放平移
  |    ├─ 悬停提示：显示四种数值
  |    └─ 点击详情：弹出改进百分比卡片
  |
  ├─ Tab 2: 精度评估
  |    ├─ 整体精度：RMSE, MAE, R² + 散点图
  |    ├─ 分布特征：偏差, 标准差 + 箱线图
  |    ├─ 空间结构：相关性 + 功率谱图
  |    └─ 极端事件：捕捉率 + 对比柱状图
  |    └─ [角色差异化]：不同角色突出不同指标
  |
  ├─ Tab 3: 时间序列
  |    ├─ 选择点位：地图点击 / 经纬度输入 / 典型点位
  |    ├─ 主图：三条曲线（原始/降尺度/观测）
  |    ├─ 差异图：柱状图（降尺度-原始, 降尺度-观测）
  |    └─ 统计面板：RMSE, 相关系数, 改进%
  |
  ├─ Tab 4: 空间分析
  |    ├─ 相关性分布：热力图
  |    ├─ 功率谱分析：频率特征对比
  |    ├─ 地形影响：平原/丘陵/山区分组统计
  |    └─ 误差分布：空间误差地图
  |
  └─ Tab 5: 数据导出
       ├─ 左侧：地图框选导出子区域
       ├─ 右侧：导出配置
       |    ├─ 时间范围滑块
       |    ├─ 数据类型勾选（原始/降尺度/观测）
       |    ├─ 格式选择（CSV / GeoJSON / NetCDF）
       |    └─ 数据量预估（实时显示）
       └─ 下载限制：100km×100km, 30天
```

**业务规则**：
1. Tab切换：5个Tab独立内容，用户可自由浏览
2. 地图联动：4张地图同步操作，保持一致视角
3. 角色差异：研究人员/决策者/农业用户看到不同侧重点
4. 观测数据：支持点位视图和插值视图切换
5. 导出限制：空间100km×100km，时间30天

---

### 2.3 任务管理流程

```
[Dashboard / 任务管理页面]
  |
  ├─ 任务列表展示
  |    ├─ 视图模式：表格视图（默认）/ 卡片视图
  |    ├─ 列信息：名称, 变量, 区域, 时间, 方法, 状态
  |    └─ 排序：按创建时间倒序
  |
  ├─ 搜索和筛选
  |    ├─ 搜索框：按任务名搜索
  |    └─ 筛选器：变量 / 时间范围 / 方法 / 状态
  |
  ├─ 单任务操作
  |    ├─ 查看结果：点击进入结果页面
  |    └─ 删除任务
  |
  └─ 任务对比（勾选2个任务）
       |
       v
     [对比视图]
       ├─ 参数差异对比表
       |    └─ 数据源, 方法, 分辨率等逐项对比
       ├─ 并排地图
       |    └─ 任务A地图 | 任务B地图
       └─ 精度指标对比
            └─ RMSE, MAE, R² 柱状图对比
```

**业务规则**：
1. 持久化：所有任务持久化存储
2. 列表显示：最近任务优先，支持搜索筛选
3. 对比功能：限定2个任务，突出参数差异和结果对比
4. 视图切换：表格视图（详细）vs 卡片视图（直观）

---

### 2.4 角色切换流程

```
[任意页面] -> 用户头像 -> 设置
  |
  v
[用户设置页面]
  |
  ├─ 当前角色显示
  |    └─ 研究人员 / 决策者 / 农业用户
  |
  └─ 角色切换
       |
       ├─ 选择新角色
       |    ├─ 研究人员
       |    ├─ 决策者
       |    └─ 农业用户
       |
       v
     [重新登录]
       └─ 使用预设的对应角色账号
       |
       v
     [Dashboard]
       ├─ 界面展示根据新角色调整
       ├─ 任务配置参数权限更新
       └─ 结果展示侧重点更新
```

**业务规则**：
1. 角色账号：预设不同身份的角色账号
2. 重新登录：角色切换需要重新登录
3. 权限更新：登录后参数权限和展示内容自动调整
4. 任务保留：切换角色不影响历史任务数据

---

## 3. 聚合边界和领域服务

### 3.1 聚合根识别

**Downscaling Task** 是主要的聚合根：
- 管理任务的完整生命周期（创建、执行、完成）
- 封装任务配置（TaskConfig）和任务结果（TaskResult）
- 保证配置和结果的一致性
- 任务一旦创建，配置不可修改

**User** 是独立的聚合根：
- 管理用户身份和角色
- 角色切换通过切换账号实现
- 与任务的关系是松耦合的（通过user_id）

---

### 3.2 领域服务

#### DownscalingService（降尺度服务）
```
DownscalingService {
  submitTask(config: TaskConfig, user: User): Task
  getTaskResult(task_id: UUID): TaskResult
  compareasks(task1_id: UUID, task2_id: UUID): TaskComparison
}
```

**职责**：
- 协调任务创建和执行
- Demo中返回预计算结果
- 生成任务对比报告

---

#### ResultAnalysisService（结果分析服务）
```
ResultAnalysisService {
  generateMapComparison(result: TaskResult): MapComparison
  calculateAccuracyMetrics(result: TaskResult): AccuracyMetrics
  extractTimeSeries(result: TaskResult, point: GeoPoint): TimeSeries
  analyzeSpatialPatterns(result: TaskResult): SpatialAnalysis
  prepareExport(result: TaskResult, config: ExportConfig): ExportData
}
```

**职责**：
- 基于任务结果生成各维度分析
- 根据用户角色调整展示内容
- 处理数据导出请求

---

#### RoleBasedViewService（基于角色的视图服务）
```
RoleBasedViewService {
  filterConfigParams(role: UserRole): ConfigParamSchema
  customizeResultView(result: TaskResult, role: UserRole): ResultView
  getMetricPriority(role: UserRole): MetricPriority[]
}
```

**职责**：
- 根据角色过滤可用参数
- 定制结果展示内容
- 确定指标优先级

**规则**：
- **研究人员**：完整参数 + 所有技术指标
- **决策者**：简化参数 + 应用指标（极端事件、置信区间）
- **农业用户**：简化参数 + 农业指标（生长度日、霜冻预警）

---

## 4. 关键业务规则总结

### 4.1 任务配置规则

1. **参数权限分级**
   - 研究人员：所有参数可配置
   - 决策者/农业用户：方法使用默认推荐值
   
2. **空间范围验证**
   - 纬度：-90 到 90
   - 经度：-180 到 180
   - 北纬 > 南纬，东经 > 西经

3. **时间范围约束**
   - 历史模式：2020-2024年，按日选择
   - 预测模式：未来7天，按小时选择

4. **数据源选择**
   - ECMWF、GFS、Fusion（推荐）
   - 影响输入数据质量

---

### 4.2 任务执行规则

1. **Demo特性**
   - 使用预计算结果，秒级响应
   - 模拟2-3秒处理过程（加载动画）
   - 支持任意范围（Mock数据）

2. **状态转换**
   - Created -> Running（提交）
   - Running -> Completed（成功）
   - Running -> Failed（失败，罕见）

3. **结果生成**
   - 生成三方数据：原始、降尺度、观测
   - 计算完整的精度指标
   - 支持多维度分析

---

### 4.3 结果展示规则

1. **角色差异化**
   - 研究人员：技术指标（RMSE、MAE、R²、功率谱）
   - 决策者：应用指标（极端事件、置信区间）
   - 农业用户：农业指标（生长度日、霜冻预警）

2. **地图可视化**
   - 默认行业标准配色
   - 支持联动交互（同步缩放平移）
   - 观测数据双视图（点位/插值）

3. **数据导出限制**
   - 空间：≤ 100km × 100km
   - 时间：≤ 30天
   - 格式：CSV / GeoJSON / NetCDF

---

### 4.4 任务管理规则

1. **任务持久化**
   - 所有任务持久化存储
   - 配置不可修改
   - 支持查看历史任务

2. **任务对比**
   - 限定2个任务
   - 对比参数差异和精度指标
   - 并排展示地图结果

3. **任务列表**
   - 按创建时间倒序
   - 支持搜索和多维度筛选
   - 表格/卡片视图切换

---

## 5. 领域事件（可选扩展）

虽然Demo平台不需要复杂的事件驱动架构，但识别关键领域事件有助于理解业务流程：

### 潜在领域事件

1. **TaskCreated**（任务已创建）
   - 触发：用户提交任务
   - 数据：task_id, user_id, config
   - 后续：启动任务处理

2. **TaskCompleted**（任务已完成）
   - 触发：降尺度计算完成
   - 数据：task_id, result
   - 后续：通知用户，更新统计

3. **TaskComparisonRequested**（请求任务对比）
   - 触发：用户勾选2个任务并点击对比
   - 数据：task1_id, task2_id
   - 后续：生成对比视图

4. **DataExported**（数据已导出）
   - 触发：用户下载结果数据
   - 数据：task_id, export_config, file_size
   - 后续：记录导出历史

---

## 6. 技术约束与假设

### 6.1 Demo平台特性

1. **Mock数据**：不依赖真实气象数据集
2. **预计算结果**：不进行实时降尺度计算
3. **简化错误处理**：不考虑edge case
4. **快速响应**：2-3秒模拟处理

### 6.2 数据约束

1. **空间分辨率**：
   - 输入（原始数据）：10km
   - 输出（降尺度）：1km / 3km / 5km

2. **时间粒度**：
   - 历史模式：按日
   - 预测模式：按小时

3. **变量支持**：
   - 气温、风速风向、气压、降水

### 6.3 性能考虑

虽然是Demo，但设计时考虑：
1. **任务列表分页**：避免一次加载过多任务
2. **地图瓦片加载**：按需加载地图数据
3. **结果Tab懒加载**：切换Tab时才加载对应数据
4. **导出数据限制**：避免单次导出过大文件

---

**文档版本**：v1.0  
**创建时间**：基于平台设计方案完成的领域建模  
**用途**：指导Demo平台的架构设计和开发实现
