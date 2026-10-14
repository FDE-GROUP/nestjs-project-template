// 环境变量装载（须作为入口第一个副作用 import）：
// Node ESM 静态 import 全部提升先于 main.ts 主体语句执行，而 `config/envs/*.ts` 是
// 顶层对象字面量、在**被 import 时**即读取 `process.env`；若 `dotenv.config()` 留在
// main.ts 主体（import 之后），则 envs 求值时环境尚未注入 → 全部走默认值（Bun 会先自动
// 载 .env，故掩盖）。把 dotenv 抽成独立模块并置于入口首个 import，保证按依赖顺序先执行
// 注入，再评估 config 链——跨运行时（node/bun）一致。
import * as dotenv from 'dotenv';

dotenv.config();
