# 基础镜像境内化：默认走国内镜像仓库（DaoCloud）；海外构建用
#   docker build --build-arg NODE_IMAGE=node:22-slim ...
# 覆盖回官方 Docker Hub。运行时=Node（弃 Bun），包管理=pnpm（corepack 按 package.json
# 的 packageManager 字段拉取对应版本）。
ARG NODE_IMAGE=docker.m.daocloud.io/library/node:22-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app
# Node ≥22 自带 corepack；启用后 `pnpm` 即按 packageManager 锁定版本，可复现。
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

# 生产层
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable

# 复制产物与依赖：
#   - node_modules（含 workspace 链 @core/saas-kit → ../libs/core 的符号链接）
#   - dist（app 编译产物，保留裸包句柄 @core/saas-kit/…）
#   - libs/core/dist（句柄经 exports 落此，运行时解析目标）
#   - 各包 package.json / workspace / lock / npmrc（保证符号链接与 exports 可解析）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/libs/core/dist ./libs/core/dist
COPY --from=builder /app/libs/core/package.json ./libs/core/package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/drizzle.config.ts ./

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:7009/api/v1/health || exit 1

# 暴露端口
EXPOSE 7009

# 启动命令：直接 node 编译产物（start:prod 等价路径）
CMD ["node", "dist/apps/api/src/main.js"]
