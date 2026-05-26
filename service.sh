#!/usr/bin/env bash
# ============================================================
#  Brick Wall Detector — 交互式服务控制面板
#  使用方式: ./service.sh
#
#  目录约定（全栈结构）:
#    backend/server.js    Node + Express API + 静态托管
#    frontend/            Vue 3 + Vite 前端源码
#    dist/                vite build 输出，由 backend 直接 serve
#    logs/                所有运行日志和调试日志
#    backend/uploads/     上传文件 (single/, panoramas/, tiles/)
#    backend/data/        立面任务持久化 JSON
# ============================================================

# ---------- Config ----------
APP_NAME="brick-wall-detector"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 自动定位 brick-wall-detector 项目目录：
#   1) 与脚本同目录下有 backend/server.js → 即项目根
#   2) 与脚本同目录下有 brick-wall-detector/backend/server.js → 进入子目录
#   3) 否则报错退出
if [ -f "$SCRIPT_DIR/backend/server.js" ]; then
  APP_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/brick-wall-detector/backend/server.js" ]; then
  APP_DIR="$SCRIPT_DIR/brick-wall-detector"
else
  echo "[ERROR] 找不到 brick-wall-detector 项目目录（缺少 backend/server.js）"
  echo "        脚本位置: $SCRIPT_DIR"
  exit 1
fi
ENTRY="backend/server.js"
PORT="${PORT:-3080}"

LOG_DIR="$APP_DIR/logs"
PID_FILE="$LOG_DIR/$APP_NAME.pid"
LOG_FILE="$LOG_DIR/server.log"
DEBUG_PID_FILE="$LOG_DIR/$APP_NAME.debug.pid"

mkdir -p "$LOG_DIR"

# ---------- Colors ----------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }
debug() { echo -e "${MAGENTA}[DEBUG]${NC} $*"; }

# ---------- Helpers ----------
get_pid() {
  [ -f "$PID_FILE" ] && cat "$PID_FILE" 2>/dev/null || true
}

get_debug_pid() {
  [ -f "$DEBUG_PID_FILE" ] && cat "$DEBUG_PID_FILE" 2>/dev/null || true
}

is_running() {
  local pid
  pid=$(get_pid)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

is_debug_running() {
  local pid
  pid=$(get_debug_pid)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

port_pid() {
  local pid
  # 方法1: lsof（标准但需要权限，root 进程可能不可见）
  pid=$(lsof -t -i:"$PORT" 2>/dev/null | head -1)
  [ -n "$pid" ] && echo "$pid" && return
  # 方法2: fuser
  pid=$(fuser "${PORT}/tcp" 2>/dev/null | tr -d ' \t')
  [ -n "$pid" ] && echo "$pid" && return
  # 方法3: ss（Linux，解析 pid=xxx）
  pid=$(ss -tlnp 2>/dev/null | grep -E ":${PORT}[[:space:]]" | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$pid" ] && echo "$pid" && return
  # 方法4: nc 探活——有进程但无法取 PID（可能是 root 进程）
  if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then echo "unknown"; fi
}

# 强制释放端口（多种方式）
free_port() {
  local pids
  pids=$(lsof -t -i:"$PORT" 2>/dev/null)
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.8; return
  fi
  pids=$(fuser "${PORT}/tcp" 2>/dev/null)
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.8; return
  fi
  # 精确匹配当前项目的 server.js
  pkill -9 -f "${APP_DIR}/backend/server.js" 2>/dev/null || true
  pkill -9 -f "node.*server\.js" 2>/dev/null || true
  sleep 0.5
  # 若端口仍被占用（root 进程），尝试 sudo
  if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    warn "进程可能以 root 运行，尝试 sudo 清理..."
    sudo pkill -9 -f "${APP_DIR}/backend/server.js" 2>/dev/null || true
    sudo pkill -9 -f "node.*server\.js" 2>/dev/null || true
    sleep 0.8
  fi
}

ensure_dist() {
  if [ ! -d "$APP_DIR/dist" ] || [ -z "$(ls -A "$APP_DIR/dist" 2>/dev/null)" ]; then
    info "未发现前端构建产物 dist/，正在自动 vite build..."
    cmd_build || return 1
  fi
}

pause() {
  echo ""
  read -n 1 -s -r -p "按任意键返回主菜单..."
  echo ""
}

# ---------- Commands ----------
cmd_start() {
  if is_running; then
    warn "$APP_NAME 已经在运行中了，不需要重复启动哦。"
    return 0
  fi
  if is_debug_running; then
    warn "调试模式正在运行（PID $(get_debug_pid)）。请先在菜单【7】停止调试模式。"
    return 1
  fi

  local existing
  existing=$(port_pid)
  if [ -n "$existing" ]; then
    if [ "$existing" = "unknown" ]; then
      warn "端口 $PORT 已被占用（无法获取 PID，可能是 root 进程或权限不足）"
    else
      warn "端口 $PORT 被进程 $existing 占用"
    fi
    read -r -p "  ⚡ 是否强制清理并继续？[Y/n]: " yn
    case "${yn:-Y}" in [Yy]*) free_port ;; *) info "已取消"; return 1 ;; esac
    # 确认端口已释放
    existing=$(port_pid)
    if [ -n "$existing" ]; then
      err "端口 $PORT 清理失败，仍被占用。请手动处理后重试。"
      return 1
    fi
  fi

  ensure_dist || return 1

  info "正在启动生产服务 (端口 $PORT)..."
  cd "$APP_DIR" || return 1

  nohup setsid env NODE_ENV=production PORT="$PORT" node "$ENTRY" \
    >> "$LOG_FILE" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  local i=0
  while [ $i -lt 20 ]; do
    sleep 0.5
    if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
      ok "服务启动成功！日志: $LOG_FILE"
      return 0
    fi
    i=$((i + 1))
  done

  err "启动超时或失败，请使用菜单【5】查看日志排查。"
  return 1
}

cmd_start_debug() {
  if is_debug_running; then
    warn "调试模式已在运行（PID $(get_debug_pid)）。"
    return 0
  fi
  if is_running; then
    warn "生产模式正在运行。请先在菜单【2】停止生产服务，再启动调试模式。"
    return 1
  fi

  local existing
  existing=$(port_pid)
  if [ -n "$existing" ]; then
    if [ "$existing" = "unknown" ]; then
      warn "端口 $PORT 已被占用（无法获取 PID，可能是 root 进程或权限不足）"
    else
      warn "端口 $PORT 被进程 $existing 占用"
    fi
    read -r -p "  ⚡ 是否强制清理并继续启动调试模式？[Y/n]: " yn
    case "${yn:-Y}" in [Yy]*) free_port ;; *) info "已取消"; return 1 ;; esac
    existing=$(port_pid)
    if [ -n "$existing" ]; then
      err "端口 $PORT 清理失败，仍被占用。请手动处理后重试。"
      return 1
    fi
    ok "端口 $PORT 已释放，继续启动调试模式..."
  fi

  ensure_dist || return 1

  local TS=$(date +%Y%m%d-%H%M%S)
  local DBG_LOG="$LOG_DIR/debug-${TS}.log"
  ln -sfn "$DBG_LOG" "$LOG_DIR/debug-latest.log"

  debug "===== 调试模式启动 ====="
  debug "日志输出: $DBG_LOG"
  debug "快捷链接: $LOG_DIR/debug-latest.log"
  debug "环境变量: DEBUG_MODE=1, NODE_ENV=development, --trace-warnings"
  debug "──────────────────────────────────────────────"

  cd "$APP_DIR" || return 1

  nohup setsid env \
    NODE_ENV=development \
    DEBUG_MODE=1 \
    NODE_OPTIONS="--trace-warnings --unhandled-rejections=strict" \
    PORT="$PORT" \
    node "$ENTRY" \
    >> "$DBG_LOG" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" > "$DEBUG_PID_FILE"

  local i=0
  while [ $i -lt 20 ]; do
    sleep 0.5
    if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
      ok "调试模式启动成功！PID=$pid"
      ok "实时日志: tail -f $DBG_LOG"
      ok "或在主菜单选择【8】实时查看调试日志"
      return 0
    fi
    i=$((i + 1))
  done

  err "调试服务启动失败，请查看日志: $DBG_LOG"
  tail -n 30 "$DBG_LOG"
  return 1
}

cmd_stop() {
  local stopped=0

  local pid
  pid=$(get_pid)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    info "正在关闭生产服务 (PID $pid)..."
    kill "$pid" 2>/dev/null || true
    local i=0
    while [ $i -lt 10 ] && kill -0 "$pid" 2>/dev/null; do
      sleep 0.3; i=$((i + 1))
    done
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    ok "生产服务已停止"
    stopped=1
  fi

  local dpid
  dpid=$(get_debug_pid)
  if [ -n "$dpid" ] && kill -0 "$dpid" 2>/dev/null; then
    info "正在关闭调试服务 (PID $dpid)..."
    kill "$dpid" 2>/dev/null || true
    local i=0
    while [ $i -lt 10 ] && kill -0 "$dpid" 2>/dev/null; do
      sleep 0.3; i=$((i + 1))
    done
    kill -9 "$dpid" 2>/dev/null || true
    rm -f "$DEBUG_PID_FILE"
    ok "调试服务已停止"
    stopped=1
  fi

  # fallback: 占用端口的野进程
  local rogue
  rogue=$(port_pid)
  if [ -n "$rogue" ]; then
    warn "端口 $PORT 仍被进程 $rogue 占用，正在强制清理..."
    kill -9 "$rogue" 2>/dev/null || true
    stopped=1
  fi

  [ $stopped -eq 0 ] && warn "没有正在运行的服务"
  return 0
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  echo -e "\n${CYAN}====== 当前系统状态 ======${NC}"

  if is_running; then
    local pid stats cpu mem uptime
    pid=$(get_pid)
    stats=$(ps -p "$pid" -o %cpu=,%mem=,etime= 2>/dev/null)
    cpu=$(echo "$stats" | awk '{print $1}')
    mem=$(echo "$stats" | awk '{print $2}')
    uptime=$(echo "$stats" | awk '{print $3}')
    echo -e "🟢 ${GREEN}生产模式${NC} : 运行中"
    echo -e "   PID=$pid · CPU=${cpu}% · MEM=${mem}% · 已运行=$uptime"
  else
    echo -e "🔴 ${RED}生产模式${NC} : 未运行"
  fi

  if is_debug_running; then
    local dpid
    dpid=$(get_debug_pid)
    echo -e "🟣 ${MAGENTA}调试模式${NC} : 运行中 (PID=$dpid)"
    echo -e "   实时日志: $LOG_DIR/debug-latest.log"
  else
    echo -e "⚪ ${YELLOW}调试模式${NC} : 未运行"
  fi

  echo -e "🌐 ${BLUE}访问地址${NC} : http://localhost:$PORT"
  echo -e "📂 ${BLUE}日志目录${NC} : $LOG_DIR"

  local rogue
  rogue=$(port_pid)
  if [ -n "$rogue" ] && ! is_running && ! is_debug_running; then
    echo -e "⚠️  ${RED}异常警告${NC} : 端口 $PORT 被未知进程 $rogue 占用！"
    echo -e "   👉 解决: 在主菜单选【2】强制清理"
  fi
  echo -e "${CYAN}==========================${NC}"
}

cmd_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    warn "暂无生产日志文件 ($LOG_FILE)"
    return 1
  fi
  info "实时滚动显示生产日志（Ctrl+C 退出）"
  echo "------------------------------------------------"
  trap 'echo -e "\n${YELLOW}>> 已退出日志查看${NC}"' SIGINT
  tail -n 100 -f "$LOG_FILE"
  trap - SIGINT
}

cmd_debug_logs() {
  local latest="$LOG_DIR/debug-latest.log"
  if [ ! -L "$latest" ] && [ ! -f "$latest" ]; then
    latest=$(ls -t "$LOG_DIR"/debug-*.log 2>/dev/null | head -1)
  fi
  if [ -z "$latest" ] || [ ! -e "$latest" ]; then
    warn "暂无调试日志文件。请先在菜单【7】启动调试模式。"
    return 1
  fi
  local lines
  lines=$(wc -l < "$latest" 2>/dev/null || echo 0)
  info "实时滚动显示调试日志 ($lines 行): $latest"
  info "内容: 请求方法/路径/状态码/耗时 · 切片推理过程 · 错误堆栈"
  echo "------------------------------------------------"
  echo -e "${YELLOW}[提示] 按 Ctrl+C 退出日志查看${NC}"
  echo "------------------------------------------------"
  trap 'echo -e "\n${YELLOW}>> 已退出日志查看${NC}"' SIGINT
  # 首次显示最后 300 行，然后持续追踪新增内容
  tail -n 300 -f "$latest"
  trap - SIGINT
}

cmd_build() {
  info "正在重新打包前端 (vite build --config frontend/vite.config.ts)..."
  cd "$APP_DIR" || return 1
  npx vite build --config frontend/vite.config.ts
  if [ $? -eq 0 ]; then
    ok "构建完成！dist/ 已更新"
  else
    err "构建失败"
    return 1
  fi
}

cmd_clean_logs() {
  info "正在清理 $LOG_DIR 下的旧调试日志..."
  find "$LOG_DIR" -name "debug-*.log" -type f -mtime +3 -delete 2>/dev/null
  ok "已清理 3 天前的调试日志"
  ls -lh "$LOG_DIR" 2>/dev/null
}

# ---------- Interactive Menu ----------
show_menu() {
  clear
  echo -e "${CYAN}============================================================${NC}"
  echo -e "${GREEN}             Brick Wall Detector — 服务控制面板             ${NC}"
  echo -e "${CYAN}============================================================${NC}"
  echo -e "  ${YELLOW}1.${NC} 🚀 启动生产服务   (Production)"
  echo -e "  ${YELLOW}2.${NC} ⏹️  停止所有服务   (Stop All)"
  echo -e "  ${YELLOW}3.${NC} 🔄 重启生产服务   (Restart)"
  echo -e "  ${YELLOW}4.${NC} 📊 查看系统状态   (Status)"
  echo -e "  ${YELLOW}5.${NC} 📝 查看生产日志   (Production Logs)"
  echo -e "  ${YELLOW}6.${NC} 🛠️  重新构建前端   (Build Frontend)"
  echo -e "  ${MAGENTA}7.${NC} 🐛 启动调试模式   (Debug Mode + 详细请求日志)"
  echo -e "  ${MAGENTA}8.${NC} 🔍 查看调试日志   (Debug Logs)"
  echo -e "  ${YELLOW}9.${NC} 🧹 清理旧调试日志 (>3 天)"
  echo -e "  ${YELLOW}0.${NC} 🚪 退出面板"
  echo -e "${CYAN}============================================================${NC}"
}

# 防止 Ctrl+C 直接退出脚本
trap 'echo -e "\n${YELLOW}提示: 请按 0 正规退出面板~${NC}"; sleep 1' SIGINT

while true; do
  show_menu
  read -r -p "👉 请输入数字 [0-9]: " choice
  echo ""

  case "$choice" in
    1) cmd_start ; pause ;;
    2) cmd_stop ; pause ;;
    3) cmd_restart ; pause ;;
    4) cmd_status ; pause ;;
    5) cmd_logs ; pause ;;
    6) cmd_build ; pause ;;
    7) cmd_start_debug ; pause ;;
    8) cmd_debug_logs ; pause ;;
    9) cmd_clean_logs ; pause ;;
    0)
      info "拜拜！已退出控制面板。"
      trap - SIGINT
      exit 0
      ;;
    *)
      err "请输入 0-9 之间的数字"
      sleep 1
      ;;
  esac
done
