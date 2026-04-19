# SilverCompanion 设备数据标准字段表

| 中文名 | JSON 路径 | 类型 | 单位 | 采样粒度 | 示例值 | 前端用途 | Agent 用途 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 心率 | `health.metrics.heartRate[].value` | `number` | `bpm` | 小时级 | `73` | 健康趋势图、首页总览、风险提醒 | 判断心率异常、和睡眠/情绪联动解释 |
| 血氧 | `health.metrics.bloodOxygen[].value` | `number` | `%` | 小时级 | `98` | 健康趋势图、首页总览、风险提醒 | 判断呼吸相关波动、辅助健康解释 |
| 睡眠时长 | `health.metrics.sleep[].durationHours` | `number` | `h` | 天级 | `7.6` | 睡眠卡片、趋势图、首页总览 | 判断休息质量、解释疲惫或表达欲下降 |
| 深睡时长 | `health.metrics.sleep[].deepHours` | `number` | `h` | 天级 | `2.2` | 睡眠详情文案 | 辅助判断恢复度 |
| 夜醒次数 | `health.metrics.sleep[].wakeCount` | `number` | `次` | 天级 | `1` | 睡眠卡片副文案 | 辅助判断睡眠波动 |
| 步数 | `health.metrics.activity[].steps` | `number` | `步` | 天级 | `6200` | 活动卡片、趋势图、首页总览 | 判断活动量变化 |
| 活动分钟 | `health.metrics.activity[].activeMinutes` | `number` | `分钟` | 天级 | `58` | 活动卡片副文案 | 辅助解释活动节奏 |
| 静止时长 | `health.metrics.stillDuration[].minutes` | `number` | `分钟` | 天级 | `126` | 久静趋势图、风险提醒、首页总览 | 判断久静风险、提示轻活动建议 |
| 压力值 | `health.metrics.stress[].value` | `number` | `分` | 天级 | `56` | 压力趋势图、风险提醒、首页总览 | 判断紧张趋势、指导陪伴语气 |
| 血压收缩压 | `health.metrics.bloodPressure[].systolic` | `number` | `mmHg` | 天级 | `124` | 血压卡片、趋势图 | 判断健康波动 |
| 血压舒张压 | `health.metrics.bloodPressure[].diastolic` | `number` | `mmHg` | 天级 | `78` | 血压卡片、趋势图 | 辅助健康解释 |
| 血糖值 | `health.metrics.bloodSugar[].value` | `number` | `mmol/L` | 天级 | `6.8` | 血糖趋势图、风险提醒、首页总览 | 判断血糖波动趋势，不输出医疗诊断 |
| 血糖采样类型 | `health.metrics.bloodSugar[].period` | `'fasting' \| 'postprandial' \| 'random'` | `-` | 天级 | `postprandial` | 血糖卡片副文案 | 选择正确阈值做趋势提醒 |
| 设备电量 | `health.device.battery` | `number` | `%` | 当前状态 | `72` | 设备状态区、低电提醒 | 判断守护连续性 |
| 连接状态 | `health.device.connected` | `boolean` | `-` | 当前状态 | `true` | 设备状态区、同步异常提醒 | 判断设备链路是否可信 |
| 真正佩戴状态 | `health.device.wearStatus` | `'worn' \| 'removed' \| 'unknown'` | `-` | 当前状态 | `worn` | 设备状态区、未佩戴提醒 | 判断监测数据是否连续可信 |
| 是否正在佩戴 | `health.device.isWorn` | `boolean \| null` | `-` | 当前状态 | `true` | 设备状态区补充状态 | 给 Agent 一个更直接的布尔判断 |
| 佩戴状态更新时间 | `health.device.wearStatusUpdatedAt` | `string` | `ISO 8601` | 当前状态 | `2026-04-16T09:20:00.000Z` | 设备状态区 | 判断未佩戴是否为持续状态 |
| 最后同步时间 | `health.device.lastSyncAt` | `string` | `ISO 8601` | 当前状态 | `2026-04-16T09:25:00.000Z` | 设备状态区、同步异常提醒 | 判断数据新鲜度 |
| 位置 | `health.device.locationName` | `string` | `-` | 当前状态 | `徐汇社区花园` | 设备状态区 | 给家属摘要提供位置上下文 |
| GPS 状态 | `health.device.gpsStatus` | `string` | `-` | 当前状态 | `normal` | 设备状态区 | 判断定位可信度 |
| SOS 状态 | `health.device.sosEnabled` | `boolean` | `-` | 当前状态 | `true` | 设备状态区 | 判断平安圈能力是否可用 |

## 说明

- `health.latestMetrics` 是页面与 Agent 共用的最新聚合视图，来源于以上原始字段，不替代原始时序数据。
- `AppData/SilverCompanion/elder_demo/health.json` 仍是本地演示数据源；真实设备接入时应优先兼容本表字段名与单位。
- 血糖与压力值在当前版本只用于趋势提醒和陪伴策略，不输出医疗诊断结论。
