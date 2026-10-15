# 基础镜像境内化：默认走国内镜像仓库（DaoCloud）；海外构建用
#   docker build --build-arg NODE_IMAGE=node:22-slim ...
# 覆盖回官方 Docker Hub。运行时=Node（弃 Bun），包管理=pnpm（corepack 按 package.json
# 的 packageManager 字段拉取对应版本）。
ARG NODE_IMAGE=docker.m.daocloud.io/library/node:22-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app
# Node ≥22 自带 corepack；启用后 `pnpm` 即按 packageManager 锁定版本，可复现。
# corepack 拉 pnpm tarball 只认 COREPACK_NPM_REGISTRY（不吃 .npmrc），指 npmmirror 与
# 依赖 registry 同镜像源——否则境内构建首跑即卡在 registry.npmjs.org 解析失败。
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# 依赖安装层（先只拷清单文件以充分利用构建缓存；isolated 布局需 workspace 清单）
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY libs/core/package.json ./libs/core/
# pnpm store 挂 cache 加速；allowBuilds 放行 @swc/core/esbuild 原生二进制（pnpm-workspace.yaml）
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 构建层：先编 libs/core（独立成包产 dist），再编 apps（nest build --builder swc）
FROM dependencies AS builder
COPY . .
RUN pnpm run build

# 生产层：只带运行时必需的东西——corepack/pnpm 与 `drizzle.config.ts` **不在产物镜像里保留**：
# drizzle.config 的 schema 指 `apps/api/src/**.ts` 源文件，而本层无 TS 源，容器内迁移本就
# 跑不通（迁移在运维机/CI 上跑）——留着只是不可用的死面，删净以免误导。
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production
# 容器语义的监听默认：代码侧 `HOST` 缺省为 `localhost`（宿主开发语义），而容器内只绑回环会使
# `-p` 发布端口无进程监听，对外不可达（经代理转发时为 502、经 iptables 转发时为连接被重置，
# 且应用日志零请求记录）。镜像默认取 `0.0.0.0`——容器内的回环不具防护价值，对外边界由
# 端口发布 / 网络策略决定。
# 宿主 `pnpm run start:*` 不经本层，仍读 `.env` 的 `HOST=localhost`，两者互不影响。
ENV HOST=0.0.0.0
WORKDIR /app

# 复制产物与依赖：
#   - node_modules（含 workspace 链 @core/saas-kit → ../libs/core 的符号链接）
#   - dist（app 编译产物，保留裸包句柄 @core/saas-kit/…）
#   - libs/core/dist（句柄经 exports 落此，运行时解析目标）
#   - 根与两包 package.json + pnpm-workspace.yaml（保证符号链接与 exports 可解析）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/libs/core/dist ./libs/core/dist
COPY --from=builder /app/libs/core/package.json ./libs/core/package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# 健康检查：node:slim 镜像**无 wget/curl**（实机核验二者皆 MISSING），沿用 Bun 时代的
# wget 探针会使容器永远 unhealthy——改用镜像内必有的 node 内置 fetch（零额外 apt 层）。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7009/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 暴露端口
EXPOSE 7009

# 启动命令：直接 node 编译产物（start:prod 等价路径）
CMD ["node", "dist/apps/api/src/main.js"]
