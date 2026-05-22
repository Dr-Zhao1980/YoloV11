/**
 * 认证与系统管理路由模块
 */
import { randomUUID } from 'node:crypto';
import fs from 'fs';
import path from 'path';

// 简单 token 存储 (生产环境应使用 Redis/DB)
const tokens = new Map();

// 用户数据文件路径
let dataDir;

export function initAuth(app, __dirname) {
  dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // 初始化用户数据文件
  const usersFile = path.join(dataDir, 'users.json');
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([
      { id: 1, username: 'admin', password: 'admin123', nickname: '系统管理员', role: 'admin' }
    ], null, 2));
  }

  // 初始化设置文件
  const settingsFile = path.join(dataDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({
      systemName: '红砖墙病害智能检测系统',
      systemVersion: 'v1.0.0',
      modelVersion: 'YOLOv11-BrickWall-v1.0',
      confidenceThreshold: 0.35,
      enableHeatmap: true,
      enableAutoReport: true,
      storageType: '本地存储',
      cacheLimit: 500,
      cacheStrategy: 'LRU'
    }, null, 2));
  }

  // 初始化历史记录文件
  const historyFile = path.join(dataDir, 'history.json');
  if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify([], null, 2));
  }

  // 初始化日志文件
  const logsFile = path.join(dataDir, 'logs.json');
  if (!fs.existsSync(logsFile)) {
    fs.writeFileSync(logsFile, JSON.stringify([], null, 2));
  }

  // ==================== 认证中间件 ====================
  function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录，请先登录' });
    }
    const token = authHeader.slice(7);
    const user = tokens.get(token);
    if (!user) {
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
    }
    req.user = user;
    next();
  }

  // 可选认证：若携带有效 token 则填充 req.user，否则视为匿名继续
  function optionalAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const user = tokens.get(authHeader.slice(7));
      if (user) req.user = user;
    }
    next();
  }

  // ==================== 日志记录函数 ====================
  function addLog(entry) {
    const logsFile = path.join(dataDir, 'logs.json');
    const logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
    const logEntry = {
      id: logs.length + 1,
      logTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      ...entry
    };
    logs.unshift(logEntry);
    // 只保留最近 1000 条
    if (logs.length > 1000) logs.length = 1000;
    fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));
  }

  // ==================== 认证接口 ====================

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ code: 400, message: '用户名和密码不能为空', data: null });
    }

    const usersFile = path.join(dataDir, 'users.json');
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      addLog({
        username: username,
        logType: 'LOGIN',
        operation: `用户 ${username} 登录失败`,
        ipAddress: req.ip || req.connection.remoteAddress,
        status: 'fail',
        message: '用户名或密码错误',
        requestUrl: '/api/auth/login',
        requestMethod: 'POST'
      });
      return res.json({ code: 401, message: '用户名或密码错误', data: null });
    }

    const token = randomUUID();
    const userInfo = { id: user.id, username: user.username, nickname: user.nickname, role: user.role };
    tokens.set(token, userInfo);

    addLog({
      username: user.username,
      logType: 'LOGIN',
      operation: `用户 ${user.username} 登录成功`,
      ipAddress: req.ip || req.connection.remoteAddress,
      status: 'success',
      message: '登录成功',
      requestUrl: '/api/auth/login',
      requestMethod: 'POST'
    });

    res.json({
      code: 200,
      message: '登录成功',
      data: { token, userInfo }
    });
  });

  // ==================== 注册接口（公开，无需认证）====================

  app.post('/api/auth/register', (req, res) => {
    const { username, password, nickname } = req.body;

    // 基本校验
    if (!username || !password) {
      return res.json({ code: 400, message: '用户名和密码不能为空', data: null });
    }
    if (username.length < 3 || username.length > 20) {
      return res.json({ code: 400, message: '用户名长度需在 3~20 个字符之间', data: null });
    }
    if (password.length < 6) {
      return res.json({ code: 400, message: '密码长度不能少于 6 位', data: null });
    }
    // 禁止注册 admin 用户名
    if (username.toLowerCase() === 'admin') {
      return res.json({ code: 403, message: '该用户名不可注册', data: null });
    }

    const usersFile = path.join(dataDir, 'users.json');
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));

    // 用户名唯一性检查
    if (users.find(u => u.username === username)) {
      return res.json({ code: 409, message: '用户名已被占用，请换一个', data: null });
    }

    // 创建新用户，角色固定为普通用户
    const newUser = {
      id: users.length + 1,
      username,
      password,
      nickname: nickname?.trim() || username,
      role: 'user'
    };
    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    // 注册后自动登录，颁发 token
    const token = randomUUID();
    const userInfo = { id: newUser.id, username: newUser.username, nickname: newUser.nickname, role: newUser.role };
    tokens.set(token, userInfo);

    addLog({
      username: newUser.username,
      logType: 'LOGIN',
      operation: `新用户 ${newUser.username} 注册成功`,
      ipAddress: req.ip || req.connection.remoteAddress,
      status: 'success',
      message: '注册并登录成功',
      requestUrl: '/api/auth/register',
      requestMethod: 'POST'
    });

    res.json({
      code: 200,
      message: '注册成功',
      data: { token, userInfo }
    });
  });

  app.post('/api/auth/logout', authMiddleware, (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.slice(7);
    
    addLog({
      username: req.user.username,
      logType: 'LOGIN',
      operation: `用户 ${req.user.username} 退出登录`,
      ipAddress: req.ip || req.connection.remoteAddress,
      status: 'success',
      message: '退出成功',
      requestUrl: '/api/auth/logout',
      requestMethod: 'POST'
    });

    tokens.delete(token);
    res.json({ code: 200, message: '退出成功', data: null });
  });

  app.get('/api/auth/user-info', authMiddleware, (req, res) => {
    res.json({ code: 200, message: '查询成功', data: req.user });
  });

  // ==================== 历史记录接口 ====================

  app.get('/api/detection/history', authMiddleware, (req, res) => {
    const { projectName, diseaseType, status, startTime, endTime, pageNum = 1, pageSize = 10 } = req.query;
    const historyFile = path.join(dataDir, 'history.json');
    let records = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));

    // 过滤
    if (projectName) {
      records = records.filter(r => r.projectName && r.projectName.includes(projectName));
    }
    if (diseaseType) {
      records = records.filter(r => r.diseaseTypes && r.diseaseTypes.includes(diseaseType));
    }
    if (status) {
      records = records.filter(r => r.status === status);
    }
    if (startTime) {
      records = records.filter(r => r.detectTime >= startTime);
    }
    if (endTime) {
      records = records.filter(r => r.detectTime <= endTime + ' 23:59:59');
    }

    const total = records.length;
    const start = (Number(pageNum) - 1) * Number(pageSize);
    const list = records.slice(start, start + Number(pageSize));

    res.json({
      code: 200,
      message: '查询成功',
      data: { list, total, pageNum: Number(pageNum), pageSize: Number(pageSize) }
    });
  });

  app.get('/api/detection/history/:id', authMiddleware, (req, res) => {
    const historyFile = path.join(dataDir, 'history.json');
    const records = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    const record = records.find(r => String(r.id) === String(req.params.id));
    if (!record) {
      return res.json({ code: 404, message: '记录不存在', data: null });
    }
    res.json({ code: 200, message: '查询成功', data: record });
  });

  app.delete('/api/detection/history/:id', authMiddleware, (req, res) => {
    const historyFile = path.join(dataDir, 'history.json');
    let records = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    const idx = records.findIndex(r => String(r.id) === String(req.params.id));
    if (idx === -1) {
      return res.json({ code: 404, message: '记录不存在', data: null });
    }
    records.splice(idx, 1);
    fs.writeFileSync(historyFile, JSON.stringify(records, null, 2));

    addLog({
      username: req.user.username,
      logType: 'DETECTION',
      operation: `删除检测记录 #${req.params.id}`,
      ipAddress: req.ip || req.connection.remoteAddress,
      status: 'success',
      message: '删除成功',
      requestUrl: `/api/detection/history/${req.params.id}`,
      requestMethod: 'DELETE'
    });

    res.json({ code: 200, message: '删除成功', data: null });
  });

  app.post('/api/detection/history/:id/report', authMiddleware, (req, res) => {
    const historyFile = path.join(dataDir, 'history.json');
    const records = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    const record = records.find(r => String(r.id) === String(req.params.id));
    if (!record) {
      return res.json({ code: 404, message: '记录不存在', data: null });
    }
    if (record.reportUrl) {
      return res.json({ code: 200, message: '报告已生成', data: { reportUrl: record.reportUrl } });
    }
    res.json({ code: 200, message: '报告生成中，请稍后', data: { reportUrl: null } });
  });

  // ==================== 系统日志接口 ====================

  app.get('/api/system/logs', authMiddleware, (req, res) => {
    const { username, logType, status, startTime, endTime, pageNum = 1, pageSize = 10 } = req.query;
    const logsFile = path.join(dataDir, 'logs.json');
    let logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));

    if (username) {
      logs = logs.filter(l => l.username && l.username.includes(username));
    }
    if (logType) {
      logs = logs.filter(l => l.logType === logType);
    }
    if (status) {
      logs = logs.filter(l => l.status === status);
    }
    if (startTime) {
      logs = logs.filter(l => l.logTime >= startTime);
    }
    if (endTime) {
      logs = logs.filter(l => l.logTime <= endTime + ' 23:59:59');
    }

    const total = logs.length;
    const start = (Number(pageNum) - 1) * Number(pageSize);
    const list = logs.slice(start, start + Number(pageSize));

    res.json({
      code: 200,
      message: '查询成功',
      data: { list, total, pageNum: Number(pageNum), pageSize: Number(pageSize) }
    });
  });

  app.get('/api/system/logs/:id', authMiddleware, (req, res) => {
    const logsFile = path.join(dataDir, 'logs.json');
    const logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
    const log = logs.find(l => String(l.id) === String(req.params.id));
    if (!log) {
      return res.json({ code: 404, message: '日志不存在', data: null });
    }
    res.json({ code: 200, message: '查询成功', data: log });
  });

  app.delete('/api/system/logs', authMiddleware, (req, res) => {
    const logsFile = path.join(dataDir, 'logs.json');
    fs.writeFileSync(logsFile, JSON.stringify([], null, 2));
    res.json({ code: 200, message: '日志已清空', data: null });
  });

  app.get('/api/system/dict/log-types', authMiddleware, (req, res) => {
    res.json({
      code: 200,
      message: '查询成功',
      data: [
        { label: '登录日志', value: 'LOGIN' },
        { label: '检测日志', value: 'DETECTION' },
        { label: '系统日志', value: 'SYSTEM' },
        { label: '导出日志', value: 'EXPORT' }
      ]
    });
  });

  // ==================== 系统设置接口 ====================

  app.get('/api/system/settings', authMiddleware, (req, res) => {
    const settingsFile = path.join(dataDir, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    res.json({ code: 200, message: '查询成功', data: settings });
  });

  app.put('/api/system/settings', authMiddleware, (req, res) => {
    const settingsFile = path.join(dataDir, 'settings.json');
    const newSettings = req.body;
    fs.writeFileSync(settingsFile, JSON.stringify(newSettings, null, 2));

    addLog({
      username: req.user.username,
      logType: 'SYSTEM',
      operation: '修改系统设置',
      ipAddress: req.ip || req.connection.remoteAddress,
      status: 'success',
      message: '系统设置已保存',
      requestUrl: '/api/system/settings',
      requestMethod: 'PUT'
    });

    res.json({ code: 200, message: '保存成功', data: null });
  });

  app.post('/api/system/settings/reset', authMiddleware, (req, res) => {
    const settingsFile = path.join(dataDir, 'settings.json');
    const defaultSettings = {
      systemName: '红砖墙病害智能检测系统',
      systemVersion: 'v1.0.0',
      modelVersion: 'YOLOv11-BrickWall-v1.0',
      confidenceThreshold: 0.35,
      enableHeatmap: true,
      enableAutoReport: true,
      storageType: '本地存储',
      cacheLimit: 500,
      cacheStrategy: 'LRU'
    };
    fs.writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));

    addLog({
      username: req.user.username,
      logType: 'SYSTEM',
      operation: '重置系统设置为默认值',
      ipAddress: req.ip || req.connection.remoteAddress,
      status: 'success',
      message: '设置已恢复默认',
      requestUrl: '/api/system/settings/reset',
      requestMethod: 'POST'
    });

    res.json({ code: 200, message: '设置已恢复默认', data: null });
  });

  app.get('/api/system/model-options', authMiddleware, (req, res) => {
    res.json({
      code: 200,
      message: '查询成功',
      data: [
        { label: 'YOLOv11-BrickWall-v1.0 (本地)', value: 'YOLOv11-BrickWall-v1.0' }
      ]
    });
  });

  app.get('/api/system/cache-strategies', authMiddleware, (req, res) => {
    res.json({
      code: 200,
      message: '查询成功',
      data: [
        { label: 'LRU (最近最少使用)', value: 'LRU' },
        { label: 'FIFO (先进先出)', value: 'FIFO' },
        { label: 'LFU (最不经常使用)', value: 'LFU' }
      ]
    });
  });

  app.post('/api/system/cache/clear', authMiddleware, (req, res) => {
    addLog({
      username: req.user.username,
      logType: 'SYSTEM',
      operation: '清除系统缓存',
      ipAddress: req.ip || req.connection.remoteAddress,
      status: 'success',
      message: '缓存已清除',
      requestUrl: '/api/system/cache/clear',
      requestMethod: 'POST'
    });
    res.json({ code: 200, message: '缓存已清除', data: null });
  });

  app.get('/api/system/status', authMiddleware, (req, res) => {
    // 检测 Python 模型服务是否可用
    const modelConnected = fs.existsSync(path.join(dataDir, 'model_ready.flag'));
    res.json({
      code: 200,
      message: '查询成功',
      data: {
        serverStatus: 'running',
        modelStatus: modelConnected ? 'connected' : 'disconnected',
        databaseStatus: 'connected',
        lastUpdateTime: new Date().toISOString().replace('T', ' ').slice(0, 19)
      }
    });
  });

  // 导出供检测接口使用的函数
  return { authMiddleware, optionalAuth, addLog, addHistoryRecord };
}

// 添加历史记录
function addHistoryRecord(record) {
  const historyFile = path.join(dataDir, 'history.json');
  const records = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  const newRecord = {
    id: records.length + 1,
    recordNo: `DET-${Date.now()}`,
    detectTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
    status: 'completed',
    ...record
  };
  records.unshift(newRecord);
  fs.writeFileSync(historyFile, JSON.stringify(records, null, 2));
  return newRecord;
}
