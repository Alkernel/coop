const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>COOP Admin Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0a0a0a;--bg-card:#141414;--bg-input:#1a1a1a;--border:#2a2a2a;--text:#fff;--text-secondary:#a0a0a0;--text-tertiary:#666;--accent:#fff;--accent-green:#22c55e;--accent-green-bg:rgba(34,197,94,.12);--accent-red:#ef4444;--accent-red-bg:rgba(239,68,68,.12);--font-sans:'Plus Jakarta Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--font-sans);background:var(--bg);color:var(--text);min-height:100vh;padding:24px}
    .container{max-width:640px;margin:0 auto}
    .header{display:flex;align-items:center;gap:12px;padding:12px 0 24px 0}
    .header h1{font-size:22px;font-weight:800;letter-spacing:.5px}
    .header p{font-size:13px;color:var(--text-secondary);font-weight:500}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px}
    .card-title{font-size:12px;font-weight:800;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:12px;text-transform:uppercase}
    label{display:block;font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px}
    input[type=text],input[type=password],input[type=number],textarea{width:100%;padding:10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font-sans);font-size:14px;outline:0;transition:border-color .2s}
    input:focus,textarea:focus{border-color:var(--accent)}
    textarea{font-family:var(--font-mono);font-size:12px;resize:vertical}
    .field{margin-bottom:14px}
    .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0}
    .toggle-row label{margin-bottom:0;cursor:pointer}
    .toggle{position:relative;width:44px;height:24px;background:var(--border);border-radius:12px;cursor:pointer;transition:background .2s}
    .toggle.active{background:var(--accent-green)}
    .toggle::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .2s}
    .toggle.active::after{transform:translateX(20px)}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:var(--accent);color:var(--bg);border:0;border-radius:12px;font-family:var(--font-sans);font-size:14px;font-weight:700;cursor:pointer;transition:opacity .2s}
    .btn:hover{opacity:.9}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn-secondary{background:var(--bg-input);color:var(--text);border:1px solid var(--border)}
    .msg{padding:10px 14px;border-radius:12px;font-size:13px;margin-top:16px;display:none;align-items:center;gap:8px}
    .msg-error{background:var(--accent-red-bg);color:var(--accent-red)}
    .msg-success{background:var(--accent-green-bg);color:var(--accent-green)}
    .btn-row{display:flex;gap:12px;margin-top:20px}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><div><h1>COOP Admin</h1><p>System configuration</p></div></div>
    <div id="login-section" class="card">
      <div class="card-title">Admin Authentication</div>
      <div class="field"><label>Admin Key</label><input type="password" id="admin-key" placeholder="Enter admin key..."/></div>
      <button class="btn" id="login-btn" onclick="authenticate()">Unlock</button>
      <div id="login-msg" class="msg"></div>
    </div>
    <div id="settings-section" style="display:none">