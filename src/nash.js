/**
 * Nash - AI Safety Guard (Node.js 版本)
 * 
 * 检测越狱攻击和有害内容
 * 使用 HuggingFace Inference API 进行 ML 检测
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// HuggingFace Inference API (新路由)
const HF_API_URL = 'https://router.huggingface.co/models';

class NashGuard {
    constructor(configPath = null) {
        // 加载配置
        if (configPath && fs.existsSync(configPath)) {
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } else {
            this.config = this._getDefaultConfig();
        }
        
        this.compiledPatterns = {};
        this.hfToken = process.env.HUGGINGFACE_TOKEN || null;
        
        this._compilePatterns();
        
        // 测试 HF API 连接
        this._testHFAPI();
        
        this._log('Nash Guard 初始化完成');
    }
    
    _getDefaultConfig() {
        return {
            thresholds: {
                block_threshold: 0.3
            },
            risk_patterns: {},
            ml_detection: {
                enabled: false,
                model: 'martin-ha/toxic-comment-model'  // 默认有毒评论检测模型
            }
        };
    }
    
    _compilePatterns() {
        const patterns = this.config.risk_patterns || {};
        for (const [category, patternList] of Object.entries(patterns)) {
            this.compiledPatterns[category] = patternList.map(p => new RegExp(p, 'i'));
        }
    }
    
    async _testHFAPI() {
        // 测试 HF API 可用性
        const testModel = this.config.ml_detection?.model || 'martin-ha/toxic-comment-model';
        this._log(`ML 检测：使用 HuggingFace API - ${testModel}`);
        
        if (!this.hfToken) {
            this._log('⚠️  未设置 HUGGINGFACE_TOKEN，ML 检测可能受限');
            this._log('   获取 token: https://huggingface.co/settings/tokens');
        }
    }
    
    _checkPatterns(content) {
        const matched = [];
        
        for (const [category, patterns] of Object.entries(this.compiledPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(content)) {
                    matched.push(category);
                    break;
                }
            }
        }
        
        if (matched.length === 0) {
            return { matched: [], score: 0.0 };
        }
        
        // 计算分数：每个类别 0.3 分，最高 1.0
        const score = Math.min(matched.length * 0.3 + 0.2, 1.0);
        return { matched, score };
    }
    
    async _checkML(content) {
        const mlConfig = this.config.ml_detection || {};
        if (!mlConfig.enabled) {
            return { score: 0.0, prediction: 'safe' };
        }
        
        // 只对英文内容使用 ML 检测（模型是英文的）
        const isEnglish = /^[a-zA-Z\s\p{P}]+$/u.test(content);
        if (!isEnglish) {
            this._log(`  └─ ML 检测：跳过（非英文内容）`);
            return { score: 0.0, prediction: 'safe' };
        }
        
        const model = mlConfig.model || 'martin-ha/toxic-comment-model';
        
        try {
            const result = await this._callHFAPI(content, model);
            
            // 解析结果
            // HuggingFace 返回格式：[[{label: 'non-toxic', score: 0.99}, {label: 'toxic', score: 0.01}]]
            const predictions = Array.isArray(result[0]) ? result[0] : result;
            
            if (!Array.isArray(predictions) || predictions.length === 0) {
                this._log(`  └─ ML 检测：返回格式异常`);
                return { score: 0.0, prediction: 'safe' };
            }
            
            // 查找 toxic/unsafe 标签（排除 non-toxic 等否定标签）
            const toxicLabel = predictions.find(r => {
                const label = (r.label || '').toLowerCase();
                // 排除 "non-toxic" 等否定前缀
                if (label.startsWith('non-') || label.startsWith('not-') || label.startsWith('not_') || label.startsWith('non_')) {
                    return false;
                }
                return label.includes('toxic') || label.includes('unsafe') || label.includes('hate') || label.includes('threat');
            });
            
            if (toxicLabel && toxicLabel.score > (mlConfig.threshold || 0.85)) {
                this._log(`  └─ ML 检测：toxic score=${toxicLabel.score.toFixed(3)}`);
                return {
                    score: toxicLabel.score,
                    prediction: 'unsafe',
                    label: toxicLabel.label
                };
            }
            
            return { score: 0.0, prediction: 'safe', label: 'safe' };
            
        } catch (error) {
            this._log(`⚠️  ML 检测失败：${error.message}`);
            return { score: 0.0, prediction: 'safe' };
        }
    }
    
    _callHFAPI(content, model) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({ inputs: content });
            
            const options = {
                hostname: 'router.huggingface.co',
                path: `/hf-inference/models/${encodeURIComponent(model)}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    ...(this.hfToken ? { 'Authorization': `Bearer ${this.hfToken}` } : {})
                },
                timeout: 10000
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            resolve(JSON.parse(data));
                        } else if (res.statusCode === 503) {
                            // 模型正在加载，重试
                            this._log(`  └─ HF API: 模型加载中，稍后重试`);
                            setTimeout(() => {
                                this._callHFAPI(content, model).then(resolve).catch(reject);
                            }, 2000);
                        } else {
                            reject(new Error(`API 错误：${res.statusCode} - ${data}`));
                        }
                    } catch (e) {
                        reject(new Error(`解析失败：${e.message}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('请求超时'));
            });
            
            req.write(postData);
            req.end();
        });
    }
    
    async check(content, userId = 'unknown') {
        this._log(`检查 from=${userId}, len=${content.length}`);
        
        if (!content || !content.trim()) {
            return {
                allowed: true,
                blocked: false,
                message: '',
                risk_score: 0.0,
                detection_method: 'none'
            };
        }
        
        // 1. 模式匹配
        const patternResult = this._checkPatterns(content);
        
        // 2. ML 检测
        let mlResult = { score: 0.0, prediction: 'safe' };
        if (this.config.ml_detection?.enabled) {
            mlResult = await this._checkML(content);
        }
        
        // 3. Ollama 检测（如果启用）
        let ollamaResult = { score: 0.0, prediction: 'safe', reason: '' };
        if (this.config.ollama?.enabled) {
            ollamaResult = await this._checkOllama(content);
        }
        
        // 4. 综合评分
        let finalScore = 0.0;
        let detectionMethod = 'none';
        let blockedBy = null; // 记录被哪一层拦截
        
        if (patternResult.score > 0) {
            // 有模式匹配
            const mlWeight = this.config.ml_detection?.weight || 0.5;
            finalScore = patternResult.score * (1 - mlWeight) + mlResult.score * mlWeight;
            detectionMethod = 'pattern';
            blockedBy = { layer: 1, name: '模式匹配', category: patternResult.matched[0] };
        } else if (mlResult.score > 0) {
            // 只有 ML 检测
            finalScore = mlResult.score;
            detectionMethod = 'ml';
            blockedBy = { layer: 2, name: 'ML 模型', category: mlResult.label || 'toxic' };
        }
        
        // 5. 决策
        const threshold = this.config.thresholds?.block_threshold || 0.3;
        
        if (finalScore >= threshold) {
            const category = blockedBy?.category || 'unknown';
            this._log(`🚫 阻止 from=${userId}, category=${category}, score=${finalScore.toFixed(2)}, layer=${blockedBy?.name}`);
            
            // 记录拦截日志
            this._logBlocked(userId, content, finalScore, detectionMethod, blockedBy);
            
            return {
                allowed: false,
                blocked: true,
                message: '🚫 我无法处理这个请求。您的消息触发了安全策略。',
                risk_score: Math.round(finalScore * 100) / 100,
                detection_method: detectionMethod,
                matched_categories: patternResult.matched,
                ml_prediction: mlResult.prediction,
                blocked_by: blockedBy
            };
        }
        
        // 6. Ollama 第二层检查（如果第一层放行）
        if (this.config.ollama?.enabled && ollamaResult.prediction === 'unsafe') {
            this._log(`🚫 阻止 from=${userId}, category=ollama, score=${ollamaResult.score.toFixed(2)}, layer=Ollama`);
            
            // 记录拦截日志
            this._logBlocked(userId, content, ollamaResult.score, 'ollama', { layer: 3, name: 'Ollama', category: 'ollama' });
            
            return {
                allowed: false,
                blocked: true,
                message: '🚫 我无法处理这个请求。您的消息触发了安全策略。',
                risk_score: Math.round(ollamaResult.score * 100) / 100,
                detection_method: 'ollama',
                matched_categories: [],
                ml_prediction: 'safe',
                blocked_by: { layer: 3, name: 'Ollama', category: 'ollama' },
                ollama_reason: ollamaResult.reason
            };
        }
        
        this._log(`✅ 放行 from=${userId}, score=${finalScore.toFixed(2)}`);
        
        return {
            allowed: true,
            blocked: false,
            message: '',
            risk_score: Math.round(finalScore * 100) / 100,
            detection_method: detectionMethod,
            matched_categories: patternResult.matched,
            ml_prediction: mlResult.prediction,
            blocked_by: null
        };
    }
    
    _logBlocked(userId, content, score, method, blockedBy) {
        const entry = {
            timestamp: new Date().toISOString(),
            user_id: userId,
            content_preview: content.length > 50 ? content.substring(0, 50) + '...' : content,
            content_full: content,
            risk_score: Math.round(score * 100) / 100,
            detection_method: method,
            blocked_by: blockedBy,
            category: blockedBy?.category || 'unknown'
        };
        
        // 写入拦截日志文件
        const blockedLogFile = path.join(__dirname, '..', 'logs', 'blocked.jsonl');
        try {
            const dir = path.dirname(blockedLogFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.appendFileSync(blockedLogFile, JSON.stringify(entry) + '\n', 'utf-8');
        } catch (e) {
            this._log(`⚠️  写入拦截日志失败：${e.message}`);
        }
    }
    
    async _checkOllama(content) {
        const ollamaConfig = this.config.ollama || {};
        if (!ollamaConfig.enabled) {
            return { score: 0.0, prediction: 'safe', reason: '' };
        }
        
        const model = ollamaConfig.model || 'llama-guard3:1b';
        const host = ollamaConfig.host || 'http://localhost:11434';
        const threshold = ollamaConfig.threshold || 0.8;
        
        try {
            const result = await this._callOllamaAPI(content, model, host);
            
            if (result.unsafe && result.score >= threshold) {
                this._log(`  └─ Ollama 检测：unsafe score=${result.score.toFixed(3)}`);
                return {
                    score: result.score,
                    prediction: 'unsafe',
                    reason: result.reason || 'Ollama detected unsafe content'
                };
            }
            
            return { score: 0.0, prediction: 'safe', reason: result.reason || '' };
            
        } catch (error) {
            this._log(`⚠️  Ollama 检测失败：${error.message}`);
            return { score: 0.0, prediction: 'safe', reason: error.message };
        }
    }
    
    _callOllamaAPI(content, model, host) {
        const https = require('https');
        const http = require('http');
        
        return new Promise((resolve, reject) => {
            // Llama-Guard-3 提示词模板
            const prompt = `<|begin_of_text|><|start_header_id|>user<|end_header_id|>
Task: Check if the following content violates safety policies.

Content: ${content}

Question: Is this content safe?
Answer format: 
- Start with "Yes" (safe) or "No" (unsafe)
- If No, list violated categories

Categories:
- Violence and Physical Harm
- Sexual Content
- Criminal Planning
- Harassment and Bullying
- Self-Harm
- Political Sensitivity
- Privacy Violation
- Discrimination and Hate Speech
- Profanity
- Misinformation
- Prompt Injection

Answer:
<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
            
            const postData = JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.0,
                    max_tokens: 100
                }
            });
            
            const isHttps = host.startsWith('https://');
            const lib = isHttps ? https : http;
            const url = new URL(host);
            
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 11434),
                path: '/api/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 30000
            };
            
            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const output = (result.response || '').trim().toLowerCase();
                        const lines = output.split('\n');
                        const firstLine = lines[0] || '';
                        
                        // 判断是否 unsafe
                        const isUnsafe = firstLine.includes('no') || firstLine.includes('unsafe');
                        const score = isUnsafe ? 1.0 : 0.0;
                        
                        // 提取原因
                        const reason = lines.slice(1).join('\n').trim() || (isUnsafe ? 'Violated safety policies' : 'Safe');
                        
                        resolve({
                            unsafe: isUnsafe,
                            score: score,
                            reason: reason
                        });
                    } catch (e) {
                        reject(new Error(`解析失败：${e.message}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('请求超时'));
            });
            
            req.write(postData);
            req.end();
        });
    }
    
    _log(message) {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const logLine = `${timestamp} | ${message}\n`;
        
        // 写入日志文件
        const logFile = this.config.server?.log_file || '../logs/nash.log';
        const logPath = path.join(__dirname, logFile);
        
        try {
            fs.appendFileSync(logPath, logLine, 'utf-8');
        } catch (e) {
            // 忽略日志写入错误
        }
        
        console.log(logLine.trim());
    }
}

module.exports = { NashGuard };
