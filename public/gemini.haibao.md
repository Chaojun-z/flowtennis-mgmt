<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>网球兄弟 - 反馈海报预览</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .canvas-container {
      width: 100%;
      max-width: 375px;
      margin: 0 auto;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    canvas {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 750 / 1334;
    }
    .btn-scroll::-webkit-scrollbar { height: 6px; }
    .btn-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen py-8 text-gray-800">

  <div class="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
      <h1 class="text-lg font-bold text-gray-800">生成课后海报</h1>
      <span class="text-xs text-gray-500">10款 顶级视觉库</span>
    </div>

    <div class="p-6 bg-gray-200">
      <div class="canvas-container">
        <canvas id="posterCanvas" width="750" height="1334"></canvas>
      </div>
    </div>

    <div class="p-6">
      <h3 class="text-sm font-semibold text-gray-500 mb-3">选择海报风格 (左右滑动)</h3>
      <div class="flex overflow-x-auto gap-3 pb-4 btn-scroll" id="templateButtons">
        <!-- 按钮由 JS 动态生成 -->
      </div>
      
      <div class="mt-4">
        <button id="downloadBtn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition shadow-md flex justify-center items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          保存高清海报 (模拟)
        </button>
      </div>
    </div>
  </div>

  <script>
    // ==========================================
    // 1. 核心数据与代码 (保留的 10 款顶级视觉)
    // ==========================================
    
    const FEEDBACK_POSTER_TEMPLATES = {
      blueGreenDiagonal: { 
        name: '蓝绿对角', type: 'diagonalSplit', bg1: '#1F4287', bg2: '#278EA5', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.7)', accent: '#BCE84A', soft: 'rgba(255,255,255,0.08)'
      },
      minimalDarkGreen: { 
        name: '极简墨绿', type: 'cleanSilhouette', bg1: '#F4F6F8', bg2: '#F4F6F8', ink: '#143D30', muted: '#76948A', accent: '#8DC63F', soft: '#FFFFFF'
      },
      neonBrush: { 
        name: '粉蓝笔刷', type: 'brushSplash', bg1: '#11183B', bg2: '#11183B', ink: '#FFFFFF', muted: '#A0A5B5', accent: '#F93972', soft: 'rgba(255,255,255,0.06)'
      },
      flatPopBlue: { 
        name: '深蓝撞色', type: 'flatPopBlue', bg1: '#1D5FD6', bg2: '#1D5FD6', ink: '#FFFFFF', muted: '#93B9F9', accent: '#C7F000', soft: '#1241A1'
      },
      retroCourt: { 
        name: '对角球场', type: 'split', bg1: '#1E3D33', bg2: '#B35432', ink: '#1E3D33', muted: '#6D827A', accent: '#B35432', soft: '#F9F8F6'
      },
      blueprintBlue: { 
        name: '线框蓝图', type: 'wireframe', bg1: '#12355B', bg2: '#0D2744', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.6)', accent: '#D4F02E', soft: 'rgba(0,0,0,0.3)'
      },
      dynamicSmash: { 
        name: '波普斜切', type: 'popart', bg1: '#819873', bg2: '#819873', ink: '#111111', muted: '#444444', accent: '#C13E27', soft: '#FFFFFF'
      },
      minimalRacket: { 
        name: '极简白框', type: 'minimal', bg1: '#2F74B4', bg2: '#2F74B4', ink: '#12355B', muted: '#82A9CE', accent: '#D4F02E', soft: 'rgba(255,255,255,0.95)'
      },
      proWhite: { 
        name: '专业白(拍网)', type: 'magazine', bg1: '#FFFFFF', bg2: '#F8FAFC', ink: '#0F172A', muted: '#94A3B8', accent: '#000000', soft: 'transparent'
      },
      activeGreen: { 
        name: '活力绿(缝线)', type: 'sport', bg1: '#064E3B', bg2: '#022C22', ink: '#F8FAFC', muted: '#6EE7B7', accent: '#10B981', soft: 'rgba(255,255,255,0.08)'
      }
    };

    function posterRoundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function posterTextLines(ctx, text, maxWidth, maxLines) {
      const lines = [];
      String(text || '—').split('\n').forEach(part => {
        let line = '';
        Array.from(part || ' ').forEach(ch => {
          const next = line + ch;
          if (ctx.measureText(next).width > maxWidth && line) {
            lines.push(line);
            line = ch;
          } else {
            line = next;
          }
        });
        lines.push(line);
      });

      if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        while (kept[kept.length - 1] && ctx.measureText(kept[kept.length - 1] + '…').width > maxWidth) {
          kept[kept.length - 1] = kept[kept.length - 1].slice(0, - 1);
        }
        kept[kept.length - 1] = (kept[kept.length - 1] || '').replace(/[，。；、\s]*$/, '') + '…';
        return kept;
      }
      return lines;
    }

    // 核心渲染引擎：处理 10 种样式
    function posterDrawTextBlock(ctx, tpl, label, text, x, y, w, maxLines) {
      const headerColor = tpl.accent;
      const textColor = tpl.ink;
      
      ctx.font = '400 30px "PingFang SC", "Microsoft YaHei", sans-serif'; 
      const lines = posterTextLines(ctx, text, w, maxLines);
      
      const paddingTop = 32;
      const paddingBottom = 54; 
      const titleSpace = 48;    
      const lineHeight = 46;    
      const contentHeight = (lines.length > 0 ? lines.length - 1 : 0) * lineHeight;
      const boxHeight = paddingTop + titleSpace + contentHeight + paddingBottom;
      const boxY = y - paddingTop - 24; 
      
      ctx.save();
      
      // ===== 底框样式绘制 =====
      if (tpl.type === 'diagonalSplit') {
        posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 16);
        ctx.fillStyle = tpl.soft; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (tpl.type === 'cleanSilhouette') {
        ctx.shadowColor = 'rgba(20, 61, 48, 0.08)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 8;
        posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 16);
        ctx.fillStyle = tpl.soft; ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(20, 61, 48, 0.1)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (tpl.type === 'brushSplash') {
        ctx.save();
        posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 12);
        ctx.fillStyle = tpl.soft; ctx.fill(); ctx.clip();
        ctx.fillStyle = tpl.accent; ctx.fillRect(x - 20, boxY, 8, boxHeight);
        ctx.restore();
      } else if (tpl.type === 'flatPopBlue') {
        ctx.shadowColor = '#0A2E7A'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 6;
        posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 0); 
        ctx.fillStyle = tpl.soft; ctx.fill();
        ctx.shadowColor = 'transparent'; 
      } else if (tpl.type === 'split' || tpl.type === 'minimal') {
        if (tpl.type === 'split') {
          ctx.shadowColor = 'rgba(0,0,0,0.1)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
        }
        posterRoundRect(ctx, x - 30, boxY, w + 60, boxHeight, 16);
        ctx.fillStyle = tpl.soft; ctx.fill();
        ctx.shadowColor = 'transparent';
      } else if (tpl.type === 'wireframe') {
        posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 12);
        ctx.fillStyle = tpl.soft; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (tpl.type === 'popart') {
        ctx.fillStyle = '#111111'; posterRoundRect(ctx, x - 20 + 8, boxY + 8, w + 40, boxHeight, 6); ctx.fill();
        ctx.fillStyle = tpl.soft; posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 6); ctx.fill();
        ctx.strokeStyle = '#111111'; ctx.lineWidth = 4; ctx.stroke();
      } else if (tpl.type === 'sport') {
        ctx.save();
        posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 12);
        ctx.fillStyle = tpl.soft; ctx.fill(); ctx.clip();
        ctx.fillStyle = tpl.accent; ctx.fillRect(x - 20, boxY, 8, boxHeight);
        ctx.restore();
      } else if (tpl.type === 'magazine') {
        ctx.fillStyle = tpl.ink; ctx.fillRect(x - 24, y - 22, 4, boxHeight - paddingTop + 4);
      }

      // ===== 绘制文字 =====
      let actualHeaderColor = headerColor;
      
      ctx.fillStyle = actualHeaderColor;
      ctx.font = '800 22px "PingFang SC", "Microsoft YaHei", sans-serif'; 
      ctx.fillText(label, x, y);

      ctx.fillStyle = textColor;
      ctx.font = '400 30px "PingFang SC", "Microsoft YaHei", sans-serif'; 
      lines.forEach((line, i) => ctx.fillText(line, x, y + titleSpace + i * lineHeight));

      ctx.restore();

      return boxHeight + 28; 
    }

    // 主绘制函数
    function drawFeedbackPoster(canvas, data, templateKey = 'flatPopBlue') {
      const tpl = FEEDBACK_POSTER_TEMPLATES[templateKey] || FEEDBACK_POSTER_TEMPLATES.flatPopBlue;
      const ctx = canvas.getContext('2d');

      canvas.width = 750;
      canvas.height = 1334;
      
      // 1. 背景绘制
      const grad = ctx.createLinearGradient(0, 0, 0, 1334);
      grad.addColorStop(0, tpl.bg1);
      grad.addColorStop(1, tpl.bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 750, 1334);

      // 2. 注入顶级背景图形装饰 (共 10 种风格)
      ctx.save();
      if (tpl.type === 'diagonalSplit') {
        ctx.fillStyle = tpl.accent; 
        ctx.beginPath(); ctx.moveTo(0, 950); ctx.lineTo(750, 1100); ctx.lineTo(750, 1334); ctx.lineTo(0, 1334); ctx.fill();
        ctx.strokeStyle = '#4A8DB7'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.ellipse(650, 450, 160, 220, Math.PI/5, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(560, 630); ctx.lineTo(460, 830); ctx.stroke(); 
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(74, 141, 183, 0.4)';
        for(let i=500; i<800; i+=25) { ctx.beginPath(); ctx.moveTo(i, 200); ctx.lineTo(i-100, 700); ctx.stroke(); }
      } else if (tpl.type === 'cleanSilhouette') {
        ctx.strokeStyle = tpl.ink; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.ellipse(650, 1150, 200, 260, -Math.PI/6, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(550, 1350); ctx.lineTo(450, 1550); ctx.stroke(); 
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(20, 61, 48, 0.3)';
        for(let i=500; i<900; i+=20) { ctx.beginPath(); ctx.moveTo(i, 900); ctx.lineTo(i-150, 1400); ctx.stroke(); }
        for(let i=900; i<1400; i+=20) { ctx.beginPath(); ctx.moveTo(400, i); ctx.lineTo(900, i-150); ctx.stroke(); }
        ctx.fillStyle = tpl.accent; ctx.beginPath(); ctx.arc(150, 1100, 45, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(120, 1100, 30, -Math.PI/3, Math.PI/3); ctx.stroke();
      } else if (tpl.type === 'brushSplash') {
        ctx.lineCap = 'round'; ctx.lineWidth = 80;
        ctx.strokeStyle = tpl.accent; 
        ctx.beginPath(); ctx.moveTo(-50, 180); ctx.quadraticCurveTo(300, 300, 500, 80); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; 
        ctx.beginPath(); ctx.moveTo(-30, 80); ctx.quadraticCurveTo(350, 200, 600, -50); ctx.stroke();
        ctx.strokeStyle = '#00A8CC'; 
        ctx.beginPath(); ctx.moveTo(800, 1200); ctx.quadraticCurveTo(500, 1150, 300, 1350); ctx.stroke();
        ctx.lineWidth = 8; ctx.strokeStyle = '#00A8CC';
        ctx.beginPath(); ctx.ellipse(180, 480, 110, 150, Math.PI/4, 0, Math.PI*2); ctx.stroke();
        ctx.strokeStyle = '#FF9D00';
        ctx.beginPath(); ctx.ellipse(650, 750, 130, 170, -Math.PI/6, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#A3D953'; ctx.beginPath(); ctx.arc(380, 650, 40, 0, Math.PI*2); ctx.fill();
      } else if (tpl.type === 'flatPopBlue') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(520, 0, 14, 1334); 
        ctx.fillRect(0, 900, 750, 14);  
        
        ctx.shadowColor = '#0A2E7A'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 8; ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.ellipse(640, 1120, 110, 140, Math.PI/5, 0, Math.PI*2); ctx.fill();
        ctx.fillRect(520, 1220, 30, 150); 
        ctx.fillStyle = tpl.accent;
        ctx.beginPath(); ctx.arc(120, 180, 35, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(680, 750, 25, 0, Math.PI*2); ctx.fill();
        ctx.shadowColor = 'transparent'; 
      } else if (tpl.type === 'split') {
        ctx.fillStyle = tpl.bg2; ctx.beginPath(); ctx.moveTo(0, 1334); ctx.lineTo(750, 1334); ctx.lineTo(750, 450); ctx.lineTo(0, 950); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(-50, 983); ctx.lineTo(800, 416); ctx.stroke();
        ctx.fillStyle = '#D4F02E'; ctx.beginPath(); ctx.arc(580, 430, 70, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(540, 430, 40, -Math.PI/2, Math.PI/2); ctx.stroke();
      } else if (tpl.type === 'wireframe') {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2;
        for(let i=0; i<750; i+=40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1334); ctx.stroke(); }
        for(let i=0; i<1334; i+=40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(750, i); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(600, 300, 220, 280, Math.PI*0.1, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(500, 560); ctx.lineTo(300, 1000); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(560, 580); ctx.lineTo(360, 1030); ctx.stroke();
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetX = 10; ctx.shadowOffsetY = 10;
        ctx.fillStyle = tpl.accent; ctx.beginPath(); ctx.arc(480, 380, 50, 0, Math.PI*2); ctx.fill();
      } else if (tpl.type === 'popart') {
        ctx.fillStyle = tpl.accent; 
        ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(750, 0); ctx.lineTo(750, 500); ctx.lineTo(0, 1334); ctx.lineTo(0, 800); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.font = '900 240px -apple-system,BlinkMacSystemFont,sans-serif';
        ctx.fillText('TENNIS', -20, 220); ctx.fillText('WINNER', 10, 1280);
      } else if (tpl.type === 'minimal') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.ellipse(375, 450, 280, 350, 0, 0, Math.PI*2); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        for(let i=120; i<650; i+=40) { ctx.beginPath(); ctx.moveTo(i, 110); ctx.lineTo(i, 790); ctx.stroke(); }
        for(let i=120; i<800; i+=40) { ctx.beginPath(); ctx.moveTo(110, i); ctx.lineTo(640, i); ctx.stroke(); }
        ctx.fillStyle = tpl.accent; ctx.beginPath(); ctx.arc(375, 200, 55, 0, Math.PI*2); ctx.fill();
      } else if (tpl.type === 'magazine') {
        ctx.strokeStyle = 'rgba(0,0,0,0.02)'; ctx.lineWidth = 1;
        for(let i=0; i<750; i+=30) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,1334); ctx.stroke(); }
        for(let i=0; i<1334; i+=30) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(750,i); ctx.stroke(); }
        ctx.fillStyle = 'rgba(0,0,0,0.02)'; ctx.font = '900 180px -apple-system,BlinkMacSystemFont,sans-serif';
        ctx.fillText('TENNIS', -10, 220); ctx.fillText('REPORT', 140, 1260);
      } else if (tpl.type === 'sport') {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(750, 1000, 450, Math.PI, Math.PI * 1.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 300, 400, 0, Math.PI * 0.5); ctx.stroke();
      }
      ctx.restore();

      // 3. 绘制顶部信息区 (带特效文字处理)
      if (tpl.type === 'popart') {
        ctx.fillStyle = tpl.muted;
        ctx.font = '900 34px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
        ctx.fillText('网球兄弟', 60 + 4, 90 + 4);
      }
      
      if (tpl.type === 'flatPopBlue') {
        ctx.save();
        ctx.shadowColor = '#0A2E7A'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5;
      }
      
      ctx.fillStyle = tpl.ink;
      if(tpl.type === 'cleanSilhouette') ctx.fillStyle = tpl.accent; 
      ctx.font = '900 34px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      ctx.fillText('网球兄弟', 60, 90);

      ctx.fillStyle = (tpl.type === 'wireframe') ? tpl.soft : tpl.muted;
      ctx.font = '600 20px -apple-system,BlinkMacSystemFont,sans-serif';
      ctx.letterSpacing = '2px';
      ctx.fillText('TRAINING REPORT', 60, 125);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = tpl.ink;
      ctx.font = '900 68px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(data.studentName, 60, 240);
      
      if (tpl.type === 'flatPopBlue') ctx.restore(); 

      ctx.fillStyle = tpl.accent;
      if(tpl.type === 'cleanSilhouette') ctx.fillStyle = tpl.muted;
      ctx.font = '700 26px -apple-system,BlinkMacSystemFont,sans-serif';
      ctx.fillText(data.date, 60, 290);

      if (!['sport', 'popart', 'flatPopBlue', 'diagonalSplit'].includes(tpl.type)) {
        ctx.fillStyle = tpl.muted; ctx.globalAlpha = 0.3; ctx.fillRect(60, 330, 630, 2); ctx.globalAlpha = 1;
      }

      // 4. 绘制三大核心反馈内容
      let currentY = 410; 
      const contentWidth = 570;
      
      const h1 = posterDrawTextBlock(ctx, tpl, '今天练习了', data.practicedToday, 90, currentY, contentWidth, 4);
      currentY += h1;
      const h2 = posterDrawTextBlock(ctx, tpl, '知识点', data.knowledgePoint, 90, currentY, contentWidth, 5);
      currentY += h2;
      posterDrawTextBlock(ctx, tpl, '下节课我们训练', data.nextTraining, 90, currentY, contentWidth, 4);

      // 5. 绘制底部教练落款
      ctx.fillStyle = (tpl.type === 'wireframe') ? tpl.soft : tpl.muted;
      ctx.font = '500 24px -apple-system,BlinkMacSystemFont,sans-serif';
      ctx.fillText(`Coach`, 60, 1220);
      
      ctx.fillStyle = tpl.ink;
      ctx.font = '900 36px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(data.coach, 60, 1265);

      // 右下角装饰点缀
      ctx.save();
      ctx.fillStyle = tpl.accent;
      if (tpl.type === 'sport' || tpl.type === 'brushSplash') {
        ctx.beginPath(); ctx.moveTo(630, 1265); ctx.lineTo(690, 1265); ctx.lineTo(670, 1235); ctx.fill();
      } else if (tpl.type === 'magazine') {
        ctx.fillRect(640, 1255, 50, 6);
      } else if (tpl.type === 'popart' || tpl.type === 'flatPopBlue') {
        ctx.fillRect(650, 1245, 16, 16);
      } else {
        ctx.beginPath(); ctx.arc(670, 1255, 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ==========================================
    // 2. 预览页面的交互逻辑 (横向滑动选择器)
    // ==========================================
    
    const mockFeedbackData = {
      studentName: "李小明",
      date: "2026.04.18",
      practicedToday: "正手底线击球稳定性练习",
      knowledgePoint: "正手击球时，务必注意非持拍手的平衡与指引，身体重心要伴随挥拍从后脚自然转移到前脚。网前截击不要主动发力切削，而是用身体迎球并固定拍面阻挡。跑动中务必保持小碎步调整。", 
      nextTraining: "强化反手双反击球发力机制\n全场跑动中的正反手结合",
      coach: "张教练"
    };

    let currentTemplateKey = 'blueGreenDiagonal'; 
    const canvas = document.getElementById('posterCanvas');
    const buttonContainer = document.getElementById('templateButtons');

    function renderButtons() {
      buttonContainer.innerHTML = '';
      Object.keys(FEEDBACK_POSTER_TEMPLATES).forEach(key => {
        const tpl = FEEDBACK_POSTER_TEMPLATES[key];
        const isActive = currentTemplateKey === key;
        
        const btn = document.createElement('button');
        btn.className = `flex-shrink-0 w-24 p-2 rounded-xl border-2 text-xs font-semibold transition-all flex flex-col items-center justify-center ${
          isActive 
            ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' 
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`;
        
        btn.innerHTML = `
          <div class="w-full h-12 rounded mb-1 shadow-inner border border-gray-100 relative overflow-hidden" style="background: linear-gradient(135deg, ${tpl.bg1}, ${tpl.bg2})"></div>
          ${tpl.name}
        `;
        
        btn.onclick = () => {
          currentTemplateKey = key;
          renderButtons();
          drawFeedbackPoster(canvas, mockFeedbackData, key);
        };
        
        buttonContainer.appendChild(btn);
      });
    }

    document.getElementById('downloadBtn').addEventListener('click', () => {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `网球兄弟-训练反馈-${mockFeedbackData.studentName}.png`;
      link.href = dataUrl;
      link.click();
    });

    window.onload = () => {
      renderButtons();
      setTimeout(() => {
        drawFeedbackPoster(canvas, mockFeedbackData, currentTemplateKey);
      }, 50);
    };

  </script>
</body>
</html>