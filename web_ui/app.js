/**
 * Nash Web UI - 前端逻辑
 */

const API_BASE = '';
let currentConfig = null;

// 可用的 ML 模型列表
const AVAILABLE_MODELS = [
    { id: 'martin-ha/toxic-comment-model', name: 'Toxic Comment (英文)', type: 'toxic' },
    { id: 'ProtectAI/deberta-v3-base-prompt-injection-v2', name: 'ProtectAI Prompt Injection', type: 'injection' },
    { id: 'typeform/distilbert-base-uncased-mnli', name: 'DistilBERT MNLI', type: 'general' },
];

// 检查服务状态
async function checkStatus() {
    try {
        const res = await fetch(`${API_BASE}/health`);
        const data = await res.json();
        
        document.getElementById('statusDot').classList.remove('offline');
        document.getElementById('statusText').textContent = '运行中';
        document.getElementById('statusDetails').innerHTML = `
            <div>服务：${data.service}</div>
            <div>版本：${data.version}</div>
            <div>ML 检测：${data.ml_enabled ? '✅ 已启用' : '❌ 已禁用'}</div>
            <div>端口：8768</div>
        `;
        
        await loadConfig();
    } catch (error) {
        document.getElementById('statusDot').classList.add('offline');
        document.getElementById('statusText').textContent = '离线';
        document.getElementById('statusDetails').textContent = `无法连接到服务：${error.message}`;
    }
}

// 加载配置
async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/api/config`);
        currentConfig = await res.json();
        
        renderGlobalConfig();
        renderPatternConfig();
        renderMLConfig();
        renderOllamaConfig();
        renderLayers();
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// 渲染全局配置
function renderGlobalConfig() {
    const container = document.getElementById('globalConfig');
    const cfg = currentConfig;
    
    container.innerHTML = `
        <div class="config-item">
            <label>拦截阈值</label>
            <input type="number" step="0.05" min="0" max="1" value="${cfg.thresholds?.block_threshold || 0.3}" id="blockThreshold">
        </div>
        <div class="config-item">
            <label>ML 权重</label>
            <input type="number" step="0.1" min="0" max="1" value="${cfg.ml_detection?.weight || 0.3}" id="mlWeight">
        </div>
        <div style="margin-top: 15px;">
            <button onclick="saveGlobalConfig()">保存全局配置</button>
        </div>
    `;
}

// 保存全局配置
async function saveGlobalConfig() {
    const blockThreshold = parseFloat(document.getElementById('blockThreshold').value);
    const mlWeight = parseFloat(document.getElementById('mlWeight').value);
    
    const updates = {
        thresholds: { block_threshold: blockThreshold },
        ml_detection: { weight: mlWeight }
    };
    
    await updateConfig(updates);
    alert('配置已保存！');
}

// 渲染模式匹配配置
function renderPatternConfig() {
    const container = document.getElementById('patternConfig');
    const patterns = currentConfig.risk_patterns || {};
    
    let html = '';
    for (const [category, keywords] of Object.entries(patterns)) {
        html += `
            <div class="config-section">
                <div class="layer-header">
                    <span class="layer-title">${getCategoryName(category)}</span>
                    <span class="layer-status">${keywords.length} 个关键词</span>
                </div>
                <div class="keywords-list" id="keywords-${category}">
                    ${keywords.map((kw, i) => `
                        <div class="keyword-tag">
                            ${escapeHtml(kw)}
                            <button onclick="removeKeyword('${category}', '${escapeHtml(kw).replace(/'/g, "\\'")}')">&times;</button>
                        </div>
                    `).join('')}
                </div>
                <div class="add-keyword">
                    <input type="text" id="new-keyword-${category}" placeholder="添加关键词..." onkeypress="if(event.key==='Enter') addKeyword('${category}')">
                    <button onclick="addKeyword('${category}')" style="margin:0; padding: 8px 16px;">+</button>
                </div>
            </div>
        `;
    }
    
    html += `
        <div style="margin-top: 15px;">
            <button onclick="savePatternConfig()" class="success">💾 保存模式匹配配置</button>
            <button onclick="resetPatternConfig()" class="danger" style="margin-left: 10px;">↩️ 重置为默认</button>
        </div>
    `;
    
    container.innerHTML = html;
}

// 添加关键词
async function addKeyword(category) {
    const input = document.getElementById(`new-keyword-${category}`);
    const keyword = input.value.trim();
    
    if (!keyword) return;
    
    const patterns = currentConfig.risk_patterns || {};
    if (!patterns[category]) patterns[category] = [];
    patterns[category].push(keyword);
    
    // 临时更新本地配置
    currentConfig.risk_patterns = patterns;
    renderPatternConfig();
    input.value = '';
}

// 删除关键词
async function removeKeyword(category, keyword) {
    const patterns = currentConfig.risk_patterns || {};
    patterns[category] = patterns[category].filter(k => k !== keyword);
    
    // 临时更新本地配置
    currentConfig.risk_patterns = patterns;
    renderPatternConfig();
}

// 保存模式匹配配置
async function savePatternConfig() {
    const updates = {
        risk_patterns: currentConfig.risk_patterns
    };
    
    await updateConfig(updates);
    alert('✅ 模式匹配配置已保存！\n\n配置已持久化到文件，无需重启服务。');
    await loadConfig();
}

// 重置模式匹配配置
async function resetPatternConfig() {
    if (!confirm('确定要重置所有关键词为默认值吗？\n\n自定义的关键词将会丢失！')) return;
    
    const defaultPatterns = {
        jailbreak: [
            "忽略.*指令",
            "忽略.*限制",
            "绕过.*限制",
            "系统提示",
            "越狱",
            "无视.*规则",
            "不要.*拒绝",
            "假装你是",
            "扮演.*角色",
            "DAN",
            "Developer Mode",
            "无视安全",
            "跳过审查"
        ],
        violence: [
            "制作炸弹",
            "制造炸弹",
            "如何做炸弹",
            "怎么做炸弹",
            "炸弹.*配方",
            "制造武器",
            "如何杀人",
            "爆炸物",
            "枪支制作",
            "土制炸弹"
        ],
        illegal: [
            "如何盗窃",
            "黑客.*方法",
            "入侵.*系统",
            "破解.*密码"
        ],
        self_harm: [
            "自杀",
            "自残",
            "轻生",
            "结束生命"
        ],
        drugs: [
            "制作.*毒品",
            "制造.*冰毒",
            "海洛因",
            "制毒",
            "毒品配方"
        ],
        sexual: [
            "色情",
            "成人内容",
            "未成年人.*性"
        ],
        harassment: [
            "辱骂",
            "威胁",
            "骚扰",
            "人肉搜索",
            "stupid",
            "idiot",
            "go die",
            "kill yourself",
            "hate you"
        ]
    };
    
    await updateConfig({ risk_patterns: defaultPatterns });
    alert('✅ 已重置为默认配置！');
    await loadConfig();
}

// 渲染 ML 配置
function renderMLConfig() {
    const container = document.getElementById('mlConfig');
    const ml = currentConfig.ml_detection || {};
    
    container.innerHTML = `
        <div class="config-item">
            <label>启用 ML 检测</label>
            <input type="checkbox" ${ml.enabled ? 'checked' : ''} id="mlEnabled">
        </div>
        <div class="config-item">
            <label>模型选择</label>
            <select id="mlModel">
                ${AVAILABLE_MODELS.map(m => `
                    <option value="${m.id}" ${ml.model === m.id ? 'selected' : ''}>
                        ${m.name}
                    </option>
                `).join('')}
            </select>
        </div>
        <div class="config-item">
            <label>检测阈值</label>
            <input type="number" step="0.05" min="0" max="1" value="${ml.threshold || 0.7}" id="mlThreshold">
        </div>
        <div class="layer-info">
            <div class="layer-title">模型信息</div>
            <div style="font-size: 12px; color: #aaa; margin-top: 5px;">
                当前模型：${ml.model || 'N/A'}<br>
                类型：${getModelIndex(ml.model)?.type || 'unknown'}<br>
                <span style="color: #ff9800;">注意：英文模型对中文内容可能误判</span>
            </div>
        </div>
        <div style="margin-top: 15px;">
            <button onclick="saveMLConfig()">保存 ML 配置</button>
        </div>
    `;
}

// 保存 ML 配置
async function saveMLConfig() {
    const enabled = document.getElementById('mlEnabled').checked;
    const model = document.getElementById('mlModel').value;
    const threshold = parseFloat(document.getElementById('mlThreshold').value);
    
    const updates = {
        ml_detection: { enabled, model, threshold }
    };
    
    await updateConfig(updates);
    alert('ML 配置已保存！');
    await loadConfig();
}

// 渲染 Ollama 配置
function renderOllamaConfig() {
    const container = document.getElementById('ollamaConfig');
    const ollama = currentConfig.ollama || {};
    
    container.innerHTML = `
        <div class="config-item">
            <label>启用 Ollama</label>
            <input type="checkbox" ${ollama.enabled ? 'checked' : ''} id="ollamaEnabled">
        </div>
        <div class="config-item">
            <label>模型</label>
            <input type="text" value="${ollama.model || 'llama-guard3:1b'}" id="ollamaModel">
        </div>
        <div class="config-item">
            <label>阈值</label>
            <input type="number" step="0.05" min="0" max="1" value="${ollama.threshold || 0.8}" id="ollamaThreshold">
        </div>
        <div class="config-item">
            <label>Ollama 地址</label>
            <input type="text" value="${ollama.host || 'http://localhost:11434'}" id="ollamaHost" style="width: 100%; margin-top: 5px;">
        </div>
        <div style="margin-top: 15px;">
            <button onclick="saveOllamaConfig()">保存 Ollama 配置</button>
        </div>
    `;
}

// 保存 Ollama 配置
async function saveOllamaConfig() {
    const enabled = document.getElementById('ollamaEnabled').checked;
    const model = document.getElementById('ollamaModel').value;
    const threshold = parseFloat(document.getElementById('ollamaThreshold').value);
    const host = document.getElementById('ollamaHost').value;
    
    const updates = {
        ollama: { enabled, model, threshold, host }
    };
    
    await updateConfig(updates);
    alert('Ollama 配置已保存！');
    await loadConfig();
}

// 渲染检测层
function renderLayers() {
    const container = document.getElementById('layersContainer');
    const cfg = currentConfig;
    
    const patternEnabled = Object.keys(cfg.risk_patterns || {}).length > 0;
    const mlEnabled = cfg.ml_detection?.enabled || false;
    const ollamaEnabled = cfg.ollama?.enabled || false;
    
    container.innerHTML = `
        <div class="layer-info">
            <div class="layer-header">
                <span class="layer-title">🔍 第一层：模式匹配</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #aaa;">
                        <input type="checkbox" ${patternEnabled ? 'checked' : ''} onchange="toggleLayer('pattern', this.checked)" style="width: 18px; height: 18px;">
                        启用
                    </label>
                    <button onclick="confirmPatternToggle()" style="padding: 4px 12px; font-size: 11px; margin: 0;" class="success">确认</button>
                </div>
            </div>
            <div style="font-size: 12px; color: #aaa;">
                检测类别：${Object.keys(cfg.risk_patterns || {}).length} 类<br>
                关键词总数：${Object.values(cfg.risk_patterns || {}).reduce((sum, arr) => sum + arr.length, 0)} 个
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${patternEnabled ? '100%' : '0%'}"></div>
            </div>
            ${!patternEnabled ? '<div style="margin-top: 8px; font-size: 11px; color: #ff5252;">⚠️ 此层已禁用，所有关键词将被忽略</div>' : ''}
        </div>
        
        <div class="layer-info">
            <div class="layer-header">
                <span class="layer-title">🤖 第二层：ML 模型检测</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #aaa;">
                        <input type="checkbox" ${mlEnabled ? 'checked' : ''} onchange="toggleLayer('ml', this.checked)" style="width: 18px; height: 18px;">
                        启用
                    </label>
                    <button onclick="confirmMLToggle()" style="padding: 4px 12px; font-size: 11px; margin: 0;" class="success">确认</button>
                </div>
            </div>
            <div style="font-size: 12px; color: #aaa;">
                模型：${cfg.ml_detection?.model || 'N/A'}<br>
                阈值：${cfg.ml_detection?.threshold || 0.7}<br>
                权重：${cfg.ml_detection?.weight || 0.3}
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${mlEnabled ? '100%' : '0%'}"></div>
            </div>
            ${!mlEnabled ? '<div style="margin-top: 8px; font-size: 11px; color: #ff5252;">⚠️ 此层已禁用，ML 检测将跳过</div>' : ''}
        </div>
        
        <div class="layer-info">
            <div class="layer-header">
                <span class="layer-title">🦙 第三层：Ollama Llama-Guard</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #aaa;">
                        <input type="checkbox" ${ollamaEnabled ? 'checked' : ''} onchange="toggleLayer('ollama', this.checked)" style="width: 18px; height: 18px;">
                        启用
                    </label>
                    <button onclick="confirmOllamaToggle()" style="padding: 4px 12px; font-size: 11px; margin: 0;" class="success">确认</button>
                </div>
            </div>
            <div style="font-size: 12px; color: #aaa;">
                模型：${cfg.ollama?.model || 'llama-guard3:1b'}<br>
                阈值：${cfg.ollama?.threshold || 0.8}<br>
                地址：${cfg.ollama?.host || 'http://localhost:11434'}
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${ollamaEnabled ? '100%' : '0%'}"></div>
            </div>
            ${!ollamaEnabled ? '<div style="margin-top: 8px; font-size: 11px; color: #ff5252;">⚠️ 此层已禁用，Ollama 检测将跳过</div>' : ''}
        </div>
    `;
}

// 确认模式匹配切换
async function confirmPatternToggle() {
    // 读取 Checkbox 的当前状态
    const checkbox = document.querySelector('input[type="checkbox"][onchange*="toggleLayer(\'pattern\'"]');
    const shouldBeEnabled = checkbox?.checked || false;
    
    const cfg = currentConfig;
    const currentlyEnabled = Object.keys(cfg.risk_patterns || {}).length > 0;
    
    if (shouldBeEnabled && !currentlyEnabled) {
        // 用户想启用
        if (!confirm('✅ 启用模式匹配层将恢复默认关键词。\n\n确定要启用吗？')) {
            await loadConfig(); // 恢复 checkbox 状态
            return;
        }
        await toggleLayer('pattern', true);
    } else if (!shouldBeEnabled && currentlyEnabled) {
        // 用户想禁用
        if (!confirm('⚠️ 禁用模式匹配层将移除所有关键词检测！\n\n确定要禁用吗？')) {
            await loadConfig(); // 恢复 checkbox 状态
            return;
        }
        await toggleLayer('pattern', false);
    } else {
        // 状态没有变化，提示用户
        alert(shouldBeEnabled ? '✅ 模式匹配层已经是启用状态' : '❌ 模式匹配层已经是禁用状态');
    }
}

// 确认 ML 模型切换
async function confirmMLToggle() {
    // 读取 Checkbox 的当前状态
    const checkbox = document.querySelector('input[type="checkbox"][onchange*="toggleLayer(\'ml\'"]');
    const shouldBeEnabled = checkbox?.checked || false;
    
    const cfg = currentConfig;
    const currentlyEnabled = cfg.ml_detection?.enabled || false;
    
    if (shouldBeEnabled && !currentlyEnabled) {
        // 用户想启用
        if (!confirm('✅ 启用 ML 模型检测层将启用英文有毒内容检测。\n\n确定要启用吗？')) {
            await loadConfig(); // 恢复 checkbox 状态
            return;
        }
        await toggleLayer('ml', true);
    } else if (!shouldBeEnabled && currentlyEnabled) {
        // 用户想禁用
        if (!confirm('⚠️ 禁用 ML 模型检测层将跳过英文内容检测。\n\n确定要禁用吗？')) {
            await loadConfig(); // 恢复 checkbox 状态
            return;
        }
        await toggleLayer('ml', false);
    } else {
        // 状态没有变化，提示用户
        alert(shouldBeEnabled ? '✅ ML 模型检测层已经是启用状态' : '❌ ML 模型检测层已经是禁用状态');
    }
}

// 确认 Ollama 切换
async function confirmOllamaToggle() {
    // 读取 Checkbox 的当前状态
    const checkbox = document.querySelector('input[type="checkbox"][onchange*="toggleLayer(\'ollama\'"]');
    const shouldBeEnabled = checkbox?.checked || false;
    
    const cfg = currentConfig;
    const currentlyEnabled = cfg.ollama?.enabled || false;
    
    if (shouldBeEnabled && !currentlyEnabled) {
        // 用户想启用
        if (!confirm('✅ 启用 Ollama Llama-Guard 层将启用第三层防护（需要 Ollama 服务运行）。\n\n确定要启用吗？')) {
            await loadConfig(); // 恢复 checkbox 状态
            return;
        }
        await toggleLayer('ollama', true);
    } else if (!shouldBeEnabled && currentlyEnabled) {
        // 用户想禁用
        if (!confirm('⚠️ 禁用 Ollama Llama-Guard 层将跳过第三层检测。\n\n确定要禁用吗？')) {
            await loadConfig(); // 恢复 checkbox 状态
            return;
        }
        await toggleLayer('ollama', false);
    } else {
        // 状态没有变化，提示用户
        alert(shouldBeEnabled ? '✅ Ollama Llama-Guard 层已经是启用状态' : '❌ Ollama Llama-Guard 层已经是禁用状态');
    }
}

// 切换层启用状态
async function toggleLayer(layer, enabled) {
    let updates = {};
    
    if (layer === 'pattern') {
        // 模式匹配层：通过清空关键词来禁用
        if (!enabled) {
            updates = { risk_patterns: {} };
        } else {
            // 恢复默认模式
            const defaultPatterns = {
                jailbreak: ["忽略.*指令", "忽略.*限制", "绕过.*限制", "系统提示", "越狱"],
                violence: ["制作炸弹", "制造武器", "如何杀人"],
                illegal: ["如何盗窃", "黑客.*方法", "入侵.*系统"],
                self_harm: ["自杀", "自残", "轻生"],
                drugs: ["制作.*毒品", "海洛因", "制毒"],
                sexual: ["色情", "成人内容"],
                harassment: ["辱骂", "威胁", "stupid", "idiot"]
            };
            updates = { risk_patterns: defaultPatterns };
        }
    } else if (layer === 'ml') {
        updates = { ml_detection: { ...currentConfig.ml_detection, enabled } };
    } else if (layer === 'ollama') {
        updates = { ollama: { ...currentConfig.ollama, enabled } };
    }
    
    await updateConfig(updates);
    await loadConfig();
    
    const status = enabled ? '✅ 已启用' : '❌ 已禁用';
    const layerNames = { pattern: '模式匹配', ml: 'ML 模型', ollama: 'Ollama' };
    console.log(`${layerNames[layer]} ${status}`);
}

// 更新配置
async function updateConfig(updates) {
    try {
        const res = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        const result = await res.json();
        if (!result.success) {
            throw new Error(result.error || '保存失败');
        }
    } catch (error) {
        alert('保存失败：' + error.message);
    }
}

// 测试检测
async function testCheck() {
    const input = document.getElementById('testInput');
    const resultDiv = document.getElementById('testResult');
    const content = input.value.trim();
    
    if (!content) {
        resultDiv.innerHTML = '<div class="result blocked">请输入要测试的内容</div>';
        return;
    }
    
    resultDiv.innerHTML = '<div style="color: #aaa;">检测中...</div>';
    
    try {
        const res = await fetch(`${API_BASE}/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: 'webui-test',
                content: content
            })
        });
        
        const result = await res.json();
        
        if (result.blocked) {
            resultDiv.innerHTML = `
                <div class="result blocked">
                    <strong>🚫 已拦截</strong><br>
                    风险分数：${result.risk_score}<br>
                    检测方法：${getMethodName(result.detection_method)}<br>
                    匹配类别：${result.matched_categories?.join(', ') || 'N/A'}
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="result safe">
                    <strong>✅ 放行</strong><br>
                    风险分数：${result.risk_score}<br>
                    检测方法：${getMethodName(result.detection_method)}
                </div>
            `;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="result blocked">检测失败：${error.message}</div>`;
    }
}

// 加载日志
async function loadLogs() {
    try {
        const res = await fetch(`${API_BASE}/api/logs?limit=50`);
        const logs = await res.json();
        
        const container = document.getElementById('logContainer');
        
        if (logs.length === 0) {
            container.innerHTML = '<div style="color: #888;">暂无日志</div>';
            return;
        }
        
        container.innerHTML = logs.map(log => {
            const isBlocked = log.includes('阻止') || log.includes('🚫');
            const isSafe = log.includes('放行') || log.includes('✅');
            const className = isBlocked ? 'blocked' : (isSafe ? 'safe' : '');
            return `<div class="log-entry ${className}">${escapeHtml(log)}</div>`;
        }).join('');
    } catch (error) {
        document.getElementById('logContainer').innerHTML = `<div style="color: #ff5252;">加载失败：${error.message}</div>`;
    }
}

// 加载拦截日志
async function loadBlockedLogs() {
    try {
        const res = await fetch(`${API_BASE}/api/blocked-logs?limit=50`);
        const logs = await res.json();
        
        const container = document.getElementById('blockedLogContainer');
        
        if (logs.length === 0) {
            container.innerHTML = '<div style="color: #888;">暂无拦截记录</div>';
            return;
        }
        
        container.innerHTML = logs.map(log => {
            const layerInfo = getLayerInfo(log.blocked_by);
            const methodBadge = getMethodBadge(log.detection_method);
            const time = new Date(log.timestamp).toLocaleString('zh-CN');
            
            return `
                <div class="log-entry blocked" style="margin-bottom: 10px; padding: 10px; background: rgba(255, 82, 82, 0.1); border-radius: 8px; border-left: 4px solid ${layerInfo.color};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="color: #aaa; font-size: 11px;">${time}</span>
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <span style="font-size: 11px; color: ${layerInfo.color}; font-weight: 600;">${layerInfo.icon} ${layerInfo.name}</span>
                            ${methodBadge}
                        </div>
                    </div>
                    <div style="font-size: 13px; margin-bottom: 8px;">
                        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 5px;">
                            <span><strong>用户：</strong>${escapeHtml(log.user_id)}</span>
                            <span><strong>类别：</strong><span style="color: ${layerInfo.color};">${escapeHtml(log.category)}</span></span>
                            <span><strong>分数：</strong><span style="color: ${getScoreColor(log.risk_score)}">${log.risk_score}</span></span>
                        </div>
                    </div>
                    <div style="font-size: 12px; color: #ff8a8a; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; font-family: monospace;">
                        ${escapeHtml(log.content_preview)}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        document.getElementById('blockedLogContainer').innerHTML = `<div style="color: #ff5252;">加载失败：${error.message}</div>`;
    }
}

// 获取层信息
function getLayerInfo(blockedBy) {
    if (!blockedBy) {
        return { name: '未知', color: '#666', icon: '❓' };
    }
    
    const layers = {
        1: { name: '模式匹配', color: '#2196f3', icon: '🔵' },
        2: { name: 'ML 模型', color: '#9c27b0', icon: '🟣' },
        3: { name: 'Ollama', color: '#ff9800', icon: '🟠' }
    };
    
    // 也支持按名称查找
    const byName = {
        '模式匹配': { name: '模式匹配', color: '#2196f3', icon: '🔵' },
        'ML 模型': { name: 'ML 模型', color: '#9c27b0', icon: '🟣' },
        'Ollama': { name: 'Ollama', color: '#ff9800', icon: '🟠' },
        'pattern': { name: '模式匹配', color: '#2196f3', icon: '🔵' },
        'ml': { name: 'ML 模型', color: '#9c27b0', icon: '🟣' },
        'ollama': { name: 'Ollama', color: '#ff9800', icon: '🟠' }
    };
    
    // 优先使用 layer 数字
    if (blockedBy.layer && layers[blockedBy.layer]) {
        return layers[blockedBy.layer];
    }
    
    // 否则使用名称
    const name = blockedBy.name || blockedBy.category || 'unknown';
    return byName[name] || { name: name, color: '#666', icon: '⚪' };
}

// 获取分数颜色
function getScoreColor(score) {
    if (score >= 0.8) return '#ff5252'; // 高风险 - 红色
    if (score >= 0.5) return '#ff9800'; // 中风险 - 橙色
    if (score >= 0.3) return '#ffeb3b'; // 低风险 - 黄色
    return '#00ff7f'; // 极低 - 绿色
}

// 清空拦截日志
async function clearBlockedLogs() {
    if (!confirm('确定要清空所有拦截日志吗？')) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/blocked-logs`, { method: 'DELETE' });
        await loadBlockedLogs();
        alert('拦截日志已清空');
    } catch (error) {
        alert('清空失败：' + error.message);
    }
}

// 检测方法徽章
function getMethodBadge(method) {
    const colors = {
        pattern: '#2196f3',
        ml: '#9c27b0',
        ollama: '#ff9800',
        none: '#666'
    };
    const names = {
        pattern: '模式匹配',
        ml: 'ML 模型',
        ollama: 'Ollama',
        none: '无'
    };
    const color = colors[method] || '#666';
    const name = names[method] || method;
    return `<span class="badge" style="background: ${color};">${name}</span>`;
}

// 辅助函数
function getCategoryName(cat) {
    const names = {
        jailbreak: '越狱攻击',
        violence: '暴力内容',
        illegal: '违法行为',
        self_harm: '自残自杀',
        drugs: '毒品相关',
        sexual: '色情内容',
        harassment: '骚扰辱骂'
    };
    return names[cat] || cat;
}

function getMethodName(method) {
    const names = {
        pattern: '模式匹配',
        ml: 'ML 模型',
        ollama: 'Ollama',
        none: '无'
    };
    return names[method] || method;
}

function getModelIndex(modelId) {
    return AVAILABLE_MODELS.find(m => m.id === modelId);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    checkStatus();
    loadLogs();
    loadBlockedLogs(); // 添加：自动加载拦截日志
    
    // 每 30 秒刷新状态
    setInterval(checkStatus, 30000);
    // 每 60 秒刷新日志
    setInterval(() => {
        loadLogs();
        loadBlockedLogs();
    }, 60000);
});
