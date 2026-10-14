// libs/core 公共出口（§9.5.4③ git workspace 占位名·暂不发 npm）。
// 目前仅稳定再导出框架无关 shared-kernel（domain/CQRS 基类）；
// tenancy / modules 的能力经 @core/* 路径别名按子路径消费（装配根在参考应用）。
export * from './shared-kernel';
