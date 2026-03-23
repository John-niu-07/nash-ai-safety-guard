#!/usr/bin/env node
/**
 * Nash Server - HTTP API 服务
 * 
 * 提供内容安全检查 API
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { NashGuard } = require('./nash');

// ============================================================================
// 配置
// ============================================================================

const CONFIG_FILE = path.join(__dirname, 'config', 'config.json');
const WEB_UI_DIR = path.join(__dirname, '..', 'web_ui');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'nash.log');

let config = {
    server: {
        host: '127.0.0.1',
        port: 8768
    }
};

// 加载配置
if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    console.log(`✅ 配置已加载：${CONFIG_FILE}`);
}

// 确保日志目录存在
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// ============================================================================
// 初始化 Nash Guard
// ============================================================================

const guard = new NashGuard(CONFIG_FILE);

// ============================================================================
// 创建 Express 应用
// ============================================================================

const app = express();

// 动态获取 Guard 实例（每次重新加载配置）
function getGuard() {
    return new NashGuard(CONFIG_FILE);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ============================================================================
// API 路由
// ============================================================================

// 健康检查
app.get('/health', (req, res) => {
    const guard = getGuard();
    res.json({
        status: 'ok',
        service: 'Nash',
        version: '1.0.0',
        ml_enabled: guard.config.ml_detection?.enabled || false
    });
});

// 检查接口
app.post('/check', async (req, res) => {
    const { user_id = 'unknown', content = '' } = req.body;
    
    if (!content || !content.trim()) {
        return res.json({
            error: 'content is required',
            allowed: true,
            blocked: false
        });
    }
    
    try {
        const guard = getGuard(); // 每次检测都使用最新配置
        const result = await guard.check(content, user_id);
        res.json(result);
    } catch (error) {
        console.error(`检查失败：${error.message}`);
        res.status(500).json({
            error: error.message,
            allowed: true,
            blocked: false
        });
    }
});

// 获取配置
app.get('/api/config', (req, res) => {
    res.json(config);
});

// 更新配置
app.post('/api/config', (req, res) => {
    const newConfig = req.body;
    
    try {
        // 合并配置
        config = { ...config, ...newConfig };
        
        // 保存配置
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
        
        console.log('✅ 配置已保存');
        res.json({ success: true, message: '配置已保存' });
    } catch (error) {
        console.error(`保存配置失败：${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取日志
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    
    try {
        if (fs.existsSync(LOG_FILE)) {
            const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').reverse();
            const recent = lines.slice(0, limit).filter(l => l.trim());
            res.json(recent);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取拦截日志
app.get('/api/blocked-logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const blockedLogFile = path.join(__dirname, '..', 'logs', 'blocked.jsonl');
    
    try {
        if (fs.existsSync(blockedLogFile)) {
            const lines = fs.readFileSync(blockedLogFile, 'utf-8').split('\n').reverse();
            const logs = [];
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        logs.push(JSON.parse(line));
                    } catch (e) {
                        // 跳过无效行
                    }
                }
                if (logs.length >= limit) break;
            }
            res.json(logs);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 清空拦截日志
app.delete('/api/blocked-logs', (req, res) => {
    const blockedLogFile = path.join(__dirname, '..', 'logs', 'blocked.jsonl');
    
    try {
        if (fs.existsSync(blockedLogFile)) {
            fs.unlinkSync(blockedLogFile);
        }
        res.json({ success: true, message: '日志已清空' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Web UI
app.get('/', (req, res) => {
    const indexFile = path.join(WEB_UI_DIR, 'index.html');
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.json({
            message: 'Nash API Server',
            endpoints: {
                'GET /health': '健康检查',
                'POST /check': '内容检查',
                'GET /api/config': '获取配置',
                'POST /api/config': '更新配置',
                'GET /api/logs': '获取日志'
            }
        });
    }
});

// 静态文件
app.use('/app.js', express.static(path.join(WEB_UI_DIR, 'app.js')));

// ============================================================================
// 启动服务器
// ============================================================================

const PORT = config.server?.port || 8768;
const HOST = config.server?.host || '127.0.0.1';

app.listen(PORT, HOST, () => {
    console.log(`\n🛡️  Nash Server 已启动`);
    console.log(`   地址：http://${HOST}:${PORT}`);
    console.log(`   Web UI: http://${HOST}:${PORT}`);
    console.log(`   健康检查：http://${HOST}:${PORT}/health`);
    console.log(`   检查接口：POST http://${HOST}:${PORT}/check`);
    console.log(`   按 Ctrl+C 停止\n`);
});
